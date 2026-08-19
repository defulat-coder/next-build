import { Hono, type Context } from "hono";
import { z } from "zod";

import { PERMISSION_CODES, PROJECT_ROLE_CODES, SITE_ROLE_CODES } from "@next-build/db/permissions";

import { logger } from "@/lib/logger";
import { createAddProjectMember } from "@/server/application/iam/add-project-member";
import { createAssignSiteRole } from "@/server/application/iam/assign-site-role";
import { createGetMyPermissions } from "@/server/application/iam/get-my-permissions";
import { createListRoles } from "@/server/application/iam/list-roles";
import { createListProjectMembers } from "@/server/application/iam/list-project-members";
import { createListUsers } from "@/server/application/iam/list-users";
import { createRemoveProjectMember } from "@/server/application/iam/remove-project-member";
import { createUpdateProjectMember } from "@/server/application/iam/update-project-member";
import { createUpdateRolePermissions } from "@/server/application/iam/update-role-permissions";
import { iamStore } from "@/server/composition-root";
import type { IamError } from "@/server/domains/iam/errors";
import type { ActorContext } from "@/server/domains/iam/model";

import type { AuthVariables } from "./auth-guard";
import { requirePermission } from "./permission-guard";

/**
 * 授权（IAM）HTTP 路由（接口层）：只做入参校验 / 状态码翻译，编排逻辑在 application/iam 用例里。
 * 整站守卫（auth-guard）已把当前用户与权限码集合放进 context，此处直接取用。
 */

const assignSiteRoleSchema = z.object({
  role: z.enum(SITE_ROLE_CODES),
});

const addMemberSchema = z.object({
  role: z.enum(PROJECT_ROLE_CODES),
  userId: z.string().min(1, "用户必填"),
});

const updateMemberSchema = z.object({
  role: z.enum(PROJECT_ROLE_CODES),
});

const updateRolePermissionsSchema = z.object({
  permissions: z.array(z.enum(PERMISSION_CODES)),
});

/** 统一错误翻译：业务异常 message 透传 + 对应 4xx，系统异常替换为通用文案 500（AGENTS.md「异常处理」）。 */
function errorResponse(c: Context, error: IamError) {
  if (error.kind === "system") {
    return c.json({ error: { code: error.code, message: "服务器内部错误" } }, 500);
  }
  const status =
    error.code === "FORBIDDEN"
      ? 403
      : error.code === "MEMBER_NOT_FOUND" || error.code === "ROLE_NOT_FOUND"
        ? 404
        : error.code === "MEMBER_EXISTS" || error.code === "LAST_OWNER" || error.code === "LAST_ADMIN"
          ? 409
          : 422;
  return c.json({ error: { code: error.code, message: error.message } }, status);
}

function validationError(c: Context, message: string | undefined) {
  return c.json({ error: { code: "VALIDATION_FAILED", message: message ?? "入参校验失败" } }, 400);
}

/** 操作者上下文：authGuard 已解析的 userId + 权限码集合，用例内项目级判定直接用，不重复查库。 */
function actorOf(c: Context<{ Variables: AuthVariables }>): ActorContext {
  return { permissions: c.get("userPermissions"), userId: c.get("authUser").id };
}

export const iamRoutes = new Hono<{ Variables: AuthVariables }>()

  // 当前用户权限码全集（前端 providers 缓存，驱动菜单过滤与按钮显隐）。
  .get("/me/permissions", async (c) => {
    const result = await createGetMyPermissions({ iamStore })(c.get("authUser").id);
    if (!result.ok) return errorResponse(c, result.error);
    return c.json(result.value);
  })

  // 用户列表（整站 admin 专属）。
  .get("/admin/users", requirePermission("user:manage"), async (c) => {
    const result = await createListUsers({ iamStore })();
    if (!result.ok) return errorResponse(c, result.error);
    return c.json(result.value);
  })

  // 分配整站角色（整站 admin 专属）。
  .put("/admin/users/:id/site-role", requirePermission("user:manage"), async (c) => {
    const parsed = assignSiteRoleSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationError(c, parsed.error.issues[0]?.message);
    const result = await createAssignSiteRole({ iamStore, logger })({
      actorId: c.get("authUser").id,
      role: parsed.data.role,
      targetUserId: c.req.param("id"),
    });
    if (!result.ok) return errorResponse(c, result.error);
    return c.json({ ok: true });
  })

  // 角色列表（含各角色权限码集合；role:manage）。
  .get("/admin/roles", requirePermission("role:manage"), async (c) => {
    const result = await createListRoles({ iamStore })();
    if (!result.ok) return errorResponse(c, result.error);
    return c.json(result.value);
  })

  // 按角色全量替换权限映射（role:manage）。
  .put("/admin/roles/:id/permissions", requirePermission("role:manage"), async (c) => {
    const parsed = updateRolePermissionsSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationError(c, parsed.error.issues[0]?.message);
    const result = await createUpdateRolePermissions({ iamStore, logger })({
      actorId: c.get("authUser").id,
      permissions: parsed.data.permissions,
      roleId: c.req.param("id"),
    });
    if (!result.ok) return errorResponse(c, result.error);
    return c.json({ ok: true });
  })

  // 项目成员只读视图：项目概览展示负责人和协作者，不在此实现管理界面。
  .get("/projects/:id/members", async (c) => {
    const result = await createListProjectMembers({ iamStore, logger })({ actor: actorOf(c), projectId: c.req.param("id") });
    if (!result.ok) return errorResponse(c, result.error);
    return c.json(result.value);
  })

  // 拉人进项目（项目级 member:manage 判定在用例内做）。
  .post("/projects/:id/members", async (c) => {
    const parsed = addMemberSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationError(c, parsed.error.issues[0]?.message);
    const result = await createAddProjectMember({ iamStore, logger })({
      actor: actorOf(c),
      projectId: c.req.param("id"),
      role: parsed.data.role,
      targetUserId: parsed.data.userId,
    });
    if (!result.ok) return errorResponse(c, result.error);
    return c.json({ ok: true }, 201);
  })

  // 改项目角色。
  .put("/projects/:id/members/:userId", async (c) => {
    const parsed = updateMemberSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationError(c, parsed.error.issues[0]?.message);
    const result = await createUpdateProjectMember({ iamStore, logger })({
      actor: actorOf(c),
      projectId: c.req.param("id"),
      role: parsed.data.role,
      targetUserId: c.req.param("userId"),
    });
    if (!result.ok) return errorResponse(c, result.error);
    return c.json({ ok: true });
  })

  // 移出项目成员。
  .delete("/projects/:id/members/:userId", async (c) => {
    const result = await createRemoveProjectMember({ iamStore, logger })({
      actor: actorOf(c),
      projectId: c.req.param("id"),
      targetUserId: c.req.param("userId"),
    });
    if (!result.ok) return errorResponse(c, result.error);
    return c.json({ ok: true });
  });
