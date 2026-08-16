import { randomUUID } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";

import type { Db } from "./client";
import type { Logger } from "./logger";
import { BUILTIN_ROLES, PERMISSIONS, ROLE_PERMISSIONS, type PermissionCode } from "./permissions";
import { permissions, projectMembers, projects, rolePermissions, roles, userSiteRoles, users } from "./schema";

/**
 * IAM 种子与既有数据迁移（docs/architecture-rbac-menu.md §2/§7），启动时由组合根调用，幂等：
 * 1. 按 code upsert 权限码 / 内置角色。
 * 2. built_in 角色只补「缺失的」映射（INSERT OR IGNORE），不清空库内已有映射——管理页的配置优先于种子默认值。
 * 3. 无整站角色的 users 补默认角色 site:admin（默认登录即全权限）；既有 member→admin 的提升走 drizzle 一次性迁移（0003），不在此做。
 * 4. 既有 projects 按 created_by 回填 project_members（project:owner）。
 * 失败是启动期系统异常：记 error（含完整堆栈）后原样 throw。
 */
export function seedIam(db: Db, options?: { logger?: Logger }): void {
  const start = performance.now();
  try {
    db.transaction((tx) => {
      // 1. 权限码与内置角色按 code 幂等 upsert。
      for (const [code, description] of Object.entries(PERMISSIONS)) {
        tx.insert(permissions)
          .values({ code, description })
          .onConflictDoUpdate({ set: { description }, target: permissions.code })
          .run();
      }
      for (const role of BUILTIN_ROLES) {
        tx.insert(roles)
          .values({ builtIn: true, code: role.code, id: randomUUID(), name: role.name, scope: role.scope })
          .onConflictDoUpdate({ set: { builtIn: true, name: role.name, scope: role.scope }, target: roles.code })
          .run();
      }

      const roleIdByCode = new Map<string, string>(
        tx
          .select({ code: roles.code, id: roles.id })
          .from(roles)
          .all()
          .map((row) => [row.code, row.id]),
      );

      // 2. built_in 角色只补缺失的映射：管理页删改过的配置不被覆盖（site:admin 的缺失项同样被补齐，与短路规则保持一致的全量）。
      for (const role of BUILTIN_ROLES) {
        const roleId = roleIdByCode.get(role.code);
        if (!roleId) throw new Error(`角色 ${role.code} 种子写入后查不到`);
        const codes: readonly PermissionCode[] = ROLE_PERMISSIONS[role.code];
        for (const permissionCode of codes) {
          tx.insert(rolePermissions)
            .values({ permissionCode, roleId })
            .onConflictDoNothing({ target: [rolePermissions.roleId, rolePermissions.permissionCode] })
            .run();
        }
      }

      // 3. 无整站角色的用户补默认角色 site:admin（docs/architecture-rbac-menu.md §2：默认登录即全权限）。
      const adminRoleId = roleIdByCode.get("site:admin");
      if (!adminRoleId) throw new Error("内置整站角色缺失");
      const usersWithoutRole = tx
        .select({ id: users.id })
        .from(users)
        .leftJoin(userSiteRoles, eq(userSiteRoles.userId, users.id))
        .where(isNull(userSiteRoles.userId))
        .all();
      for (const user of usersWithoutRole) {
        tx.insert(userSiteRoles).values({ roleId: adminRoleId, userId: user.id }).run();
      }

      // 4. 既有项目迁移：created_by 回填 project_members（owner），added_at 取项目创建时间。
      const ownerRoleId = roleIdByCode.get("project:owner");
      if (!ownerRoleId) throw new Error("内置项目角色缺失");
      const projectsToBackfill = tx
        .select({ createdAt: projects.createdAt, createdBy: projects.createdBy, id: projects.id })
        .from(projects)
        .leftJoin(
          projectMembers,
          and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, projects.createdBy)),
        )
        .where(isNull(projectMembers.userId))
        .all();
      for (const project of projectsToBackfill) {
        tx.insert(projectMembers)
          .values({ addedAt: project.createdAt, projectId: project.id, roleId: ownerRoleId, userId: project.createdBy })
          .run();
      }

      options?.logger?.info(
        {
          duration_ms: Math.round(performance.now() - start),
          event: "iam.seeded",
          permissions: Object.keys(PERMISSIONS).length,
          roles: BUILTIN_ROLES.length,
          users_backfilled: usersWithoutRole.length,
          projects_backfilled: projectsToBackfill.length,
        },
        "IAM 种子与迁移完成",
      );
    });
  } catch (cause) {
    options?.logger?.error({ err: cause, "error.code": "DB_SEED_FAILED", event: "db.error" }, "IAM 种子失败");
    throw cause;
  }
}
