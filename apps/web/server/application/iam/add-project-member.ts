import { err, ok, type Result } from "@next-build/result";
import type { Logger } from "@next-build/db";

import { checkProjectPermission } from "@/server/application/iam/check-project-permission";
import { iamErrorFromDb, type IamError } from "@/server/domains/iam/errors";
import type { ActorContext, ProjectRoleCode } from "@/server/domains/iam/model";
import type { IamStore } from "@/server/domains/iam/ports";

/**
 * 用例：拉人进项目（member:manage，项目级判定在用例内做）。
 * 已是成员返回 MEMBER_EXISTS（409）；审计事件 iam.project_member_added 必记。
 */
export function createAddProjectMember(deps: { iamStore: IamStore; logger: Logger }) {
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
    if (existing.value) return err({ code: "MEMBER_EXISTS", kind: "business", message: "该用户已是项目成员" });

    const added = await deps.iamStore.upsertProjectMember({
      projectId: input.projectId,
      role: input.role,
      userId: input.targetUserId,
    });
    if (!added.ok) return err(iamErrorFromDb(added.error));

    deps.logger.info(
      {
        actor_id: input.actor.userId,
        event: "iam.project_member_added",
        project_id: input.projectId,
        role: input.role,
        target_user_id: input.targetUserId,
      },
      "项目成员添加",
    );
    return ok(undefined);
  };
}
