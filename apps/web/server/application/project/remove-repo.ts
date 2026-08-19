import { err, ok, type Result } from "@next-build/result";
import type { Logger } from "@next-build/db";

import { checkProjectPermission } from "@/server/application/iam/check-project-permission";
import type { ActorContext } from "@/server/domains/iam/model";
import type { ProjectError } from "@/server/domains/project/errors";
import { projectErrorFromStore } from "@/server/domains/project/errors";
import type { ProjectStore } from "@/server/domains/project/ports";

/** 用例：从项目移除仓库。项目级判定在用例内做：repo:manage（admin 或项目 owner）。 */
export function createRemoveRepo(deps: { projectStore: ProjectStore; logger: Logger }) {
  return async (input: {
    actor: ActorContext;
    projectId: string;
    repoId: string;
    replacementPrimaryRepoId?: string;
  }): Promise<Result<void, ProjectError>> => {
    const existing = await deps.projectStore.getProject(input.projectId);
    if (!existing.ok) return err(projectErrorFromStore(existing.error));
    if (!existing.value) return err({ code: "PROJECT_NOT_FOUND", kind: "business", message: "项目不存在" });
    if (existing.value.project.archivedAt) return err({ code: "PROJECT_ARCHIVED", kind: "business", message: "项目已归档，只能查看历史配置" });
    const repo = existing.value.repos.find((r) => r.id === input.repoId);
    if (!repo) return err({ code: "PROJECT_REPO_NOT_FOUND", kind: "business", message: "仓库不在该项目中" });

    const allowed = checkProjectPermission(input.actor, input.projectId, "repo:manage", deps.logger);
    if (!allowed.ok) return allowed;

    let replacement = null;
    if (repo.isPrimary && existing.value.repos.length > 1) {
      if (!input.replacementPrimaryRepoId || input.replacementPrimaryRepoId === repo.id) {
        return err({
          code: "PRIMARY_REPO_REPLACEMENT_REQUIRED",
          kind: "business",
          message: "移除主仓库前必须选择一个可用的替代主仓库",
        });
      }
      replacement = existing.value.repos.find((candidate) => candidate.id === input.replacementPrimaryRepoId) ?? null;
      if (!replacement) {
        return err({ code: "PROJECT_REPO_NOT_FOUND", kind: "business", message: "替代仓库不在该项目中" });
      }
      if (replacement.accessStatus !== "available") {
        return err({ code: "PROJECT_REPO_UNAVAILABLE", kind: "business", message: "替代主仓库必须可访问" });
      }
    }

    const removed = await deps.projectStore.removeRepo({
      projectId: input.projectId,
      repoId: input.repoId,
      expectedVersion: repo.version,
      replacementPrimaryRepoId: replacement?.id,
      replacementExpectedVersion: replacement?.version,
    });
    if (!removed.ok) return err(projectErrorFromStore(removed.error));
    if (replacement) {
      deps.logger.info(
        {
          event: "project.primary_repo_changed",
          from_repo_id: repo.id,
          project_id: input.projectId,
          to_repo_id: replacement.id,
          user_id: input.actor.userId,
        },
        "移除主仓库时切换替代主仓库",
      );
    }
    deps.logger.info(
      {
        event: "project.repo_removed",
        project_id: input.projectId,
        repo: repo.repo,
        repo_id: repo.id,
        user_id: input.actor.userId,
      },
      "仓库从项目移除",
    );
    return ok(undefined);
  };
}
