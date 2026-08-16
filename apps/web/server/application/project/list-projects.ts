import { err, ok, type Result } from "@next-build/result";

import type { ProjectError } from "@/server/domains/project/errors";
import { projectErrorFromStore } from "@/server/domains/project/errors";
import type { ProjectSummary } from "@/server/domains/project/model";
import type { ProjectStore } from "@/server/domains/project/ports";

/** 用例：项目列表（含各项目仓库数）。 */
export function createListProjects(deps: { projectStore: ProjectStore }) {
  return async (): Promise<Result<ProjectSummary[], ProjectError>> => {
    const result = await deps.projectStore.listProjects();
    if (!result.ok) return err(projectErrorFromStore(result.error));
    return ok(result.value);
  };
}
