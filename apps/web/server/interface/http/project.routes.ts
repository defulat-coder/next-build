import { Hono, type Context } from "hono";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { createAddRepo } from "@/server/application/project/add-repo";
import { createCreateProject } from "@/server/application/project/create-project";
import { createDeleteProject } from "@/server/application/project/delete-project";
import { createGetProject } from "@/server/application/project/get-project";
import { createGetProjectDeliveryOverview } from "@/server/application/project/get-project-delivery-overview";
import { createListProjects } from "@/server/application/project/list-projects";
import { createRevalidateRepo } from "@/server/application/project/revalidate-repo";
import { createRemoveRepo } from "@/server/application/project/remove-repo";
import { createSetPrimaryRepo } from "@/server/application/project/set-primary-repo";
import { createUpdateProject } from "@/server/application/project/update-project";
import { getGitHubGateway, iamStore, knowledgeStore, projectStore, taskStore } from "@/server/composition-root";
import type { ProjectError } from "@/server/domains/project/errors";
import type { ActorContext } from "@/server/domains/iam/model";
import { parseRepoInput } from "@/server/infrastructure/gateways/github-client";

import type { AuthVariables } from "./auth-guard";
import { requirePermission } from "./permission-guard";

const createProjectSchema = z.object({
  description: z.string().trim().max(200, "描述最长 200 字").optional(),
  desiredOutcome: z.string().trim().max(1000, "期望结果最长 1000 字").optional(),
  name: z.string().trim().min(1, "项目名称必填").max(50, "项目名称最长 50 字"),
  nonGoals: z.string().trim().max(1000, "非目标最长 1000 字").optional(),
  problemStatement: z.string().trim().max(1000, "问题陈述最长 1000 字").optional(),
  successCriteria: z.array(z.string().trim().min(1).max(200)).max(10).optional(),
  targetDate: z.coerce.date().optional(),
});

const updateProjectSchema = createProjectSchema.extend({
  completionCriteriaResults: z.array(z.object({ criterion: z.string().trim().min(1).max(200), evidence: z.string().trim().max(1000).optional(), passed: z.boolean() })).max(10).optional(),
  completionSummary: z.string().trim().max(3000).optional(),
  lifecycleStatus: z.enum(["planned", "active", "blocked", "completed"]).optional(),
  targetDate: z.coerce.date().nullable().optional(),
});

const addRepoSchema = z.object({
  repo: z.string().min(1, "仓库必填"),
});

const removeRepoSchema = z.object({
  replacementPrimaryRepoId: z.string().min(1).optional(),
});

/**
 * 项目 HTTP 路由（接口层）：只做入参校验 / 状态码翻译，编排逻辑在 application/project 用例里。
 * 整站守卫（auth-guard）已把当前用户与权限码集合放进 context，此处直接取用。
 */

/** 统一错误翻译：业务异常 message 透传 + 对应 4xx，系统异常替换为通用文案 500（AGENTS.md「异常处理」）。 */
function errorResponse(c: Context, error: ProjectError) {
  if (error.kind === "system") {
    return c.json({ error: { code: error.code, message: "服务器内部错误" } }, 500);
  }
  const status =
    error.code === "PROJECT_NOT_FOUND"
      ? 404
      : error.code === "PROJECT_REPO_NOT_FOUND"
        ? 404
        : error.code === "PROJECT_REPO_EXISTS" ||
            error.code === "PRIMARY_REPO_REPLACEMENT_REQUIRED" ||
            error.code === "CONCURRENCY_CONFLICT"
        ? 409
        : error.code === "FORBIDDEN"
          ? 403
          : 422;
  return c.json({ error: { code: error.code, message: error.message } }, status);
}

/** 操作者上下文：authGuard 已解析的 userId + 权限码集合，用例内项目级判定直接用，不重复查库。 */
function actorOf(c: Context<{ Variables: AuthVariables }>): ActorContext {
  return { permissions: c.get("userPermissions"), userId: c.get("authUser").id };
}

