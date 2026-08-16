import { err, ok, type Result } from "@next-build/result";
import type { Logger } from "@next-build/db";

import { checkProjectPermission } from "@/server/application/iam/check-project-permission";
import { iamErrorFromDb, type IamError } from "@/server/domains/iam/errors";
import type { ActorContext } from "@/server/domains/iam/model";
import type { IamStore } from "@/server/domains/iam/ports";

/**
 * 用例：移出项目成员（member:manage，项目级判定在用例内做）。
 * 非成员返回 MEMBER_NOT_FOUND（404）；移出最后一个 owner 返回 LAST_OWNER（项目至少保留一个 owner）。
 * 审计事件 iam.project_member_removed 必记。
 */
export function createRemoveProjectMember(deps: { iamStore: IamStore; logger: Logger }) {
  return async (input: {
    actor: ActorContext;
    projectId: string;
    targetUserId: string;
  }): Promise<Result<void, IamError>> => {
    const allowed = checkProjectPermission(input.actor, input.projectId, "member:manage", deps.logger);
    if (!allowed.ok) return allowed;

    const existing = await deps.iamStore.getProjectRole(input.targetUserId, input.projectId);
    if (!existing.ok) return err(iamErrorFromDb(existing.error));
    if (!existing.value) return err({ code: "MEMBER_NOT_FOUND", kind: "business", message: "该用户不是项目成员" });

    if (existing.value === "project:owner") {
      const members = await deps.iamStore.listProjectMembers(input.projectId);
      if (!members.ok) return err(iamErrorFromDb(members.error));
      const owners = members.value.filter((m) => m.role === "project:owner");
      if (owners.length === 1) {
        return err({ code: "LAST_OWNER", kind: "business", message: "项目至少保留一个负责人" });
      }
    }

    const removed = await deps.iamStore.removeProjectMember(input.projectId, input.targetUserId);
    if (!removed.ok) return err(iamErrorFromDb(removed.error));

    deps.logger.info(
      {
        actor_id: input.actor.userId,
        event: "iam.project_member_removed",
        project_id: input.projectId,
        role: existing.value,
        target_user_id: input.targetUserId,
      },
      "项目成员移除",
    );
    return ok(undefined);
  };
}
