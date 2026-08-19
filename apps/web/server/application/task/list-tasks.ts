import { err, ok, type Result } from "@next-build/result";
import type { Logger } from "@next-build/db";

import { checkProjectPermission } from "@/server/application/iam/check-project-permission";
import type { ActorContext } from "@/server/domains/iam/model";
import type { TaskError } from "@/server/domains/task/errors";
import { taskErrorFromStore } from "@/server/domains/task/errors";
import type { TaskDetail } from "@/server/domains/task/model";
import type { TaskStore } from "@/server/domains/task/ports";

export function createListTasks(deps: { taskStore: TaskStore; logger: Logger }) {
  return async (input: { actor: ActorContext; projectId: string }): Promise<Result<TaskDetail[], TaskError>> => {
    const allowed = checkProjectPermission(input.actor, input.projectId, "task:read", deps.logger);
    if (!allowed.ok) return allowed;
    const result = await deps.taskStore.listTasks(input.projectId);
    return result.ok ? ok(result.value) : err(taskErrorFromStore(result.error));
  };
}
