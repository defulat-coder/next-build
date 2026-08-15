import { randomUUID } from "node:crypto";

import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

import { getFeishuEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

import { buildAuthorizeUrl, checkState, exchangeCode, getUserInfo } from "./feishu";
import { OAUTH_STATE_COOKIE, OAUTH_STATE_TTL_SECONDS, SESSION_COOKIE, SESSION_TTL_MS } from "./session";
import { authStore } from "./store";

/** 登录失败统一打点（不记录 token/code 等敏感值）并跳回登录页。 */
function loginFailed(c: { redirect: (url: string) => Response }, error: { code: string; message: string; cause?: unknown }) {
  logger.error(
    {
      cause: error.cause instanceof Error ? error.cause.message : undefined,
      "error.code": error.code,
      "error.message": error.message,
      event: "auth.failed",
    },
    "飞书登录失败",
  );
  return c.redirect(`/login?error=${encodeURIComponent(error.code)}`);
}

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

  // 飞书回调：校验 state → 换 token → 取用户信息 → 建会话 → 回 /tasks。
  .get("/feishu/callback", async (c) => {
    const env = getFeishuEnv();
    const code = c.req.query("code");
    const stateCookie = getCookie(c, OAUTH_STATE_COOKIE);
    deleteCookie(c, OAUTH_STATE_COOKIE, { path: "/" });

    if (!checkState(stateCookie, c.req.query("state")) || !code) {
      logger.warn({ "error.code": "STATE_MISMATCH", event: "auth.failed" }, "OAuth state 校验失败");
      return c.redirect("/login?error=STATE_MISMATCH");
    }

    const redirectUri = new URL("/api/auth/feishu/callback", c.req.url).toString();
    const config = { appId: env.FEISHU_APP_ID, appSecret: env.FEISHU_APP_SECRET, redirectUri };

    const token = await exchangeCode(config, code);
    if (!token.ok) return loginFailed(c, token.error);

    const profile = await getUserInfo(token.value.userAccessToken);
    if (!profile.ok) return loginFailed(c, profile.error);

    const user = await authStore.upsertUser({
      avatarUrl: profile.value.avatarUrl,
      feishuOpenId: profile.value.openId,
      name: profile.value.name,
    });
    if (!user.ok) return loginFailed(c, user.error);

    const sessionToken = await authStore.createSession(user.value.id, SESSION_TTL_MS);
    if (!sessionToken.ok) return loginFailed(c, sessionToken.error);

    setCookie(c, SESSION_COOKIE, sessionToken.value, {
      httpOnly: true,
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
      path: "/",
      sameSite: "Lax",
    });
    logger.info(
      { event: "auth.login", feishu_open_id: user.value.feishuOpenId, user_id: user.value.id },
      "用户登录",
    );
    return c.redirect("/tasks");
  })

  // 退出登录：删会话 + 清 cookie。前端 fetch 后自行跳转 /login。
  .post("/logout", async (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) {
      const user = await authStore.findUserBySession(token);
      await authStore.deleteSession(token);
      logger.info(
        { event: "auth.logout", user_id: user.ok ? (user.value?.id ?? undefined) : undefined },
        "用户退出登录",
      );
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
    const result = await authStore.findUserBySession(token);
    if (!result.ok) {
      return c.json({ error: { code: result.error.code, message: result.error.message } }, 500);
    }
    if (!result.value) {
      return c.json({ error: { code: "UNAUTHORIZED", message: "未登录或会话已过期" } }, 401);
    }
    return c.json(result.value);
  });
