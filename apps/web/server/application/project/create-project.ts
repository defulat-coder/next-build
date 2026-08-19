import { err, ok, type Result } from "@next-build/result";
import type { Logger } from "@next-build/db";

import type { IamStore } from "@/server/domains/iam/ports";
import type { ProjectError } from "@/server/domains/project/errors";
import { projectErrorFromStore } from "@/server/domains/project/errors";
import type { Project } from "@/server/domains/project/model";
import type { ProjectStore } from "@/server/domains/project/ports";

/**
 * 用例：创建项目（事务脚本）。路由层已用 requirePermission("project:create") 拦截。
 * 创建成功后把创建者写入 project_members（project:owner）——权限判定以成员表为准（docs/architecture-rbac-menu.md §2）。
 * DB 失败由 store 打 db.error，此处翻译后透出。
 */
export function createCreateProject(deps: { projectStore: ProjectStore; iamStore: IamStore; logger: Logger }) {
  return async (input: {
    name: string;
    description?: string;
    problemStatement?: string;
    desiredOutcome?: string;
    successCriteria?: string[];
    nonGoals?: string;
    targetDate?: Date;
    userId: string;
  }): Promise<Result<Project, ProjectError>> => {
    const project = await deps.projectStore.createProject({
      createdBy: input.userId,
      description: input.description,
      desiredOutcome: input.desiredOutcome,
      name: input.name,
      nonGoals: input.nonGoals,
      problemStatement: input.problemStatement,
      successCriteria: input.successCriteria,
      targetDate: input.targetDate,
    });
    if (!project.ok) return err(projectErrorFromStore(project.error));

    const member = await deps.iamStore.upsertProjectMember({
      projectId: project.value.id,
      role: "project:owner",
      userId: input.userId,
    });
    if (!member.ok) {
      const rollback = await deps.projectStore.deleteProject(project.value.id);
      if (!rollback.ok) {
        deps.logger.error(
          {
            err: rollback.error.cause instanceof Error ? rollback.error.cause : undefined,
            "error.code": rollback.error.code,
            event: "project.create_compensation_failed",
            project_id: project.value.id,
            user_id: input.userId,
          },
          "项目 owner 写入失败且补偿删除失败",
        );
      }
      return err(projectErrorFromStore(member.error));
    }

    deps.logger.info(
      { event: "project.created", project_id: project.value.id, user_id: input.userId },
      "项目创建",
    );
    return ok(project.value);
  };
}
