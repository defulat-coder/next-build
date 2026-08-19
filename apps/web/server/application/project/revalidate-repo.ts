import { err, ok, type Result } from "@next-build/result";
import type { Logger } from "@next-build/db";

import { checkProjectPermission } from "@/server/application/iam/check-project-permission";
import type { ActorContext } from "@/server/domains/iam/model";
import type { ProjectError } from "@/server/domains/project/errors";
import { projectErrorFromStore } from "@/server/domains/project/errors";
import type { ProjectRepo } from "@/server/domains/project/model";
import type { GitHubGateway, ProjectStore } from "@/server/domains/project/ports";

/** 用例：按需复检仓库。404 是确定性不可访问结果；网络/限流不写旧状态。 */
export function createRevalidateRepo(deps: { projectStore: ProjectStore; gateway: GitHubGateway; logger: Logger }) {
  return async (input: {
    actor: ActorContext;
    projectId: string;
    repoId: string;
  }): Promise<Result<ProjectRepo, ProjectError>> => {
    const existing = await deps.projectStore.getProject(input.projectId);
    if (!existing.ok) return err(projectErrorFromStore(existing.error));
    if (!existing.value) return err({ code: "PROJECT_NOT_FOUND", kind: "business", message: "项目不存在" });

    const allowed = checkProjectPermission(input.actor, input.projectId, "repo:manage", deps.logger);
    if (!allowed.ok) return allowed;

    const repo = existing.value.repos.find((candidate) => candidate.id === input.repoId);
    if (!repo) return err({ code: "PROJECT_REPO_NOT_FOUND", kind: "business", message: "仓库不在该项目中" });

    const checked = await deps.gateway.checkRepo(repo.repo);
    const validatedAt = new Date();
    let validation: {
      accessStatus: "available" | "unavailable";
      defaultBranch: string | null;
      lastValidatedAt: Date;
      repo: string;
    };
    if (checked.ok) {
      validation = { ...checked.value, accessStatus: "available", lastValidatedAt: validatedAt };
    } else if (checked.error.code === "GITHUB_REPO_NOT_FOUND") {
      validation = {
        accessStatus: "unavailable",
        defaultBranch: repo.defaultBranch,
        lastValidatedAt: validatedAt,
        repo: repo.repo,
      };
    } else {
      deps.logger.error(
        {
          err: checked.error.cause instanceof Error ? checked.error.cause : undefined,
          "error.code": checked.error.code,
          event: "project.repo_revalidated",
          project_id: input.projectId,
          repo: repo.repo,
          repo_id: repo.id,
          user_id: input.actor.userId,
        },
        "仓库复检失败，保留旧状态",
      );
      return err(checked.error);
    }

    const updated = await deps.projectStore.updateRepoValidation(repo.id, validation);
    if (!updated.ok) return err(projectErrorFromStore(updated.error));
    if (!updated.value) {
      return err({ code: "PROJECT_REPO_NOT_FOUND", kind: "business", message: "仓库不在该项目中" });
    }

    const fields = {
      access_status: updated.value.accessStatus,
      event: "project.repo_revalidated",
      project_id: input.projectId,
      repo: updated.value.repo,
      repo_id: updated.value.id,
      user_id: input.actor.userId,
    };
    if (updated.value.accessStatus === "available") deps.logger.info(fields, "仓库复检通过");
    else deps.logger.warn(fields, "仓库复检后不可访问");
    return ok(updated.value);
  };
}
