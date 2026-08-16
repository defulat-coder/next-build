import { err, ok, type Result } from "@next-build/result";

import { iamErrorFromDb, type IamError } from "@/server/domains/iam/errors";
import type { RoleWithPermissions } from "@/server/domains/iam/model";
import type { IamStore } from "@/server/domains/iam/ports";

/** 用例：角色列表（含各角色权限码集合）。路由层已用 requirePermission("role:manage") 拦截。 */
export function createListRoles(deps: { iamStore: IamStore }) {
  return async (): Promise<Result<RoleWithPermissions[], IamError>> => {
    const result = await deps.iamStore.listRolesWithPermissions();
    if (!result.ok) return err(iamErrorFromDb(result.error));
    return ok(result.value);
  };
}
