import { err, ok, type Result } from "@next-build/result";
import type { Logger } from "@next-build/db";

import { checkProjectPermission } from "@/server/application/iam/check-project-permission";
import type { ActorContext } from "@/server/domains/iam/model";
import type { KnowledgeError } from "@/server/domains/knowledge/errors";
import { knowledgeErrorFromStore } from "@/server/domains/knowledge/errors";
import type { KnowledgeGeneration } from "@/server/domains/knowledge/model";
import type { KnowledgeDocument } from "@next-build/db";
import type { KnowledgeStore } from "@/server/domains/knowledge/ports";

export interface KnowledgeStatus {
  generations: KnowledgeGeneration[];
  publishedGeneration: KnowledgeGeneration | null;
  latestGeneration: KnowledgeGeneration | null;
  stale: boolean;
  asOf: Date | null;
  documents: KnowledgeDocument[];
}

export function createGetKnowledgeStatus(deps: { knowledgeStore: KnowledgeStore; logger: Logger }) {
  return async (input: { actor: ActorContext; projectId: string }): Promise<Result<KnowledgeStatus, KnowledgeError>> => {
    const allowed = checkProjectPermission(input.actor, input.projectId, "wiki:read", deps.logger);
    if (!allowed.ok) return allowed;
    const result = await deps.knowledgeStore.listGenerations(input.projectId);
    if (!result.ok) return err(knowledgeErrorFromStore(result.error));
    const documents = await deps.knowledgeStore.listPublishedDocuments(input.projectId);
    if (!documents.ok) return err(knowledgeErrorFromStore(documents.error));
    const latestGeneration = result.value[0] ?? null;
    const publishedGeneration = result.value.find((generation) => generation.status === "published") ?? null;
    return ok({
      asOf: publishedGeneration?.publishedAt ?? null,
      documents: documents.value,
      generations: result.value,
      latestGeneration,
      publishedGeneration,
      stale: !publishedGeneration || latestGeneration?.id !== publishedGeneration.id,
    });
  };
}
