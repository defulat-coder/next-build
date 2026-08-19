import { err, ok, type Result } from "@next-build/result";

import { isSiteAdmin } from "@/server/domains/iam/access";
import type { ActorContext } from "@/server/domains/iam/model";
import type { ProjectError } from "@/server/domains/project/errors";
import { projectErrorFromStore } from "@/server/domains/project/errors";
import { deriveReadiness, type ProjectSummary } from "@/server/domains/project/model";
import type { ProjectStore } from "@/server/domains/project/ports";

/**
 * 用例：项目列表（含各项目仓库数）。
 * 非 admin 只返回当前项目授权快照中明确拥有 project:read 的项目。
 */
export function createListProjects(deps: { projectStore: ProjectStore }) {
  return async (actor: ActorContext): Promise<Result<ProjectSummary[], ProjectError>> => {
    const result = await deps.projectStore.listProjects();
    if (!result.ok) return err(projectErrorFromStore(result.error));
    const summaries = result.value.map((project) => ({
      ...project,
      readiness: deriveReadiness(project),
    }));
    if (isSiteAdmin(actor.permissions)) return ok(summaries);
    const readableProjectIds = new Set(
      actor.permissions.projects.filter((p) => p.permissions.includes("project:read")).map((p) => p.projectId),
    );
    return ok(summaries.filter((p) => readableProjectIds.has(p.id)));
  };
}
