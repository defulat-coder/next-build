import { err, ok, type Result } from "@next-build/result";
import type { Logger } from "@next-build/db";

import { iamErrorFromDb, type IamError } from "@/server/domains/iam/errors";
import type { PermissionCode } from "@/server/domains/iam/model";
import type { IamStore } from "@/server/domains/iam/ports";

/**
 * 用例：按角色全量替换权限映射（role:manage，路由层已拦截）。
 * 角色不存在返回 ROLE_NOT_FOUND（404）；审计事件 iam.role_permissions_updated 必记
 * （docs/architecture-rbac-menu.md §5）。
 */
export function createUpdateRolePermissions(deps: { iamStore: IamStore; logger: Logger }) {
  return async (input: {
    actorId: string;
    roleId: string;
    permissions: PermissionCode[];
  }): Promise<Result<void, IamError>> => {
    const rolesResult = await deps.iamStore.listRolesWithPermissions();
    if (!rolesResult.ok) return err(iamErrorFromDb(rolesResult.error));
    const role = rolesResult.value.find((r) => r.id === input.roleId);
    if (!role) return err({ code: "ROLE_NOT_FOUND", kind: "business", message: "角色不存在" });

    const updated = await deps.iamStore.setRolePermissions(input.roleId, input.permissions);
    if (!updated.ok) return err(iamErrorFromDb(updated.error));

    deps.logger.info(
      {
        actor_id: input.actorId,
        event: "iam.role_permissions_updated",
        permissions: input.permissions,
        role: role.code,
      },
      "角色权限映射更新",
    );
    return ok(undefined);
  };
}
