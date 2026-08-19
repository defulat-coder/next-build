import { err, ok, type Result } from "@next-build/result";
import type { Logger } from "@next-build/db";

import { checkProjectPermission } from "@/server/application/iam/check-project-permission";
import type { ActorContext } from "@/server/domains/iam/model";
import type { ProjectError } from "@/server/domains/project/errors";
import { projectErrorFromStore } from "@/server/domains/project/errors";
import type { GitHubExecutionTarget, GitHubGateway, ProjectStore } from "@/server/domains/project/ports";

export interface ResolvedExecutionTarget extends GitHubExecutionTarget {
  projectRepoId: string;
  validationVersion: number;
}

/** Project 对 Task 暴露的唯一执行准入合同；Task 不自行解释仓库状态。 */
export function createResolveExecutionTarget(deps: { projectStore: ProjectStore; gateway: GitHubGateway; logger: Logger }) {
  return async (input: {
    actor: ActorContext;
    projectId: string;
    projectRepoId: string;
  }): Promise<Result<ResolvedExecutionTarget, ProjectError>> => {
    const allowed = checkProjectPermission(input.actor, input.projectId, "task:create", deps.logger);
    if (!allowed.ok) return allowed;

    const found = await deps.projectStore.getProject(input.projectId);
    if (!found.ok) return err(projectErrorFromStore(found.error));
    if (!found.value) return err({ code: "PROJECT_NOT_FOUND", kind: "business", message: "项目不存在" });
    if (found.value.project.archivedAt) {
      return err({ code: "PROJECT_ARCHIVED", kind: "business", message: "项目已归档，不能创建新任务" });
    }
    const primary = found.value.repos.find((repo) => repo.id === input.projectRepoId) ?? null;
    if (!primary || primary.accessStatus !== "available" || !primary.defaultBranch) {
      return err({
        code: "PROJECT_EXECUTION_NOT_READY",
        kind: "business",
        message: "所选仓库尚未就绪，请先在项目仓库页完成配置或复检",
      });
    }

    const resolved = await deps.gateway.resolveExecutionTarget(primary.repo);
    if (!resolved.ok) return resolved;
    const validatedAt = new Date();
    const updated = await deps.projectStore.updateRepoValidation(primary.id, {
      accessStatus: "available",
      canCreatePr: resolved.value.canCreatePr,
      canPush: resolved.value.canPush,
      defaultBranch: resolved.value.defaultBranch,
      expectedVersion: primary.version,
      lastExecutionValidatedAt: validatedAt,
      lastValidatedAt: validatedAt,
      providerRepoId: resolved.value.providerRepoId,
      repo: resolved.value.repo,
    });
    if (!updated.ok) return err(projectErrorFromStore(updated.error));
    if (!updated.value) return err({ code: "PROJECT_REPO_NOT_FOUND", kind: "business", message: "主仓库已被移除" });

    deps.logger.info(
      {
        base_sha: resolved.value.baseSha,
        event: "project.execution_target_resolved",
        project_id: input.projectId,
        repo_id: primary.id,
        user_id: input.actor.userId,
      },
      "任务执行目标已冻结",
    );
    return ok({
      ...resolved.value,
      projectRepoId: primary.id,
      validationVersion: updated.value.version,
    });
  };
}
