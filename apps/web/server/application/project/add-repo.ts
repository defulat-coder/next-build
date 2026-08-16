import { err, ok, type Result } from "@next-build/result";
import type { Logger } from "@next-build/db";

import type { ProjectError } from "@/server/domains/project/errors";
import { projectErrorFromStore } from "@/server/domains/project/errors";
import type { ProjectRepo } from "@/server/domains/project/model";
import type { GitHubGateway, ProjectStore } from "@/server/domains/project/ports";

/**
 * 用例：给项目添加仓库（事务脚本）。先经 GitHub 校验存在性与可访问性（并取默认分支），再入库。
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

  return async (input: { projectId: string; repo: string; userId: string }): Promise<Result<ProjectRepo, ProjectError>> => {
    const existing = await deps.projectStore.getProject(input.projectId);
    if (!existing.ok) return logFailure(projectErrorFromStore(existing.error), input.projectId);
    if (!existing.value) {
      return logFailure({ code: "PROJECT_NOT_FOUND", kind: "business", message: "项目不存在" }, input.projectId);
    }

    const checked = await deps.gateway.checkRepo(input.repo);
    if (!checked.ok) return logFailure(checked.error, input.projectId);

    const added = await deps.projectStore.addRepo({
      defaultBranch: checked.value.defaultBranch,
      projectId: input.projectId,
      repo: checked.value.repo,
    });
    if (!added.ok) return logFailure(projectErrorFromStore(added.error), input.projectId);

    deps.logger.info(
      { event: "project.repo_added", project_id: input.projectId, repo: added.value.repo, user_id: input.userId },
      "仓库添加到项目",
    );
    return ok(added.value);
  };
}
