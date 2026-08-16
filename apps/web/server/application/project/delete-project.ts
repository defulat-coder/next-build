import { err, ok, type Result } from "@next-build/result";
import type { Logger } from "@next-build/db";

import { checkProjectPermission } from "@/server/application/iam/check-project-permission";
import type { ActorContext } from "@/server/domains/iam/model";
import type { ProjectError } from "@/server/domains/project/errors";
import { projectErrorFromStore } from "@/server/domains/project/errors";
import type { ProjectStore } from "@/server/domains/project/ports";

/**
 * 用例：删除项目（仓库、成员随外键级联删除）。
 * 项目级判定在用例内做：project:delete（admin 或项目 owner）。
 */
export function createDeleteProject(deps: { projectStore: ProjectStore; logger: Logger }) {
  return async (input: { actor: ActorContext; id: string }): Promise<Result<void, ProjectError>> => {
    const existing = await deps.projectStore.getProject(input.id);
    if (!existing.ok) return err(projectErrorFromStore(existing.error));
    if (!existing.value) return err({ code: "PROJECT_NOT_FOUND", kind: "business", message: "项目不存在" });

    const allowed = checkProjectPermission(input.actor, input.id, "project:delete", deps.logger);
    if (!allowed.ok) return allowed;

    const deleted = await deps.projectStore.deleteProject(input.id);
    if (!deleted.ok) return err(projectErrorFromStore(deleted.error));
    deps.logger.info({ event: "project.deleted", project_id: input.id, user_id: input.actor.userId }, "项目删除");
    return ok(undefined);
  };
}
