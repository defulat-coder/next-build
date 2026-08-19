import { Hono, type Context } from "hono";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { createCreateTask } from "@/server/application/task/create-task";
import { createCancelTask } from "@/server/application/task/cancel-task";
import { createDecideTaskAcceptance } from "@/server/application/task/decide-task-acceptance";
import { createGetTask } from "@/server/application/task/get-task";
import { createListTasks } from "@/server/application/task/list-tasks";
import { createRetryTask } from "@/server/application/task/retry-task";
import { createReconcileDelivery } from "@/server/application/task/reconcile-delivery";
import { getGitHubGateway, getOutboxDispatcher, getTaskProcessManager, iamStore, projectStore, taskStore } from "@/server/composition-root";
import type { ActorContext } from "@/server/domains/iam/model";
import type { TaskError } from "@/server/domains/task/errors";

import type { AuthVariables } from "./auth-guard";

const createTaskSchema = z.object({
  acceptanceCriteria: z.array(z.string().trim().min(1).max(300)).min(1).max(20),
  idempotencyKey: z.string().trim().min(8).max(100),
  nonGoals: z.string().trim().min(1).max(2000),
  projectRepoId: z.string().trim().min(1),
  requirement: z.string().trim().min(1).max(10000),
  reviewerId: z.string().trim().min(1),
  riskNotes: z.string().trim().min(1).max(2000),
  title: z.string().trim().min(1).max(100),
  validationCommands: z.array(z.string().trim().min(1).max(300)).min(1).max(20),
});

const acceptanceSchema = z.object({
  criteriaResults: z.array(z.object({
    criterion: z.string().trim().min(1).max(300),
    evidence: z.string().trim().max(1000).optional(),
    passed: z.boolean(),
  })).min(1).max(20),
  decision: z.enum(["accepted", "rejected"]),
  environment: z.string().trim().min(1).max(200),
  evidence: z.array(z.object({ label: z.string().trim().min(1).max(100), url: z.url() })).max(20).default([]),
  notes: z.string().trim().max(2000).optional(),
});

function actorOf(c: Context<{ Variables: AuthVariables }>): ActorContext {
  return { permissions: c.get("userPermissions"), userId: c.get("authUser").id };
}

function errorResponse(c: Context, error: TaskError) {
  if (error.kind === "system") {
    return c.json({ error: { code: error.code, message: "服务器内部错误" } }, 500);
  }
  const status = error.code === "TASK_NOT_FOUND" || error.code === "PROJECT_NOT_FOUND"
    ? 404
    : error.code === "FORBIDDEN"
      ? 403
      : error.code === "CONCURRENCY_CONFLICT" || error.code === "TASK_IDEMPOTENCY_CONFLICT"
        ? 409
        : 422;
  return c.json({ error: { code: error.code, message: error.message } }, status);
}

/** 项目内任务 API；任务只能通过 Project 的 ResolveExecutionTarget 合同入队。 */
export const taskRoutes = new Hono<{ Variables: AuthVariables }>()
  .get("/:projectId/tasks", async (c) => {
    getTaskProcessManager();
    const result = await createListTasks({ logger, taskStore })({
      actor: actorOf(c),
      projectId: c.req.param("projectId"),
    });
    return result.ok ? c.json(result.value) : errorResponse(c, result.error);
  })
  .post("/:projectId/tasks", async (c) => {
    const parsed = createTaskSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: { code: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "入参校验失败" } }, 400);
    }
    const result = await createCreateTask({ dispatcher: getTaskProcessManager(), gateway: getGitHubGateway(), iamStore, logger, projectStore, taskStore })({
      ...parsed.data,
      actor: actorOf(c),
      projectId: c.req.param("projectId"),
    });
    return result.ok ? c.json(result.value.detail, result.value.created ? 201 : 200) : errorResponse(c, result.error);
  })
  .get("/:projectId/tasks/:taskId", async (c) => {
    const result = await createGetTask({ logger, taskStore })({
      actor: actorOf(c),
      projectId: c.req.param("projectId"),
      taskId: c.req.param("taskId"),
    });
    return result.ok ? c.json(result.value) : errorResponse(c, result.error);
  })
  .post("/:projectId/tasks/:taskId/retry", async (c) => {
    const result = await createRetryTask({ dispatcher: getTaskProcessManager(), logger, taskStore })({
      actor: actorOf(c),
      projectId: c.req.param("projectId"),
      taskId: c.req.param("taskId"),
    });
    return result.ok ? c.json(result.value, 202) : errorResponse(c, result.error);
  })
  .post("/:projectId/tasks/:taskId/cancel", async (c) => {
    const result = await createCancelTask({ logger, taskStore })({ actor: actorOf(c), projectId: c.req.param("projectId"), taskId: c.req.param("taskId") });
    return result.ok ? c.json(result.value) : errorResponse(c, result.error);
  })
  .post("/:projectId/tasks/:taskId/reconcile", async (c) => {
    const result = await createReconcileDelivery({ gateway: getGitHubGateway(), logger, taskStore })({
      actor: actorOf(c),
      projectId: c.req.param("projectId"),
      taskId: c.req.param("taskId"),
    });
    if (result.ok) getOutboxDispatcher().start();
    return result.ok ? c.json(result.value) : errorResponse(c, result.error);
  })
  .post("/:projectId/tasks/:taskId/acceptance", async (c) => {
    const parsed = acceptanceSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: { code: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "验收入参无效" } }, 400);
    }
    const result = await createDecideTaskAcceptance({ logger, taskStore })({
      ...parsed.data,
      actor: actorOf(c),
      projectId: c.req.param("projectId"),
      taskId: c.req.param("taskId"),
    });
    return result.ok ? c.json(result.value) : errorResponse(c, result.error);
  });
