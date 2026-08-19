import { createHash, randomUUID } from "node:crypto";

import { err, ok, type Result } from "@next-build/result";
import type { Logger } from "@next-build/db";

import type { ActorContext } from "@/server/domains/iam/model";
import type { IamStore } from "@/server/domains/iam/ports";
import type { GitHubGateway, ProjectStore } from "@/server/domains/project/ports";
import type { TaskError } from "@/server/domains/task/errors";
import { taskErrorFromStore } from "@/server/domains/task/errors";
import type { TaskDetail } from "@/server/domains/task/model";
import type { TaskStore } from "@/server/domains/task/ports";
import type { TaskDispatcher } from "@/server/domains/task/ports";
import { createResolveExecutionTarget } from "@/server/application/project/resolve-execution-target";

function branchSlug(title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);
  return slug || "task";
}

function fingerprint(input: object): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export function createCreateTask(deps: {
  taskStore: TaskStore;
  projectStore: ProjectStore;
  gateway: GitHubGateway;
  logger: Logger;
  dispatcher: TaskDispatcher;
  iamStore: IamStore;
}) {
  const resolveTarget = createResolveExecutionTarget(deps);
  return async (input: {
    actor: ActorContext;
    projectId: string;
    projectRepoId: string;
    title: string;
    requirement: string;
    acceptanceCriteria: string[];
    validationCommands: string[];
    nonGoals: string;
    riskNotes: string;
    reviewerId: string;
    idempotencyKey: string;
  }): Promise<Result<{ detail: TaskDetail; created: boolean }, TaskError>> => {
    const target = await resolveTarget({ actor: input.actor, projectId: input.projectId, projectRepoId: input.projectRepoId });
    if (!target.ok) return target;
    const reviewer = await deps.iamStore.getProjectRole(input.reviewerId, input.projectId);
    if (!reviewer.ok) return err(taskErrorFromStore(reviewer.error));
    if (!reviewer.value) {
      return err({ code: "TASK_REVIEWER_INVALID", kind: "business", message: "验收人必须是当前项目成员" });
    }

    const taskId = randomUUID();
    const command = {
      acceptanceCriteria: input.acceptanceCriteria,
      nonGoals: input.nonGoals,
      projectId: input.projectId,
      requirement: input.requirement,
      reviewerId: input.reviewerId,
      riskNotes: input.riskNotes,
      title: input.title,
      validationCommands: input.validationCommands,
    };
    const created = await deps.taskStore.createTask({
      ...command,
      baseSha: target.value.baseSha,
      branch: `agent/${taskId.slice(0, 8)}-${branchSlug(input.title)}`,
      canonicalRepo: target.value.repo,
      commandFingerprint: fingerprint(command),
      createdBy: input.actor.userId,
      defaultBranch: target.value.defaultBranch,
      idempotencyKey: input.idempotencyKey,
      projectRepoId: target.value.projectRepoId,
      providerRepoId: target.value.providerRepoId,
      taskId,
      validationVersion: target.value.validationVersion,
    });
    if (!created.ok) return err(taskErrorFromStore(created.error));
    deps.logger.info(
      {
        event: created.value.created ? "task.created" : "task.idempotent_replay",
        project_id: input.projectId,
        repo: target.value.repo,
        task_id: created.value.detail.task.id,
        user_id: input.actor.userId,
      },
      created.value.created ? "任务已进入执行队列" : "返回幂等任务结果",
    );
    if (created.value.created) deps.dispatcher.enqueue(created.value.detail.task.id);
    return ok(created.value);
  };
}
