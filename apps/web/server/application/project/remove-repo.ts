import { err, ok, type Result } from "@next-build/result";
import type { Logger } from "@next-build/db";

import type { ProjectError } from "@/server/domains/project/errors";
import { projectErrorFromStore } from "@/server/domains/project/errors";
import type { ProjectStore } from "@/server/domains/project/ports";

/** 用例：从项目移除仓库。 */
export function createRemoveRepo(deps: { projectStore: ProjectStore; logger: Logger }) {
  return async (input: { projectId: string; repoId: string; userId: string }): Promise<Result<void, ProjectError>> => {
    const existing = await deps.projectStore.getProject(input.projectId);
    if (!existing.ok) return err(projectErrorFromStore(existing.error));
    if (!existing.value) return err({ code: "PROJECT_NOT_FOUND", kind: "business", message: "项目不存在" });
    const repo = existing.value.repos.find((r) => r.id === input.repoId);
    if (!repo) return err({ code: "PROJECT_NOT_FOUND", kind: "business", message: "仓库不在该项目中" });

    const removed = await deps.projectStore.removeRepo(input.repoId);
    if (!removed.ok) return err(projectErrorFromStore(removed.error));
    deps.logger.info(
      { event: "project.repo_removed", project_id: input.projectId, repo: repo.repo, user_id: input.userId },
      "仓库从项目移除",
    );
    return ok(undefined);
  };
}
