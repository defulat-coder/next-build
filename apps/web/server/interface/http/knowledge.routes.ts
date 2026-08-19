import { Hono, type Context } from "hono";

import { logger } from "@/lib/logger";
import { createGetKnowledgeStatus } from "@/server/application/knowledge/get-knowledge-status";
import { createTriggerKnowledgeGeneration } from "@/server/application/knowledge/trigger-knowledge-generation";
import { getGitHubGateway, getKnowledgeProcessManager, knowledgeStore, projectStore } from "@/server/composition-root";
import type { ActorContext } from "@/server/domains/iam/model";
import type { KnowledgeError } from "@/server/domains/knowledge/errors";

import type { AuthVariables } from "./auth-guard";

function actorOf(c: Context<{ Variables: AuthVariables }>): ActorContext {
  return { permissions: c.get("userPermissions"), userId: c.get("authUser").id };
}
function errorResponse(c: Context, error: KnowledgeError) {
  if (error.kind === "system") return c.json({ error: { code: error.code, message: "服务器内部错误" } }, 500);
  const status = error.code === "PROJECT_NOT_FOUND" ? 404 : error.code === "FORBIDDEN" ? 403 : error.code === "CONCURRENCY_CONFLICT" ? 409 : 422;
  return c.json({ error: { code: error.code, message: error.message } }, status);
}

export const knowledgeRoutes = new Hono<{ Variables: AuthVariables }>()
  .get("/:projectId/knowledge", async (c) => {
    const result = await createGetKnowledgeStatus({ knowledgeStore, logger })({ actor: actorOf(c), projectId: c.req.param("projectId") });
    return result.ok ? c.json(result.value) : errorResponse(c, result.error);
  })
  .post("/:projectId/knowledge/generations", async (c) => {
    const result = await createTriggerKnowledgeGeneration({ gateway: getGitHubGateway(), knowledgeStore, logger, projectStore })({
      actor: actorOf(c), projectId: c.req.param("projectId"),
    });
    if (result.ok && result.value.created) getKnowledgeProcessManager().enqueue(result.value.generation.id);
    return result.ok ? c.json(result.value.generation, result.value.created ? 202 : 200) : errorResponse(c, result.error);
  });
