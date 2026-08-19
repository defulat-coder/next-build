import { err, ok, type Result } from "@next-build/result";
import type { Logger } from "@next-build/db";

import { checkProjectPermission } from "@/server/application/iam/check-project-permission";
import type { ActorContext } from "@/server/domains/iam/model";
import type { TaskError } from "@/server/domains/task/errors";
import { taskErrorFromStore } from "@/server/domains/task/errors";
import { canTransitionTask, type TaskDetail } from "@/server/domains/task/model";
import type { TaskStore } from "@/server/domains/task/ports";
import type { TaskDispatcher } from "@/server/domains/task/ports";

export function createRetryTask(deps: { taskStore: TaskStore; logger: Logger; dispatcher: TaskDispatcher }) {
  return async (input: { actor: ActorContext; projectId: string; taskId: string }): Promise<Result<TaskDetail, TaskError>> => {
    const allowed = checkProjectPermission(input.actor, input.projectId, "task:create", deps.logger);
    if (!allowed.ok) return allowed;
    const found = await deps.taskStore.getTask(input.taskId);
    if (!found.ok) return err(taskErrorFromStore(found.error));
    if (!found.value || found.value.task.projectId !== input.projectId) {
      return err({ code: "TASK_NOT_FOUND", kind: "business", message: "任务不存在" });
    }
    if (!canTransitionTask(found.value.task.status, "queued")) {
      return err({ code: "TASK_INVALID_TRANSITION", kind: "business", message: "当前任务状态不能重试" });
    }
    const retried = await deps.taskStore.retryTask({ expectedTaskVersion: found.value.task.version, taskId: input.taskId });
    if (!retried.ok) return err(taskErrorFromStore(retried.error));
    if (!retried.value) return err({ code: "TASK_NOT_FOUND", kind: "business", message: "任务不存在" });
    const run = retried.value.runs.at(-1)!;
    deps.logger.info(
      { attempt: run.attempt, event: "task.retry_queued", project_id: input.projectId, task_id: input.taskId, user_id: input.actor.userId },
      "任务重试已入队",
    );
    deps.dispatcher.enqueue(input.taskId);
    return ok(retried.value);
  };
}
