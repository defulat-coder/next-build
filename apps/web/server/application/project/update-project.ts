import { err, ok, type Result } from "@next-build/result";
import type { Logger } from "@next-build/db";

import { checkProjectPermission } from "@/server/application/iam/check-project-permission";
import type { ActorContext } from "@/server/domains/iam/model";
import type { ProjectError } from "@/server/domains/project/errors";
import { projectErrorFromStore } from "@/server/domains/project/errors";
import type { Project } from "@/server/domains/project/model";
import type { ProjectStore } from "@/server/domains/project/ports";

/**
 * 用例：更新项目名称/描述（事务脚本）。不存在返回业务错误 PROJECT_NOT_FOUND。
 * 项目级判定在用例内做：project:update（admin 或项目 owner）。
 */
export function createUpdateProject(deps: { projectStore: ProjectStore; logger: Logger }) {
  return async (input: {
    actor: ActorContext;
    id: string;
    name: string;
    description?: string;
  }): Promise<Result<Project, ProjectError>> => {
    const existing = await deps.projectStore.getProject(input.id);
    if (!existing.ok) return err(projectErrorFromStore(existing.error));
    if (!existing.value) return err({ code: "PROJECT_NOT_FOUND", kind: "business", message: "项目不存在" });

    const allowed = checkProjectPermission(input.actor, input.id, "project:update", deps.logger);
    if (!allowed.ok) return allowed;

    const updated = await deps.projectStore.updateProject(input.id, {
      description: input.description ?? null,
      name: input.name,
    });
    if (!updated.ok) return err(projectErrorFromStore(updated.error));
    if (!updated.value) return err({ code: "PROJECT_NOT_FOUND", kind: "business", message: "项目不存在" });

    deps.logger.info({ event: "project.updated", project_id: input.id, user_id: input.actor.userId }, "项目更新");
    return ok(updated.value);
  };
}
