/**
 * 会话 cookie 约定：nb_session 存 token 原值（32 字节随机 hex，由 db 层 createSession 生成），
 * 库里只存 sha256。httpOnly + sameSite=lax，30 天过期。
 * nb_oauth_state 仅用于 OAuth 跳转的 CSRF 防护，10 分钟有效。
 */

export const SESSION_COOKIE = "nb_session";
export const OAUTH_STATE_COOKIE = "nb_oauth_state";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const OAUTH_STATE_TTL_SECONDS = 10 * 60;
