import { err, ok, type Result } from "@next-build/result";
import type { Logger } from "@next-build/db";

import { checkProjectPermission } from "@/server/application/iam/check-project-permission";
import type { ActorContext } from "@/server/domains/iam/model";
import type { ProjectError } from "@/server/domains/project/errors";
import { projectErrorFromStore } from "@/server/domains/project/errors";
import type { Project } from "@/server/domains/project/model";
import type { ProjectStore } from "@/server/domains/project/ports";
import type { TaskStore } from "@/server/domains/task/ports";

/**
 * 用例：更新项目名称/描述（事务脚本）。不存在返回业务错误 PROJECT_NOT_FOUND。
 * 项目级判定在用例内做：project:update（admin 或项目 owner）。
 */
export function createUpdateProject(deps: { projectStore: ProjectStore; taskStore: TaskStore; logger: Logger }) {
  return async (input: {
    actor: ActorContext;
    id: string;
    name: string;
    description?: string;
    problemStatement?: string;
    desiredOutcome?: string;
    successCriteria?: string[];
    nonGoals?: string;
    targetDate?: Date | null;
    lifecycleStatus?: "planned" | "active" | "blocked" | "completed";
    completionSummary?: string;
    completionCriteriaResults?: Array<{ criterion: string; passed: boolean; evidence?: string }>;
  }): Promise<Result<Project, ProjectError>> => {
    const existing = await deps.projectStore.getProject(input.id);
    if (!existing.ok) return err(projectErrorFromStore(existing.error));
    if (!existing.value) return err({ code: "PROJECT_NOT_FOUND", kind: "business", message: "项目不存在" });
    if (existing.value.project.archivedAt) return err({ code: "PROJECT_ARCHIVED", kind: "business", message: "项目已归档，只能查看历史信息" });

    const allowed = checkProjectPermission(input.actor, input.id, "project:update", deps.logger);
    if (!allowed.ok) return allowed;

    if (input.lifecycleStatus === "completed") {
      const tasks = await deps.taskStore.listTasks(input.id);
      if (!tasks.ok) return err(projectErrorFromStore(tasks.error));
      const accepted = tasks.value.filter((detail) => detail.task.status === "accepted");
      const blocking = tasks.value.filter((detail) => !["accepted", "cancelled"].includes(detail.task.status));
      if (accepted.length === 0 || blocking.length > 0) {
        return err({
          code: "PROJECT_COMPLETION_BLOCKED",
          kind: "business",
          message: accepted.length === 0
            ? "项目至少需要一个已业务验收的任务才能完成"
            : `仍有 ${blocking.length} 个任务未完成业务验收`,
        });
      }
      const results = input.completionCriteriaResults ?? [];
      const criteriaComplete = existing.value.project.successCriteria.length > 0 &&
        results.length === existing.value.project.successCriteria.length &&
        existing.value.project.successCriteria.every((criterion) => results.some((result) => result.criterion === criterion && result.passed));
      if (!criteriaComplete || !input.completionSummary?.trim()) {
        return err({ code: "PROJECT_COMPLETION_BLOCKED", kind: "business", message: "必须逐条确认项目成功标准并填写完成总结" });
      }
    }

    const updated = await deps.projectStore.updateProject(input.id, {
      description: input.description ?? null,
      completedAt: input.lifecycleStatus === "completed" ? new Date() : input.lifecycleStatus ? null : undefined,
      completedBy: input.lifecycleStatus === "completed" ? input.actor.userId : input.lifecycleStatus ? null : undefined,
      completionCriteriaResults: input.lifecycleStatus === "completed" ? input.completionCriteriaResults : input.lifecycleStatus ? [] : undefined,
      completionSummary: input.lifecycleStatus === "completed" ? input.completionSummary : input.lifecycleStatus ? null : undefined,
      desiredOutcome: input.desiredOutcome,
      expectedVersion: existing.value.project.version,
      lifecycleStatus: input.lifecycleStatus,
      name: input.name,
      nonGoals: input.nonGoals,
      problemStatement: input.problemStatement,
      successCriteria: input.successCriteria,
      targetDate: input.targetDate,
    });
    if (!updated.ok) return err(projectErrorFromStore(updated.error));
    if (!updated.value) return err({ code: "PROJECT_NOT_FOUND", kind: "business", message: "项目不存在" });

    deps.logger.info({ event: "project.updated", project_id: input.id, user_id: input.actor.userId }, "项目更新");
    return ok(updated.value);
  };
}
