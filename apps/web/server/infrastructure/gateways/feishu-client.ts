import { err, ok, tryCatch, type Result } from "@next-build/result";

import type { AuthError } from "@/server/domains/auth/errors";
import type { FeishuGateway, FeishuProfile, FeishuToken } from "@/server/domains/auth/ports";

/**
 * 飞书 OAuth 端点封装（infrastructure 适配器，实现 domains/auth/ports 的 FeishuGateway）。
 * 凭证由调用方（组合根，从 lib/env.ts 读取）传入，本模块不直接读 process.env，便于测试。
 * 所有可恢复失败返回 Result（业务异常，kind: "business"），不 throw。
 */

export interface FeishuConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
}

const AUTHORIZE_URL = "https://open.feishu.cn/open-apis/authen/v1/authorize";
const TOKEN_URL = "https://open.feishu.cn/open-apis/authen/v2/oauth/token";
const USER_INFO_URL = "https://open.feishu.cn/open-apis/authen/v1/user_info";

export function buildAuthorizeUrl(config: FeishuConfig, state: string): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("app_id", config.appId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

/** CSRF 防护：回调 query 里的 state 必须与授权前写入 cookie 的 state 完全一致。 */
export function checkState(cookieState: string | undefined, queryState: string | undefined): boolean {
  return typeof cookieState === "string" && cookieState.length > 0 && cookieState === queryState;
}

/** 授权码换 user_access_token（v2 接口字段名为 client_id/client_secret）。 */
export async function exchangeCode(
  config: FeishuConfig,
  code: string,
): Promise<Result<FeishuToken, AuthError>> {
  const result = await tryCatch(
    fetch(TOKEN_URL, {
      body: JSON.stringify({
        client_id: config.appId,
        client_secret: config.appSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: config.redirectUri,
      }),
      headers: { "Content-Type": "application/json; charset=utf-8" },
      method: "POST",
    }),
    (cause): AuthError => ({
      cause,
      code: "FEISHU_TOKEN_EXCHANGE_FAILED",
      kind: "business",
      message: "请求飞书 token 接口失败",
    }),
  );
  if (!result.ok) return result;

  const body = (await result.value.json().catch(() => null)) as {
    code?: number | string;
    msg?: string;
    error?: string;
    error_description?: string;
    user_access_token?: string;
    access_token?: string;
  } | null;
  // 飞书的坑：成功时 code 可能是整数 0 或字符串 "0"；token 字段 v1 叫 user_access_token、v2 也可能叫 access_token。
  const userAccessToken = body?.user_access_token ?? body?.access_token;
  const succeeded =
    result.value.ok && (body?.code === 0 || body?.code === "0" || (body && body.code === undefined && !!userAccessToken));
  if (!succeeded || !userAccessToken) {
    return err({
      code: "FEISHU_TOKEN_EXCHANGE_FAILED",
      kind: "business",
      message: `飞书换 token 失败：${body?.msg ?? body?.error_description ?? body?.error ?? `HTTP ${result.value.status}`}`,
    });
  }
  return ok({ userAccessToken });
}

export async function getUserInfo(userAccessToken: string): Promise<Result<FeishuProfile, AuthError>> {
  const result = await tryCatch(
    fetch(USER_INFO_URL, { headers: { Authorization: `Bearer ${userAccessToken}` } }),
    (cause): AuthError => ({
      cause,
      code: "FEISHU_USER_INFO_FAILED",
      kind: "business",
      message: "请求飞书用户信息接口失败",
    }),
  );
  if (!result.ok) return result;

  const body = (await result.value.json().catch(() => null)) as {
    code?: number;
    msg?: string;
    data?: { avatar_url?: string; name?: string; open_id?: string };
  } | null;
  if (!result.value.ok || !body || body.code !== 0 || !body.data?.open_id || !body.data.name) {
    return err({
      code: "FEISHU_USER_INFO_FAILED",
      kind: "business",
      message: `飞书取用户信息失败：${body?.msg ?? `HTTP ${result.value.status}`}`,
    });
  }
  return ok({
    avatarUrl: body.data.avatar_url,
    name: body.data.name,
    openId: body.data.open_id,
  });
}

/**
 * 装配 FeishuGateway 端口实现：appId/appSecret 在此闭合，
 * redirectUri 依赖回调请求的原始 URL，由用例随每次调用传入。
 */
export function createFeishuGateway(config: { appId: string; appSecret: string }): FeishuGateway {
  return {
    exchangeCode: ({ code, redirectUri }) => exchangeCode({ ...config, redirectUri }, code),
    getUserInfo,
  };
}
