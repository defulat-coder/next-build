import { err, ok, type Result } from "@next-build/result";
import type { Logger } from "@next-build/db";

import { checkProjectPermission } from "@/server/application/iam/check-project-permission";
import type { ActorContext } from "@/server/domains/iam/model";
import type { TaskError } from "@/server/domains/task/errors";
import { taskErrorFromStore } from "@/server/domains/task/errors";
import type { TaskDetail } from "@/server/domains/task/model";
import type { TaskStore } from "@/server/domains/task/ports";

export function createCancelTask(deps: { taskStore: TaskStore; logger: Logger }) {
  return async (input: { actor: ActorContext; projectId: string; taskId: string }): Promise<Result<TaskDetail, TaskError>> => {
    const allowed = checkProjectPermission(input.actor, input.projectId, "task:create", deps.logger);
    if (!allowed.ok) return allowed;
    const found = await deps.taskStore.getTask(input.taskId);
    if (!found.ok) return err(taskErrorFromStore(found.error));
    if (!found.value || found.value.task.projectId !== input.projectId) return err({ code: "TASK_NOT_FOUND", kind: "business", message: "任务不存在" });
    const cancelled = await deps.taskStore.cancelTask({ expectedTaskVersion: found.value.task.version, taskId: input.taskId });
    if (!cancelled.ok) return err(taskErrorFromStore(cancelled.error));
    if (!cancelled.value) return err({ code: "TASK_NOT_FOUND", kind: "business", message: "任务不存在" });
    deps.logger.info({ event: "task.cancelled", project_id: input.projectId, task_id: input.taskId, user_id: input.actor.userId }, "任务已取消");
    return ok(cancelled.value);
  };
}
