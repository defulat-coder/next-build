import { err, ok, type Result } from "@next-build/result";

import { allPermissionCodes } from "@/server/domains/iam/access";
import { iamErrorFromDb, type IamError } from "@/server/domains/iam/errors";
import type { ProjectRoleCode, SiteRoleCode } from "@/server/domains/iam/model";
import type { IamStore } from "@/server/domains/iam/ports";

/** 当前用户权限码全集（登录态一次性下发：整站权限 ∪ 各项目权限）。 */
export interface MyPermissions {
  siteRole: SiteRoleCode | null;
  permissions: ReturnType<typeof allPermissionCodes>;
  projects: { projectId: string; role: ProjectRoleCode }[];
}

/**
 * 用例：当前用户权限码全集（事务脚本）。
 * 页面层 server 组件与 /api/me/permissions 的等价服务端函数（docs/architecture-rbac-menu.md §4）。
 */
export function createGetMyPermissions(deps: { iamStore: IamStore }) {
  return async (userId: string): Promise<Result<MyPermissions, IamError>> => {
    const result = await deps.iamStore.getPermissionsForUser(userId);
    if (!result.ok) return err(iamErrorFromDb(result.error));
    return ok({
      permissions: allPermissionCodes(result.value),
      projects: result.value.projects.map((p) => ({ projectId: p.projectId, role: p.role })),
      siteRole: result.value.siteRole,
    });
  };
}
