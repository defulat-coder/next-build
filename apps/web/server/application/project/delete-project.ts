import { err, ok, type Result } from "@next-build/result";
import type { Logger } from "@next-build/db";

import type { ProjectError } from "@/server/domains/project/errors";
import { projectErrorFromStore } from "@/server/domains/project/errors";
import type { ProjectStore } from "@/server/domains/project/ports";

/** 用例：删除项目（仓库随外键级联删除）。 */
export function createDeleteProject(deps: { projectStore: ProjectStore; logger: Logger }) {
  return async (input: { id: string; userId: string }): Promise<Result<void, ProjectError>> => {
    const existing = await deps.projectStore.getProject(input.id);
    if (!existing.ok) return err(projectErrorFromStore(existing.error));
    if (!existing.value) return err({ code: "PROJECT_NOT_FOUND", kind: "business", message: "项目不存在" });

    const deleted = await deps.projectStore.deleteProject(input.id);
    if (!deleted.ok) return err(projectErrorFromStore(deleted.error));
    deps.logger.info({ event: "project.deleted", project_id: input.id, user_id: input.userId }, "项目删除");
    return ok(undefined);
  };
}
