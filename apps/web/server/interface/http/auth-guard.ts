import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";

import { authStore, iamStore } from "@/server/composition-root";
import type { AuthUser } from "@/server/domains/auth/model";
import type { UserPermissions } from "@/server/domains/iam/model";

import { SESSION_COOKIE } from "./cookies";

/**
 * authGuard 之后写入 Hono context 的共享变量：
 * 权限解析一次请求只查一次（userId + 权限码集合），permission-guard 中间件与各用例共用
 * （docs/architecture-rbac-menu.md §4）。
 */
export interface AuthVariables {
  requestId: string;
  authUser: AuthUser;
  userPermissions: UserPermissions;
}

/**
 * API 整站保护：除 /api/auth/* 与 /api/health 外，无有效会话一律 401。
 * 会话有效时把当前用户与权限码集合放进 context，后续中间件/用例不再查库。
 * 页面侧的重定向由 Next proxy（apps/web/proxy.ts）负责。
 */
export const authGuard = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  const path = c.req.path;
  if (path.startsWith("/api/auth/") || path === "/api/health") {
    return next();
  }
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "未登录" } }, 401);
  }
  const result = await authStore.findUserBySession(token);
  if (!result.ok) {
    return c.json({ error: { code: result.error.code, message: result.error.message } }, 500);
  }
  if (!result.value) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "未登录或会话已过期" } }, 401);
  }
  const permissions = await iamStore.getPermissionsForUser(result.value.id);
  if (!permissions.ok) {
    return c.json({ error: { code: permissions.error.code, message: permissions.error.message } }, 500);
  }
  c.set("authUser", result.value);
  c.set("userPermissions", permissions.value);
  return next();
});
