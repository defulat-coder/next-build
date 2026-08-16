import { err, ok, type Result } from "@next-build/result";

import type { ProjectError } from "@/server/domains/project/errors";
import { projectErrorFromStore } from "@/server/domains/project/errors";
import type { Project, ProjectRepo } from "@/server/domains/project/model";
import type { ProjectStore } from "@/server/domains/project/ports";

/** 用例：项目详情（含仓库列表）；不存在返回业务错误 PROJECT_NOT_FOUND。 */
export function createGetProject(deps: { projectStore: ProjectStore }) {
  return async (id: string): Promise<Result<{ project: Project; repos: ProjectRepo[] }, ProjectError>> => {
    const result = await deps.projectStore.getProject(id);
    if (!result.ok) return err(projectErrorFromStore(result.error));
    if (!result.value) return err({ code: "PROJECT_NOT_FOUND", kind: "business", message: "项目不存在" });
    return ok(result.value);
  };
}
