import { err, ok, type Result } from "@next-build/result";
import type { Logger } from "@next-build/db";

import { checkProjectPermission } from "@/server/application/iam/check-project-permission";
import { isSiteAdmin } from "@/server/domains/iam/access";
import type { ActorContext } from "@/server/domains/iam/model";
import type { TaskError } from "@/server/domains/task/errors";
import { taskErrorFromStore } from "@/server/domains/task/errors";
import type { AcceptanceCriterionResult, AcceptanceEvidence, TaskDetail } from "@/server/domains/task/model";
import type { TaskStore } from "@/server/domains/task/ports";

export function createDecideTaskAcceptance(deps: { taskStore: TaskStore; logger: Logger }) {
  return async (input: {
    actor: ActorContext;
    projectId: string;
    taskId: string;
    decision: "accepted" | "rejected";
    criteriaResults: AcceptanceCriterionResult[];
    environment: string;
    evidence: AcceptanceEvidence[];
    notes?: string;
  }): Promise<Result<TaskDetail, TaskError>> => {
    const allowed = checkProjectPermission(input.actor, input.projectId, "task:accept", deps.logger);
    if (!allowed.ok) return allowed;
    const found = await deps.taskStore.getTask(input.taskId);
    if (!found.ok) return err(taskErrorFromStore(found.error));
    if (!found.value || found.value.task.projectId !== input.projectId) {
      return err({ code: "TASK_NOT_FOUND", kind: "business", message: "任务不存在" });
    }
    if (found.value.task.reviewerId && found.value.task.reviewerId !== input.actor.userId && !isSiteAdmin(input.actor.permissions)) {
      return err({ code: "FORBIDDEN", kind: "business", message: "只有指定验收人可以提交业务验收" });
    }
    const decided = await deps.taskStore.decideAcceptance({
      actorId: input.actor.userId,
      criteriaResults: input.criteriaResults,
      decision: input.decision,
      environment: input.environment,
      evidence: input.evidence,
      expectedAcceptanceVersion: found.value.acceptance.version,
      expectedTaskVersion: found.value.task.version,
      notes: input.notes,
      taskId: input.taskId,
    });
    if (!decided.ok) return err(taskErrorFromStore(decided.error));
    if (!decided.value) return err({ code: "TASK_NOT_FOUND", kind: "business", message: "任务不存在" });
    deps.logger.info(
      {
        acceptance: input.decision,
        event: "task.business_acceptance_decided",
        project_id: input.projectId,
        task_id: input.taskId,
        user_id: input.actor.userId,
      },
      input.decision === "accepted" ? "业务验收通过" : "业务验收拒绝",
    );
    return ok(decided.value);
  };
}
