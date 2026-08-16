import { randomUUID } from "node:crypto";

import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

import { getFeishuEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createGetCurrentUser } from "@/server/application/auth/get-current-user";
import { createLoginWithFeishu } from "@/server/application/auth/login-with-feishu";
import { createLogout } from "@/server/application/auth/logout";
import { authStore, getFeishuGateway, iamStore } from "@/server/composition-root";
import { buildAuthorizeUrl, checkState } from "@/server/infrastructure/gateways/feishu-client";

import { OAUTH_STATE_COOKIE, OAUTH_STATE_TTL_SECONDS, SESSION_COOKIE, SESSION_TTL_MS } from "./cookies";

/**
 * 认证 HTTP 路由（接口层）：只做 cookie / state 校验 / 重定向 / 状态码翻译，
 * 编排逻辑在 application/auth 用例里，失败日志（auth.failed）由用例打点。
 */
export const authRoutes = new Hono()

  // 跳转到飞书授权页，state 写 cookie 防 CSRF。
  .get("/feishu", (c) => {
    const env = getFeishuEnv();
    const state = randomUUID();
    const redirectUri = new URL("/api/auth/feishu/callback", c.req.url).toString();
    setCookie(c, OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      maxAge: OAUTH_STATE_TTL_SECONDS,
      path: "/",
      sameSite: "Lax",
    });
    return c.redirect(
      buildAuthorizeUrl({ appId: env.FEISHU_APP_ID, appSecret: env.FEISHU_APP_SECRET, redirectUri }, state),
    );
  })

  // 飞书回调：校验 state → 登录用例 → 写会话 cookie → 回 /tasks。
  .get("/feishu/callback", async (c) => {
    const code = c.req.query("code");
    const stateCookie = getCookie(c, OAUTH_STATE_COOKIE);
    deleteCookie(c, OAUTH_STATE_COOKIE, { path: "/" });

    if (!checkState(stateCookie, c.req.query("state")) || !code) {
      logger.warn({ "error.code": "STATE_MISMATCH", event: "auth.failed" }, "OAuth state 校验失败");
      return c.redirect("/login?error=STATE_MISMATCH");
    }

    const redirectUri = new URL("/api/auth/feishu/callback", c.req.url).toString();
    const loginWithFeishu = createLoginWithFeishu({
      authStore,
      gateway: getFeishuGateway(),
      iamStore,
      logger,
      sessionTtlMs: SESSION_TTL_MS,
    });
    const result = await loginWithFeishu({ code, redirectUri });
    if (!result.ok) {
      return c.redirect(`/login?error=${encodeURIComponent(result.error.code)}`);
    }

    setCookie(c, SESSION_COOKIE, result.value.sessionToken, {
      httpOnly: true,
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
      path: "/",
      sameSite: "Lax",
    });
    return c.redirect("/tasks");
  })

  // 退出登录：删会话 + 清 cookie。前端 fetch 后自行跳转 /login。
  .post("/logout", async (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) {
      const logout = createLogout({ authStore, logger });
      await logout(token);
    }
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.redirect("/login");
  })

  // 当前登录用户（Header 用户菜单用）。
  .get("/me", async (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (!token) {
      return c.json({ error: { code: "UNAUTHORIZED", message: "未登录" } }, 401);
    }
    const getCurrentUser = createGetCurrentUser({ authStore });
    const result = await getCurrentUser(token);
    if (!result.ok) {
      return c.json({ error: { code: result.error.code, message: result.error.message } }, 500);
    }
    if (!result.value) {
      return c.json({ error: { code: "UNAUTHORIZED", message: "未登录或会话已过期" } }, 401);
    }
    return c.json(result.value);
  });
