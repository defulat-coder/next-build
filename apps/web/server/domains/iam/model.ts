/**
 * 授权（IAM）上下文的核心概念（统一语言的载体）。
 * 持久化契约由 packages/db 的窄接口（IamStore）持有，此处归口 re-export，不重复定义。
 * 权限码常量见 @next-build/db/permissions（前端同一份 SoT）。
 */
import type { UserPermissions } from "@next-build/db";

export type {
  PermissionCode,
  ProjectMember,
  ProjectPermissions,
  ProjectRoleCode,
  Role,
  RoleCode,
  RoleWithPermissions,
  SiteRoleCode,
  UserPermissions,
  UserWithRoles,
} from "@next-build/db";

/**
 * 操作者上下文：authGuard 一次解析后经 Hono context 传入用例（userId + 权限码集合），
 * 用例内的项目级权限判定直接用 permissions，不重复查库（docs/architecture-rbac-menu.md §4）。
 */
export interface ActorContext {
  userId: string;
  permissions: UserPermissions;
}
