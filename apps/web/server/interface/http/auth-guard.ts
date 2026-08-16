import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";

import { SESSION_COOKIE } from "./session";
import { authStore } from "./store";

/**
 * API 整站保护：除 /api/auth/* 与 /api/health 外，无有效会话一律 401。
 * 页面侧的重定向由 Next middleware（apps/web/middleware.ts）负责。
 */
export const authGuard = createMiddleware(async (c, next) => {
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
  return next();
});
