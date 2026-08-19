import { createHash } from "node:crypto";

import { err, ok, type Result } from "@next-build/result";
import type { Logger } from "@next-build/db";

import { checkProjectPermission } from "@/server/application/iam/check-project-permission";
import type { ActorContext } from "@/server/domains/iam/model";
import type { KnowledgeError } from "@/server/domains/knowledge/errors";
import { knowledgeErrorFromStore } from "@/server/domains/knowledge/errors";
import type { KnowledgeGeneration, KnowledgeSource } from "@/server/domains/knowledge/model";
import type { KnowledgeStore } from "@/server/domains/knowledge/ports";
import { projectErrorFromStore } from "@/server/domains/project/errors";
import type { GitHubGateway, ProjectStore } from "@/server/domains/project/ports";

export function createTriggerKnowledgeGeneration(deps: {
  knowledgeStore: KnowledgeStore;
  projectStore: ProjectStore;
  gateway: GitHubGateway;
  logger: Logger;
}) {
  return async (input: { actor: ActorContext; projectId: string }): Promise<Result<{ generation: KnowledgeGeneration; created: boolean }, KnowledgeError>> => {
    const allowed = checkProjectPermission(input.actor, input.projectId, "wiki:generate", deps.logger);
    if (!allowed.ok) return allowed;
    return queueKnowledgeGeneration(deps, { projectId: input.projectId, trigger: "manual", userId: input.actor.userId });
  };
}

/** 系统/人工共用的知识入队合同；授权由各 driving adapter 在调用前完成。 */
export async function queueKnowledgeGeneration(
  deps: { knowledgeStore: KnowledgeStore; projectStore: ProjectStore; gateway: GitHubGateway; logger: Logger },
  input: { projectId: string; trigger: "manual" | "delivery_merged" | "initial"; userId?: string },
): Promise<Result<{ generation: KnowledgeGeneration; created: boolean }, KnowledgeError>> {
    const project = await deps.projectStore.getProject(input.projectId);
    if (!project.ok) return err(projectErrorFromStore(project.error));
    if (!project.value) return err({ code: "PROJECT_NOT_FOUND", kind: "business", message: "项目不存在" });
    if (project.value.project.archivedAt) return err({ code: "PROJECT_ARCHIVED", kind: "business", message: "项目已归档" });
    const readable = project.value.repos;
    if (readable.length === 0 || readable.some((repo) => repo.accessStatus !== "available")) {
      return err({ code: "KNOWLEDGE_SOURCE_NOT_READY", kind: "business", message: "项目全部仓库可访问后才能生成完整 Wiki" });
    }
    const resolved = await Promise.all(readable.map((repo) => deps.gateway.resolveRepoHead(repo.repo)));
    const failed = resolved.find((result) => !result.ok);
    if (failed && !failed.ok) return failed;
    const sourceSet: KnowledgeSource[] = resolved.flatMap((result) => result.ok
      ? [{ repo: result.value.repo, sha: result.value.headSha }]
      : []).sort((a, b) => a.repo.localeCompare(b.repo));
    const sourceFingerprint = createHash("sha256").update(JSON.stringify(sourceSet)).digest("hex");
    const generation = await deps.knowledgeStore.createGeneration({
      projectId: input.projectId,
      sourceFingerprint,
      sourceSet,
      trigger: input.trigger,
    });
    if (!generation.ok) return err(knowledgeErrorFromStore(generation.error));
    deps.logger.info(
      {
        event: generation.value.created ? "wiki.generation_queued" : "wiki.generation_deduplicated",
        generation_id: generation.value.generation.id,
        project_id: input.projectId,
        source_count: sourceSet.length,
        user_id: input.userId ?? null,
      },
      generation.value.created ? "知识版本已进入生成队列" : "相同源码版本已存在",
    );
    return ok(generation.value);
}
