import { err, ok, type Result } from "@next-build/result";
import { and, eq, inArray } from "drizzle-orm";

import type { Db } from "./client";
import type { Logger } from "./logger";
import type { PermissionCode, ProjectRoleCode, RoleCode, SiteRoleCode } from "./permissions";
import { permissions, projectMembers, rolePermissions, roles, userSiteRoles, users } from "./schema";
import type { DbError } from "./auth-store";

export interface Role {
  id: string;
  code: RoleCode;
  scope: "site" | "project";
  name: string;
  builtIn: boolean;
}

/** 项目成员：权限判定的唯一依据（docs/architecture-rbac-menu.md §2）。 */
export interface ProjectMember {
  projectId: string;
  userId: string;
  role: ProjectRoleCode;
  addedAt: Date;
}

/** 用户及其整站角色（管理后台用户列表用）。 */
export interface UserWithRoles {
  id: string;
  feishuOpenId: string;
  name: string;
  avatarUrl: string | null;
  siteRole: SiteRoleCode | null;
  lastLoginAt: Date;
}

/** 角色及其权限码集合（角色与权限管理页用）。 */
export interface RoleWithPermissions extends Role {
  permissions: PermissionCode[];
}

/** 一个项目内的角色与该角色解析出的权限码。 */
export interface ProjectPermissions {
  projectId: string;
  role: ProjectRoleCode;
  permissions: PermissionCode[];
}

/**
 * 一次请求解析一次的用户权限全集（authGuard 放进 Hono context，中间件与用例共用）：
 * 整站角色权限 + 各项目角色权限；有效权限 = 两者并集，admin 短路在 domains/iam/access.ts 判定。
 */
export interface UserPermissions {
  userId: string;
  siteRole: SiteRoleCode | null;
  sitePermissions: PermissionCode[];
  projects: ProjectPermissions[];
}

export interface IamStore {
  /** 用户的整站角色 code；未分配返回 null。 */
  getSiteRole(userId: string): Promise<Result<SiteRoleCode | null, DbError>>;
  /** 用户在项目内的角色 code；不是成员返回 null。 */
  getProjectRole(userId: string, projectId: string): Promise<Result<ProjectRoleCode | null, DbError>>;
  /** 用户权限全集：整站角色权限 + 各项目角色权限（均从库内映射解析）。 */
  getPermissionsForUser(userId: string): Promise<Result<UserPermissions, DbError>>;
  /** 分配整站角色（一人一个，重复分配即改角色）。 */
  assignSiteRole(userId: string, role: SiteRoleCode): Promise<Result<void, DbError>>;
  /** 引导规则（docs/architecture-rbac-menu.md §2）：用户无整站角色时分配 site:admin（默认登录即全权限）；已有角色原样返回。 */
  ensureSiteRole(userId: string): Promise<Result<SiteRoleCode, DbError>>;
  /** 写入/改角色项目成员（幂等 upsert）；成员是否存在由用例先行判定（MEMBER_EXISTS / MEMBER_NOT_FOUND）。 */
  upsertProjectMember(input: {
    projectId: string;
    userId: string;
    role: ProjectRoleCode;
  }): Promise<Result<void, DbError>>;
  removeProjectMember(projectId: string, userId: string): Promise<Result<void, DbError>>;
  /** 项目全部成员（LAST_OWNER 保护计数用）。 */
  listProjectMembers(projectId: string): Promise<Result<ProjectMember[], DbError>>;
  /** 全部用户及其整站角色，按注册时间升序。 */
  listUsersWithRoles(): Promise<Result<UserWithRoles[], DbError>>;
  /** 全部角色及其权限码集合（角色与权限管理页用）。 */
  listRolesWithPermissions(): Promise<Result<RoleWithPermissions[], DbError>>;
  /** 按角色全量替换权限映射（事务内先删后插）；permission code 必须已存在（权限码表内）。 */
  setRolePermissions(roleId: string, permissionCodes: PermissionCode[]): Promise<Result<void, DbError>>;
}

