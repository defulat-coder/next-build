import { err, ok, type Result } from "@next-build/result";
import type { Logger } from "@next-build/db";

import { checkProjectPermission } from "@/server/application/iam/check-project-permission";
import type { ActorContext } from "@/server/domains/iam/model";
import type { ProjectError } from "@/server/domains/project/errors";
import { projectErrorFromStore } from "@/server/domains/project/errors";
import { deriveReadiness, type ProjectDetail } from "@/server/domains/project/model";
import type { ProjectStore } from "@/server/domains/project/ports";

/** 用例：项目详情（含仓库列表与就绪状态）；必须拥有当前项目的 project:read。 */
export function createGetProject(deps: { projectStore: ProjectStore; logger: Logger }) {
  return async (input: { actor: ActorContext; id: string }): Promise<Result<ProjectDetail, ProjectError>> => {
    const allowed = checkProjectPermission(input.actor, input.id, "project:read", deps.logger);
    if (!allowed.ok) return allowed;

    const result = await deps.projectStore.getProject(input.id);
    if (!result.ok) return err(projectErrorFromStore(result.error));
    if (!result.value) return err({ code: "PROJECT_NOT_FOUND", kind: "business", message: "项目不存在" });
    return ok({
      ...result.value,
      readiness: deriveReadiness({
        primaryRepo: result.value.primaryRepo,
        repoCount: result.value.repos.length,
      }),
    });
  };
}
