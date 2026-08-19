import { err, ok, type Result } from "@next-build/result";
import type { Logger } from "@next-build/db";

import { checkProjectPermission } from "@/server/application/iam/check-project-permission";
import type { ActorContext } from "@/server/domains/iam/model";
import type { ProjectError } from "@/server/domains/project/errors";
import { projectErrorFromStore } from "@/server/domains/project/errors";
import type { ProjectStore } from "@/server/domains/project/ports";

/** 用例：归档项目。保留任务、交付与知识审计链，项目级判定仍使用 project:delete。 */
export function createDeleteProject(deps: { projectStore: ProjectStore; logger: Logger }) {
  return async (input: { actor: ActorContext; id: string }): Promise<Result<void, ProjectError>> => {
    const existing = await deps.projectStore.getProject(input.id);
    if (!existing.ok) return err(projectErrorFromStore(existing.error));
    if (!existing.value) return err({ code: "PROJECT_NOT_FOUND", kind: "business", message: "项目不存在" });

    const allowed = checkProjectPermission(input.actor, input.id, "project:delete", deps.logger);
    if (!allowed.ok) return allowed;

    const archived = await deps.projectStore.archiveProject(input.id, existing.value.project.version);
    if (!archived.ok) return err(projectErrorFromStore(archived.error));
    if (!archived.value) return err({ code: "PROJECT_NOT_FOUND", kind: "business", message: "项目不存在" });
    deps.logger.info({ event: "project.archived", project_id: input.id, user_id: input.actor.userId }, "项目归档");
    return ok(undefined);
  };
}
