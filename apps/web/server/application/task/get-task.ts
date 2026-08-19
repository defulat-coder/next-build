import { err, ok, type Result } from "@next-build/result";
import type { Logger } from "@next-build/db";

import { checkProjectPermission } from "@/server/application/iam/check-project-permission";
import type { ActorContext } from "@/server/domains/iam/model";
import type { TaskError } from "@/server/domains/task/errors";
import { taskErrorFromStore } from "@/server/domains/task/errors";
import type { TaskDetail } from "@/server/domains/task/model";
import type { TaskStore } from "@/server/domains/task/ports";

export function createGetTask(deps: { taskStore: TaskStore; logger: Logger }) {
  return async (input: { actor: ActorContext; projectId: string; taskId: string }): Promise<Result<TaskDetail, TaskError>> => {
    const allowed = checkProjectPermission(input.actor, input.projectId, "task:read", deps.logger);
    if (!allowed.ok) return allowed;
    const result = await deps.taskStore.getTask(input.taskId);
    if (!result.ok) return err(taskErrorFromStore(result.error));
    if (!result.value || result.value.task.projectId !== input.projectId) {
      return err({ code: "TASK_NOT_FOUND", kind: "business", message: "任务不存在" });
    }
    return ok(result.value);
  };
}
