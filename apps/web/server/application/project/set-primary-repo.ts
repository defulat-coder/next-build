import { err, ok, type Result } from "@next-build/result";
import type { Logger } from "@next-build/db";

import { checkProjectPermission } from "@/server/application/iam/check-project-permission";
import type { ActorContext } from "@/server/domains/iam/model";
import type { ProjectError } from "@/server/domains/project/errors";
import { projectErrorFromStore } from "@/server/domains/project/errors";
import type { ProjectRepo } from "@/server/domains/project/model";
import type { ProjectStore } from "@/server/domains/project/ports";

/** 用例：把当前项目内一个可访问仓库切换为主仓库。 */
export function createSetPrimaryRepo(deps: { projectStore: ProjectStore; logger: Logger }) {
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
    if (repo.accessStatus !== "available") {
      return err({ code: "PROJECT_REPO_UNAVAILABLE", kind: "business", message: "仅可访问仓库能设为主仓库" });
    }
    if (repo.isPrimary) return ok(repo);

    const changed = await deps.projectStore.setPrimaryRepo(input.projectId, input.repoId);
    if (!changed.ok) return err(projectErrorFromStore(changed.error));
    deps.logger.info(
      {
        event: "project.primary_repo_changed",
        from_repo_id: existing.value.primaryRepo?.id ?? null,
        project_id: input.projectId,
        to_repo_id: repo.id,
        user_id: input.actor.userId,
      },
      "项目主仓库已切换",
    );
    return ok({ ...repo, isPrimary: true });
  };
}
