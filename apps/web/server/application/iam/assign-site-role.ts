import { err, ok, type Result } from "@next-build/result";
import type { Logger } from "@next-build/db";

import { iamErrorFromDb, type IamError } from "@/server/domains/iam/errors";
import type { SiteRoleCode } from "@/server/domains/iam/model";
import type { IamStore } from "@/server/domains/iam/ports";

/**
 * 用例：分配整站角色（user:manage，路由层已拦截）。
 * 审计事件 iam.site_role_assigned 必记（docs/architecture-rbac-menu.md §5）。
 */
export function createAssignSiteRole(deps: { iamStore: IamStore; logger: Logger }) {
  return async (input: {
    actorId: string;
    targetUserId: string;
    role: SiteRoleCode;
  }): Promise<Result<void, IamError>> => {
    // 降级为 member 时保护最后一个 admin，避免锁死管理入口（与 LAST_OWNER 同款防护）。
    if (input.role !== "site:admin") {
      const users = await deps.iamStore.listUsersWithRoles();
      if (!users.ok) return err(iamErrorFromDb(users.error));
      const admins = users.value.filter((u) => u.siteRole === "site:admin");
      if (admins.length <= 1 && admins.some((u) => u.id === input.targetUserId)) {
        return err({ code: "LAST_ADMIN", kind: "business", message: "至少需要保留一名管理员" });
      }
    }
    const result = await deps.iamStore.assignSiteRole(input.targetUserId, input.role);
    if (!result.ok) return err(iamErrorFromDb(result.error));
    deps.logger.info(
      { actor_id: input.actorId, event: "iam.site_role_assigned", role: input.role, target_user_id: input.targetUserId },
      "整站角色分配",
    );
    return ok(undefined);
  };
}