export function createIamStore(db: Db, options?: { logger?: Logger }): IamStore {
  /** DB 失败是系统异常：产生层记 error（err 带完整堆栈），Result 照常返回给边界翻译。 */
  const logFailure = (op: string, error: DbError) => {
    options?.logger?.error(
      { err: error.cause instanceof Error ? error.cause : undefined, "error.code": error.code, event: "db.error", op },
      error.message,
    );
  };

  /** 按 code 取角色 id；种子未跑导致缺失视为读失败（启动期系统异常）。 */
  const roleIdByCode = (code: RoleCode): string => {
    const found = db.select({ id: roles.id }).from(roles).where(eq(roles.code, code)).limit(1).all();
    if (found.length === 0) throw new Error(`角色 ${code} 不存在（iam 种子未执行）`);
    return found[0].id;
  };

  /** 一批角色 id → 权限码集合。 */
  const permissionsOfRoles = (roleIds: string[]): Map<string, PermissionCode[]> => {
    const map = new Map<string, PermissionCode[]>();
    if (roleIds.length === 0) return map;
    const rows = db
      .select({ permissionCode: rolePermissions.permissionCode, roleId: rolePermissions.roleId })
      .from(rolePermissions)
      .where(inArray(rolePermissions.roleId, roleIds))
      .all();
    for (const row of rows) {
      const list = map.get(row.roleId) ?? [];
      list.push(row.permissionCode as PermissionCode);
      map.set(row.roleId, list);
    }
    return map;
  };

  return {
    async getSiteRole(userId) {
      try {
        const rows = db
          .select({ code: roles.code })
          .from(userSiteRoles)
          .innerJoin(roles, eq(userSiteRoles.roleId, roles.id))
          .where(eq(userSiteRoles.userId, userId))
          .limit(1)
          .all();
        return ok(rows.length === 0 ? null : (rows[0].code as SiteRoleCode));
      } catch (cause) {
        const error: DbError = { cause, code: "DB_READ_FAILED", message: "查询整站角色失败" };
        logFailure("getSiteRole", error);
        return err(error);
      }
    },

    async getProjectRole(userId, projectId) {
      try {
        const rows = db
          .select({ code: roles.code })
          .from(projectMembers)
          .innerJoin(roles, eq(projectMembers.roleId, roles.id))
          .where(and(eq(projectMembers.userId, userId), eq(projectMembers.projectId, projectId)))
          .limit(1)
          .all();
        return ok(rows.length === 0 ? null : (rows[0].code as ProjectRoleCode));
      } catch (cause) {
        const error: DbError = { cause, code: "DB_READ_FAILED", message: "查询项目角色失败" };
        logFailure("getProjectRole", error);
        return err(error);
      }
    },

    async getPermissionsForUser(userId) {
      try {
        const siteRows = db
          .select({ code: roles.code, roleId: roles.id })
          .from(userSiteRoles)
          .innerJoin(roles, eq(userSiteRoles.roleId, roles.id))
          .where(eq(userSiteRoles.userId, userId))
          .limit(1)
          .all();
        const memberRows = db
          .select({ projectId: projectMembers.projectId, roleCode: roles.code, roleId: roles.id })
          .from(projectMembers)
          .innerJoin(roles, eq(projectMembers.roleId, roles.id))
          .where(eq(projectMembers.userId, userId))
          .all();

        const siteRole = siteRows.length === 0 ? null : (siteRows[0].code as SiteRoleCode);
        const roleIds = [
          ...siteRows.map((r) => r.roleId),
          ...memberRows.map((r) => r.roleId),
        ];
        const byRole = permissionsOfRoles(roleIds);

        return ok({
          projects: memberRows.map((row) => ({
            permissions: byRole.get(row.roleId) ?? [],
            projectId: row.projectId,
            role: row.roleCode as ProjectRoleCode,
          })),
          sitePermissions: siteRows.length === 0 ? [] : (byRole.get(siteRows[0].roleId) ?? []),
          siteRole,
          userId,
        });
      } catch (cause) {
        const error: DbError = { cause, code: "DB_READ_FAILED", message: "查询用户权限失败" };
        logFailure("getPermissionsForUser", error);
        return err(error);
      }
    },

    async assignSiteRole(userId, role) {
      try {
        const roleId = roleIdByCode(role);
        db.insert(userSiteRoles)
          .values({ roleId, userId })
          .onConflictDoUpdate({ set: { roleId }, target: userSiteRoles.userId })
          .run();
        return ok(undefined);
      } catch (cause) {
        const error: DbError = { cause, code: "DB_WRITE_FAILED", message: "分配整站角色失败" };
        logFailure("assignSiteRole", error);
        return err(error);
      }
    },

    async ensureSiteRole(userId) {
      try {
        const existing = db
          .select({ code: roles.code })
          .from(userSiteRoles)
          .innerJoin(roles, eq(userSiteRoles.roleId, roles.id))
          .where(eq(userSiteRoles.userId, userId))
          .limit(1)
          .all();
        if (existing.length > 0) return ok(existing[0].code as SiteRoleCode);

        // 引导规则（docs/architecture-rbac-menu.md §2）：默认登录即全权限，新用户一律 site:admin。
        db.insert(userSiteRoles).values({ roleId: roleIdByCode("site:admin"), userId }).run();
        return ok("site:admin");
      } catch (cause) {
        const error: DbError = { cause, code: "DB_WRITE_FAILED", message: "分配默认整站角色失败" };
        logFailure("ensureSiteRole", error);
        return err(error);
      }
    },

    async upsertProjectMember(input) {
      try {
        const roleId = roleIdByCode(input.role);
        db.insert(projectMembers)
          .values({ addedAt: new Date(), projectId: input.projectId, roleId, userId: input.userId })
          .onConflictDoUpdate({
            set: { roleId },
            target: [projectMembers.projectId, projectMembers.userId],
          })
          .run();
        return ok(undefined);
      } catch (cause) {
        const error: DbError = { cause, code: "DB_WRITE_FAILED", message: "写入项目成员失败" };
        logFailure("upsertProjectMember", error);
        return err(error);
      }
    },

    async removeProjectMember(projectId, userId) {
      try {
        db.delete(projectMembers)
          .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
          .run();
        return ok(undefined);
      } catch (cause) {
        const error: DbError = { cause, code: "DB_WRITE_FAILED", message: "移除项目成员失败" };
        logFailure("removeProjectMember", error);
        return err(error);
      }
    },

    async listProjectMembers(projectId) {
      try {
        const rows = db
          .select({
            addedAt: projectMembers.addedAt,
            projectId: projectMembers.projectId,
            role: roles.code,
            userId: projectMembers.userId,
          })
          .from(projectMembers)
          .innerJoin(roles, eq(projectMembers.roleId, roles.id))
          .where(eq(projectMembers.projectId, projectId))
          .all();
        return ok(
          rows.map((row) => ({ ...row, role: row.role as ProjectRoleCode })),
        );
      } catch (cause) {
        const error: DbError = { cause, code: "DB_READ_FAILED", message: "查询项目成员失败" };
        logFailure("listProjectMembers", error);
        return err(error);
      }
    },

    async listUsersWithRoles() {
      try {
        const rows = db
          .select({
            avatarUrl: users.avatarUrl,
            feishuOpenId: users.feishuOpenId,
            id: users.id,
            lastLoginAt: users.lastLoginAt,
            name: users.name,
            siteRole: roles.code,
          })
          .from(users)
          .leftJoin(userSiteRoles, eq(userSiteRoles.userId, users.id))
          .leftJoin(roles, eq(userSiteRoles.roleId, roles.id))
          .orderBy(users.createdAt)
          .all();
        return ok(rows.map((row) => ({ ...row, siteRole: (row.siteRole as SiteRoleCode | null) ?? null })));
      } catch (cause) {
        const error: DbError = { cause, code: "DB_READ_FAILED", message: "查询用户列表失败" };
        logFailure("listUsersWithRoles", error);
        return err(error);
      }
    },

    async listRolesWithPermissions() {
      try {
        const roleRows = db.select().from(roles).all();
        const byRole = permissionsOfRoles(roleRows.map((r) => r.id));
        return ok(
          roleRows.map((row) => ({
            builtIn: row.builtIn,
            code: row.code as RoleCode,
            id: row.id,
            name: row.name,
            permissions: byRole.get(row.id) ?? [],
            scope: row.scope,
          })),
        );
      } catch (cause) {
        const error: DbError = { cause, code: "DB_READ_FAILED", message: "查询角色列表失败" };
        logFailure("listRolesWithPermissions", error);
        return err(error);
      }
    },

    async setRolePermissions(roleId, permissionCodes) {
      try {
        // 防御性校验：权限码必须在 permissions 表内（路由层已用 zod 枚举挡过一轮，此处兜底）。
        if (permissionCodes.length > 0) {
          const found = db
            .select({ code: permissions.code })
            .from(permissions)
            .where(inArray(permissions.code, permissionCodes))
            .all();
          const foundSet = new Set(found.map((r) => r.code));
          const missing = permissionCodes.filter((code) => !foundSet.has(code));
          if (missing.length > 0) {
            const error: DbError = { code: "DB_WRITE_FAILED", message: `权限码不存在：${missing.join(", ")}` };
            logFailure("setRolePermissions", error);
            return err(error);
          }
        }
        db.transaction((tx) => {
          tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId)).run();
          for (const permissionCode of permissionCodes) {
            tx.insert(rolePermissions).values({ permissionCode, roleId }).run();
          }
        });
        return ok(undefined);
      } catch (cause) {
        const error: DbError = { cause, code: "DB_WRITE_FAILED", message: "更新角色权限映射失败" };
        logFailure("setRolePermissions", error);
        return err(error);
      }
    },
  };
}
