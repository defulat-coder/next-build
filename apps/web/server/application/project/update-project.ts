import { err, ok, type Result } from "@next-build/result";
import type { Logger } from "@next-build/db";

import type { ProjectError } from "@/server/domains/project/errors";
import { projectErrorFromStore } from "@/server/domains/project/errors";
import type { Project } from "@/server/domains/project/model";
import type { ProjectStore } from "@/server/domains/project/ports";

/** 用例：更新项目名称/描述（事务脚本）。不存在返回业务错误 PROJECT_NOT_FOUND。 */
export function createUpdateProject(deps: { projectStore: ProjectStore; logger: Logger }) {
  return async (input: {
    id: string;
    name: string;
    description?: string;
    userId: string;
  }): Promise<Result<Project, ProjectError>> => {
    const updated = await deps.projectStore.updateProject(input.id, {
      description: input.description ?? null,
      name: input.name,
    });
    if (!updated.ok) return err(projectErrorFromStore(updated.error));
    if (!updated.value) return err({ code: "PROJECT_NOT_FOUND", kind: "business", message: "项目不存在" });

    deps.logger.info({ event: "project.updated", project_id: input.id, user_id: input.userId }, "项目更新");
    return ok(updated.value);
  };
}
