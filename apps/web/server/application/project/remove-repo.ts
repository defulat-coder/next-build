import { err, ok, type Result } from "@next-build/result";
import type { Logger } from "@next-build/db";

import { checkProjectPermission } from "@/server/application/iam/check-project-permission";
import type { ActorContext } from "@/server/domains/iam/model";
import type { ProjectError } from "@/server/domains/project/errors";
import { projectErrorFromStore } from "@/server/domains/project/errors";
import type { ProjectStore } from "@/server/domains/project/ports";

/** 用例：从项目移除仓库。项目级判定在用例内做：repo:manage（admin 或项目 owner）。 */
export function createRemoveRepo(deps: { projectStore: ProjectStore; logger: Logger }) {
  return async (input: { actor: ActorContext; projectId: string; repoId: string }): Promise<Result<void, ProjectError>> => {
    const existing = await deps.projectStore.getProject(input.projectId);
    if (!existing.ok) return err(projectErrorFromStore(existing.error));
    if (!existing.value) return err({ code: "PROJECT_NOT_FOUND", kind: "business", message: "项目不存在" });
    const repo = existing.value.repos.find((r) => r.id === input.repoId);
    if (!repo) return err({ code: "PROJECT_NOT_FOUND", kind: "business", message: "仓库不在该项目中" });

    const allowed = checkProjectPermission(input.actor, input.projectId, "repo:manage", deps.logger);
    if (!allowed.ok) return allowed;

    const removed = await deps.projectStore.removeRepo(input.repoId);
    if (!removed.ok) return err(projectErrorFromStore(removed.error));
    deps.logger.info(
      { event: "project.repo_removed", project_id: input.projectId, repo: repo.repo, user_id: input.actor.userId },
      "仓库从项目移除",
    );
    return ok(undefined);
  };
}
