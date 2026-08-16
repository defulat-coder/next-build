import { err, ok, type Result } from "@next-build/result";

import { iamErrorFromDb, type IamError } from "@/server/domains/iam/errors";
import type { UserWithRoles } from "@/server/domains/iam/model";
import type { IamStore } from "@/server/domains/iam/ports";

/** 用例：用户列表（含整站角色）。路由层已用 requirePermission("user:manage") 拦截。 */
export function createListUsers(deps: { iamStore: IamStore }) {
  return async (): Promise<Result<UserWithRoles[], IamError>> => {
    const result = await deps.iamStore.listUsersWithRoles();
    if (!result.ok) return err(iamErrorFromDb(result.error));
    return ok(result.value);
  };
}
