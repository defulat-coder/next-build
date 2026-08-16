import { err, ok, type Result } from "@next-build/result";
import type { Logger } from "@next-build/db";

import { checkProjectPermission } from "@/server/application/iam/check-project-permission";
import { iamErrorFromDb, type IamError } from "@/server/domains/iam/errors";
import type { ActorContext, ProjectRoleCode } from "@/server/domains/iam/model";
import type { IamStore } from "@/server/domains/iam/ports";

/**
 * 用例：改项目角色（member:manage，项目级判定在用例内做）。
 * 非成员返回 MEMBER_NOT_FOUND（404）；把最后一个 owner 降级为其他角色返回 LAST_OWNER（项目至少保留一个 owner）。
 * 审计事件 iam.project_member_updated 必记。
 */
export function createUpdateProjectMember(deps: { iamStore: IamStore; logger: Logger }) {
  return async (input: {
    actor: ActorContext;
    projectId: string;
    targetUserId: string;
    role: ProjectRoleCode;
  }): Promise<Result<void, IamError>> => {
    const allowed = checkProjectPermission(input.actor, input.projectId, "member:manage", deps.logger);
    if (!allowed.ok) return allowed;

    const existing = await deps.iamStore.getProjectRole(input.targetUserId, input.projectId);
    if (!existing.ok) return err(iamErrorFromDb(existing.error));
    if (!existing.value) return err({ code: "MEMBER_NOT_FOUND", kind: "business", message: "该用户不是项目成员" });

    if (existing.value === "project:owner" && input.role !== "project:owner") {
      const members = await deps.iamStore.listProjectMembers(input.projectId);
      if (!members.ok) return err(iamErrorFromDb(members.error));
      const owners = members.value.filter((m) => m.role === "project:owner");
      if (owners.length === 1) {
        return err({ code: "LAST_OWNER", kind: "business", message: "项目至少保留一个负责人" });
      }
    }

    const updated = await deps.iamStore.upsertProjectMember({
      projectId: input.projectId,
      role: input.role,
      userId: input.targetUserId,
    });
    if (!updated.ok) return err(iamErrorFromDb(updated.error));

    deps.logger.info(
      {
        actor_id: input.actor.userId,
        event: "iam.project_member_updated",
        project_id: input.projectId,
        role: input.role,
        target_user_id: input.targetUserId,
      },
      "项目成员角色变更",
    );
    return ok(undefined);
  };
}
