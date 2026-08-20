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

import type { AuthVariables } from "./auth-guard";

/**
 * 认证 HTTP 路由（接口层）：只做 cookie / state 校验 / 重定向 / 状态码翻译，
 * 编排逻辑在 application/auth 用例里，失败日志（auth.failed）由用例打点。
 * Variables 与主 app 一致：requestId 由 api.request 中间件写入，auth.start/auth.failed 靠它串联请求日志。
 */
/**
 * 浏览器实际访问的源（origin）。经 portless 代理开发时它注入 PORTLESS_URL
 * （如 https://next-build.localhost），此时 req.url 是 dev server 内部地址
 * （localhost:随机端口）——redirect_uri 用它既不稳定、浏览器也够不到，必须换成代理域名。
 */
function resolvePublicOrigin(reqUrl: string): string {
  return process.env.PORTLESS_URL ?? new URL(reqUrl).origin;
}

export const authRoutes = new Hono<{ Variables: AuthVariables }>()

  // 跳转到飞书授权页，state 写 cookie 防 CSRF。
  .get("/feishu", (c) => {
    const redirectUri = new URL("/api/auth/feishu/callback", resolvePublicOrigin(c.req.url)).toString();
    // Next dev 会把 req.url 归一到 localhost：用户若从 127.0.0.1 进来，cookie 种在 127.0.0.1
    // 而飞书回调落在 localhost，state cookie 必然缺失（STATE_MISMATCH）。
    // 发起授权前先把浏览器重定向到归一 host，保证 cookie 与回调同 host（生产环境 Host 与 req.url 一致，此分支不触发）。
    // 用 307 而非 308：dev 端口/host 常变，永久重定向会被浏览器缓存旧地址（踩过坑）。
    const canonicalHost = new URL(redirectUri).host;
    const requestHost = c.req.header("host");
    if (requestHost && requestHost !== canonicalHost) {
      logger.info(
        { canonical_host: canonicalHost, event: "auth.host_normalized", request_host: requestHost, request_id: c.get("requestId") },
        "OAuth 前归一访问 host",
      );
      return c.redirect(`${new URL(redirectUri).origin}/api/auth/feishu`, 307);
    }

    const env = getFeishuEnv();
    const state = randomUUID();
    // host 混用（127.0.0.1/localhost/多端口同 host 互踩 cookie）是 STATE_MISMATCH 高发原因，打点留证。
    logger.info(
      { event: "auth.start", redirect_host: canonicalHost, request_id: c.get("requestId") },
      "发起飞书登录",
    );
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
      logger.warn(
        { "error.code": "STATE_MISMATCH", event: "auth.failed", request_id: c.get("requestId") },
        "OAuth state 校验失败",
      );
      return c.redirect("/login?error=STATE_MISMATCH");
    }

    const redirectUri = new URL("/api/auth/feishu/callback", resolvePublicOrigin(c.req.url)).toString();
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
