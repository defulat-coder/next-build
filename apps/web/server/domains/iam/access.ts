import type { PermissionCode, UserPermissions } from "./model";

/**
 * 权限判定纯函数（docs/architecture-rbac-menu.md §1 判定规则）：
 * 有效权限 = 整站角色权限 ∪ 项目角色权限；site:admin 短路全放行。
 * 输入为 authGuard 一次解析、经 Hono context 共享的 UserPermissions——中间件与各上下文用例共用本模块，不重复查库。
 */

export function isSiteAdmin(permissions: UserPermissions): boolean {
  return permissions.siteRole === "site:admin";
}

/** 整站级权限判定（中间件用，只需 userId 对应的整站角色权限）。 */
export function hasSitePermission(permissions: UserPermissions, code: PermissionCode): boolean {
  return isSiteAdmin(permissions) || permissions.sitePermissions.includes(code);
}

/** 项目级权限判定（用例内用，按 projectId 上下文取项目角色权限）。 */
export function hasProjectPermission(
  permissions: UserPermissions,
  projectId: string,
  code: PermissionCode,
): boolean {
  if (isSiteAdmin(permissions)) return true;
  const project = permissions.projects.find((p) => p.projectId === projectId);
  return project?.permissions.includes(code) ?? false;
}

/** 当前用户权限码全集（GET /api/me/permissions 下发：整站 ∪ 各项目；admin 为全量）。 */
export function allPermissionCodes(permissions: UserPermissions): PermissionCode[] {
  const set = new Set<PermissionCode>(permissions.sitePermissions);
  for (const project of permissions.projects) {
    for (const code of project.permissions) set.add(code);
  }
  return [...set];
}
