import { err, ok, type Result } from "@next-build/result";
import type { Logger } from "@next-build/db";

import { checkProjectPermission } from "@/server/application/iam/check-project-permission";
import type { ActorContext } from "@/server/domains/iam/model";
import type { ProjectError } from "@/server/domains/project/errors";
import { projectErrorFromStore } from "@/server/domains/project/errors";
import type { ProjectRepo } from "@/server/domains/project/model";
import type { GitHubGateway, ProjectStore } from "@/server/domains/project/ports";

/**
 * 用例：给项目添加仓库（事务脚本）。GitHub 可访问时记录规范名/默认分支；404 仍保留为不可访问。
 * 项目级判定在用例内做：repo:manage（admin 或项目 owner）。
 * 失败日志在此打点（project.failed：业务异常 warn、系统异常 error；err 带堆栈，不记录 token）。
 */
export function createAddRepo(deps: { projectStore: ProjectStore; gateway: GitHubGateway; logger: Logger }) {
  const logFailure = (error: ProjectError, projectId: string): Result<never, ProjectError> => {
    deps.logger[error.kind === "business" ? "warn" : "error"](
      {
        err: error.cause instanceof Error ? error.cause : undefined,
        "error.code": error.code,
        "error.message": error.message,
        event: "project.failed",
        project_id: projectId,
      },
      "添加仓库失败",
    );
    return err(error);
  };

  return async (input: { actor: ActorContext; projectId: string; repo: string }): Promise<Result<ProjectRepo, ProjectError>> => {
    const existing = await deps.projectStore.getProject(input.projectId);
    if (!existing.ok) return logFailure(projectErrorFromStore(existing.error), input.projectId);
    if (!existing.value) {
      return logFailure({ code: "PROJECT_NOT_FOUND", kind: "business", message: "项目不存在" }, input.projectId);
    }

    const allowed = checkProjectPermission(input.actor, input.projectId, "repo:manage", deps.logger);
    if (!allowed.ok) return allowed;

    const checked = await deps.gateway.checkRepo(input.repo);
    let repository: { accessStatus: "available" | "unavailable"; defaultBranch: string | null; repo: string };
    if (checked.ok) {
      repository = { ...checked.value, accessStatus: "available" };
    } else if (checked.error.code === "GITHUB_REPO_NOT_FOUND") {
      repository = { accessStatus: "unavailable", defaultBranch: null, repo: input.repo };
    } else {
      return logFailure(checked.error, input.projectId);
    }

    const added = await deps.projectStore.addRepo({
      accessStatus: repository.accessStatus,
      defaultBranch: repository.defaultBranch,
      projectId: input.projectId,
      repo: repository.repo,
    });
    if (!added.ok) return logFailure(projectErrorFromStore(added.error), input.projectId);

    const fields = {
      access_status: added.value.accessStatus,
      event: "project.repo_added",
      project_id: input.projectId,
      repo: added.value.repo,
      repo_id: added.value.id,
      user_id: input.actor.userId,
    };
    if (added.value.accessStatus === "available") deps.logger.info(fields, "仓库添加到项目");
    else deps.logger.warn(fields, "不可访问仓库已保留在项目中");
    if (added.value.isPrimary) {
      const primaryFields = {
        event: "project.primary_repo_changed",
        from_repo_id: null,
        project_id: input.projectId,
        to_repo_id: added.value.id,
        user_id: input.actor.userId,
      };
      if (added.value.accessStatus === "available") {
        deps.logger.info(primaryFields, "首个仓库自动设为主仓库");
      } else {
        deps.logger.warn(primaryFields, "不可访问的首个仓库自动设为主仓库");
      }
    }
    return ok(added.value);
  };
}