export const projectRoutes = new Hono<{ Variables: AuthVariables }>()

  // 项目列表（含仓库数；非 admin 在用例内过滤为「创建的 ∪ 是成员的」）。
  .get("/", async (c) => {
    const result = await createListProjects({ projectStore })(actorOf(c));
    if (!result.ok) return errorResponse(c, result.error);
    return c.json(result.value);
  })

  // 新建项目（整站级 project:create 在中间件判定；用例把创建者写入 project_members owner）。
  .post("/", requirePermission("project:create"), async (c) => {
    const parsed = createProjectSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json(
        { error: { code: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "入参校验失败" } },
        400,
      );
    }
    const result = await createCreateProject({ iamStore, logger, projectStore })({
      ...parsed.data,
      userId: c.get("authUser").id,
    });
    if (!result.ok) return errorResponse(c, result.error);
    return c.json(result.value, 201);
  })

  // 项目详情（含仓库列表）。
  .get("/:id/overview", async (c) => {
    const result = await createGetProjectDeliveryOverview({ iamStore, knowledgeStore, logger, projectStore, taskStore })({ actor: actorOf(c), projectId: c.req.param("id") });
    if (!result.ok) return errorResponse(c, result.error);
    return c.json(result.value);
  })

  // 项目详情（含仓库列表）。
  .get("/:id", async (c) => {
    const result = await createGetProject({ logger, projectStore })({ actor: actorOf(c), id: c.req.param("id") });
    if (!result.ok) return errorResponse(c, result.error);
    return c.json(result.value);
  })

  // 更新项目（名称/描述；项目级 owner 判定在用例内做）。
  .patch("/:id", async (c) => {
    const parsed = updateProjectSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json(
        { error: { code: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "入参校验失败" } },
        400,
      );
    }
    const result = await createUpdateProject({ logger, projectStore, taskStore })({
      ...parsed.data,
      actor: actorOf(c),
      id: c.req.param("id"),
    });
    if (!result.ok) return errorResponse(c, result.error);
    return c.json(result.value);
  })

  // 归档项目：保留任务、交付、知识与成员审计链。
  .delete("/:id", async (c) => {
    const result = await createDeleteProject({ logger, projectStore })({
      actor: actorOf(c),
      id: c.req.param("id"),
    });
    if (!result.ok) return errorResponse(c, result.error);
    return c.json({ ok: true });
  })

  // 添加仓库：支持 owner/repo 或粘贴 GitHub URL；先经 GitHub 校验再入库（repo:manage 在用例内判定）。
  .post("/:id/repos", async (c) => {
    const parsed = addRepoSchema.safeParse(await c.req.json().catch(() => null));
    const repo = parsed.success ? parseRepoInput(parsed.data.repo) : null;
    if (!repo) {
      return c.json(
        { error: { code: "VALIDATION_FAILED", message: "仓库格式应为 owner/repo 或 GitHub 仓库 URL" } },
        400,
      );
    }
    const result = await createAddRepo({ gateway: getGitHubGateway(), logger, projectStore })({
      actor: actorOf(c),
      projectId: c.req.param("id"),
      repo,
    });
    if (!result.ok) return errorResponse(c, result.error);
    return c.json(result.value, 201);
  })

  // 仅可访问仓库可主动设为主仓库（repo:manage 在用例内判定）。
  .put("/:id/repos/:repoId/primary", async (c) => {
    const result = await createSetPrimaryRepo({ logger, projectStore })({
      actor: actorOf(c),
      projectId: c.req.param("id"),
      repoId: c.req.param("repoId"),
    });
    if (!result.ok) return errorResponse(c, result.error);
    return c.json(result.value);
  })

  // 手动复检：成功/404 写入新状态；网络或限流保留旧状态。
  .post("/:id/repos/:repoId/revalidate", async (c) => {
    const result = await createRevalidateRepo({ gateway: getGitHubGateway(), logger, projectStore })({
      actor: actorOf(c),
      projectId: c.req.param("id"),
      repoId: c.req.param("repoId"),
    });
    if (!result.ok) return errorResponse(c, result.error);
    return c.json(result.value);
  })

  // 移除仓库；删除主仓且还有其他仓库时，显式替代主仓与删除在同一事务完成。
  .delete("/:id/repos/:repoId", async (c) => {
    const parsed = removeRepoSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json(
        { error: { code: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "入参校验失败" } },
        400,
      );
    }
    const result = await createRemoveRepo({ logger, projectStore })({
      actor: actorOf(c),
      projectId: c.req.param("id"),
      repoId: c.req.param("repoId"),
      replacementPrimaryRepoId: parsed.data.replacementPrimaryRepoId,
    });
    if (!result.ok) return errorResponse(c, result.error);
    return c.json({ ok: true });
  });
