import { err, ok, type Result } from "@next-build/result";
import type { Logger } from "@next-build/db";

import type { ProjectError } from "@/server/domains/project/errors";
import { projectErrorFromStore } from "@/server/domains/project/errors";
import type { Project } from "@/server/domains/project/model";
import type { ProjectStore } from "@/server/domains/project/ports";

/** 用例：创建项目（事务脚本）。DB 失败由 store 打 db.error，此处翻译后透出。 */
export function createCreateProject(deps: { projectStore: ProjectStore; logger: Logger }) {
  return async (input: {
    name: string;
    description?: string;
    userId: string;
  }): Promise<Result<Project, ProjectError>> => {
    const project = await deps.projectStore.createProject({
      createdBy: input.userId,
      description: input.description,
      name: input.name,
    });
    if (!project.ok) return err(projectErrorFromStore(project.error));
    deps.logger.info(
      { event: "project.created", project_id: project.value.id, user_id: input.userId },
      "项目创建",
    );
    return ok(project.value);
  };
}
