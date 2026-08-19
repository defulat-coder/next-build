import { err, ok, type Result } from "@next-build/result";
import type { Logger } from "@next-build/db";

import { checkProjectPermission } from "@/server/application/iam/check-project-permission";
import type { ActorContext } from "@/server/domains/iam/model";
import type { GitHubGateway } from "@/server/domains/project/ports";
import type { TaskError } from "@/server/domains/task/errors";
import { taskErrorFromStore } from "@/server/domains/task/errors";
import type { TaskDetail } from "@/server/domains/task/model";
import type { TaskStore } from "@/server/domains/task/ports";

export function createReconcileDelivery(deps: {
  taskStore: TaskStore;
  gateway: GitHubGateway;
  logger: Logger;
}) {
  return async (input: { actor: ActorContext; projectId: string; taskId: string }): Promise<Result<TaskDetail, TaskError>> => {
    const allowed = checkProjectPermission(input.actor, input.projectId, "task:create", deps.logger);
    if (!allowed.ok) return allowed;
    const found = await deps.taskStore.getTask(input.taskId);
    if (!found.ok) return err(taskErrorFromStore(found.error));
    if (!found.value || found.value.task.projectId !== input.projectId) {
      return err({ code: "TASK_NOT_FOUND", kind: "business", message: "任务不存在" });
    }
    const number = found.value.delivery.githubPrNumber;
    if (!number) return err({ code: "TASK_INVALID_TRANSITION", kind: "business", message: "任务还没有 Pull Request 可同步" });
    const remote = await deps.gateway.getPullRequest(found.value.task.canonicalRepo, number);
    if (!remote.ok) return remote;
    const applied = await deps.taskStore.applyPullRequestFact({
      draft: remote.value.draft,
      eventId: `manual:${remote.value.nodeId}:${remote.value.mergedSha ?? remote.value.headSha}:${remote.value.state}:${remote.value.draft}`,
      eventName: "manual_reconcile",
      headBranch: found.value.task.branch,
      headSha: remote.value.headSha,
      merged: remote.value.merged,
      mergedAt: remote.value.mergedAt,
      mergedSha: remote.value.mergedSha,
      nodeId: remote.value.nodeId,
      number: remote.value.number,
      repo: found.value.task.canonicalRepo,
      state: remote.value.state,
      url: remote.value.url,
    });
    if (!applied.ok) return err(taskErrorFromStore(applied.error));
    let detail = applied.value.detail;
    if (!detail) {
      const refreshed = await deps.taskStore.getTask(input.taskId);
      if (!refreshed.ok) return err(taskErrorFromStore(refreshed.error));
      detail = refreshed.value;
    }
    if (!detail) return err({ code: "TASK_NOT_FOUND", kind: "business", message: "任务不存在" });
    if (remote.value.merged) {
      deps.logger.info({ event: "delivery.merged", merge_sha: remote.value.mergedSha, pr_number: number, project_id: input.projectId, task_id: input.taskId }, "GitHub 合并状态已回写");
    } else {
      deps.logger.info({ event: "delivery.reconciled", pr_number: number, project_id: input.projectId, status: detail.delivery.status, task_id: input.taskId }, "GitHub 交付状态已同步");
    }
    return ok(detail);
  };
}
