import { Hono, type Context } from "hono";
import { getCookie } from "hono/cookie";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { createGetCurrentUser } from "@/server/application/auth/get-current-user";
import { createAddRepo } from "@/server/application/project/add-repo";
import { createCreateProject } from "@/server/application/project/create-project";
import { createDeleteProject } from "@/server/application/project/delete-project";
import { createGetProject } from "@/server/application/project/get-project";
import { createListProjects } from "@/server/application/project/list-projects";
import { createRemoveRepo } from "@/server/application/project/remove-repo";
import { createUpdateProject } from "@/server/application/project/update-project";
import { authStore, getGitHubGateway, projectStore } from "@/server/composition-root";
import type { ProjectError } from "@/server/domains/project/errors";
import type { AuthUser } from "@/server/domains/auth/model";
import { parseRepoInput } from "@/server/infrastructure/gateways/github-client";

import { SESSION_COOKIE } from "./cookies";

const createProjectSchema = z.object({
  description: z.string().trim().max(200, "描述最长 200 字").optional(),
  name: z.string().trim().min(1, "项目名称必填").max(50, "项目名称最长 50 字"),
});

const addRepoSchema = z.object({
  repo: z.string().min(1, "仓库必填"),
});

/**
 * 项目 HTTP 路由（接口层）：只做入参校验 / 状态码翻译，编排逻辑在 application/project 用例里。
 * 整站守卫（auth-guard）已保证会话有效，此处直接取当前用户。
 */

/** 统一错误翻译：业务异常 message 透传 + 对应 4xx，系统异常替换为通用文案 500（AGENTS.md「异常处理」）。 */
function errorResponse(c: Context, error: ProjectError) {
  if (error.kind === "system") {
    return c.json({ error: { code: error.code, message: "服务器内部错误" } }, 500);
  }
  const status =
    error.code === "PROJECT_NOT_FOUND" ? 404 : error.code === "PROJECT_REPO_EXISTS" ? 409 : 422;
  return c.json({ error: { code: error.code, message: error.message } }, status);
}

/** 取当前登录用户；守卫之后的正常路径必能取到，取不到按系统异常抛错由 onError 兜底。 */
async function currentUser(c: Context): Promise<AuthUser> {
  const token = getCookie(c, SESSION_COOKIE);
  const result = await createGetCurrentUser({ authStore })(token ?? "");
  if (!result.ok || !result.value) {
    throw new Error("auth-guard 之后取不到当前用户");
  }
  return result.value;
}

export const projectRoutes = new Hono()

  // 项目列表（含仓库数）。
  .get("/", async (c) => {
    const result = await createListProjects({ projectStore })();
    if (!result.ok) return errorResponse(c, result.error);
    return c.json(result.value);
  })

  // 新建项目。
  .post("/", async (c) => {
    const parsed = createProjectSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json(
        { error: { code: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "入参校验失败" } },
        400,
      );
    }
    const user = await currentUser(c);
    const result = await createCreateProject({ logger, projectStore })({ ...parsed.data, userId: user.id });
    if (!result.ok) return errorResponse(c, result.error);
    return c.json(result.value, 201);
  })

  // 项目详情（含仓库列表）。
  .get("/:id", async (c) => {
    const result = await createGetProject({ projectStore })(c.req.param("id"));
    if (!result.ok) return errorResponse(c, result.error);
    return c.json(result.value);
  })

  // 更新项目（名称/描述）。
  .patch("/:id", async (c) => {
    const parsed = createProjectSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json(
        { error: { code: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "入参校验失败" } },
        400,
      );
    }
    const user = await currentUser(c);
    const result = await createUpdateProject({ logger, projectStore })({
      ...parsed.data,
      id: c.req.param("id"),
      userId: user.id,
    });
    if (!result.ok) return errorResponse(c, result.error);
    return c.json(result.value);
  })

  // 删除项目（仓库级联删除）。
  .delete("/:id", async (c) => {
    const user = await currentUser(c);
    const result = await createDeleteProject({ logger, projectStore })({ id: c.req.param("id"), userId: user.id });
    if (!result.ok) return errorResponse(c, result.error);
    return c.json({ ok: true });
  })

  // 添加仓库：支持 owner/repo 或粘贴 GitHub URL；先经 GitHub 校验再入库。
  .post("/:id/repos", async (c) => {
    const parsed = addRepoSchema.safeParse(await c.req.json().catch(() => null));
    const repo = parsed.success ? parseRepoInput(parsed.data.repo) : null;
    if (!repo) {
      return c.json(
        { error: { code: "VALIDATION_FAILED", message: "仓库格式应为 owner/repo 或 GitHub 仓库 URL" } },
        400,
      );
    }
    const user = await currentUser(c);
    const result = await createAddRepo({ gateway: getGitHubGateway(), logger, projectStore })({
      projectId: c.req.param("id"),
      repo,
      userId: user.id,
    });
    if (!result.ok) return errorResponse(c, result.error);
    return c.json(result.value, 201);
  })

  // 移除仓库。
  .delete("/:id/repos/:repoId", async (c) => {
    const user = await currentUser(c);
    const result = await createRemoveRepo({ logger, projectStore })({
      projectId: c.req.param("id"),
      repoId: c.req.param("repoId"),
      userId: user.id,
    });
    if (!result.ok) return errorResponse(c, result.error);
    return c.json({ ok: true });
  });
