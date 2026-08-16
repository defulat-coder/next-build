import type { Result } from "@next-build/result";

import type { AuthError } from "./errors";

/** 持久化端口：直接复用 packages/db 的窄接口契约（端口契约留在 packages，业务规则不进 packages）。 */
export type { AuthStore } from "@next-build/db";

/** 授权码换来的飞书令牌。 */
export interface FeishuToken {
  userAccessToken: string;
}

/** 飞书用户资料（入库前的最小集）。 */
export interface FeishuProfile {
  openId: string;
  name: string;
  avatarUrl?: string;
}

/**
 * 飞书网关端口：授权码换 user_access_token、取用户资料。
 * 实现见 infrastructure/gateways/feishu-client.ts；凭证在装配时闭合，redirectUri 随回调请求传入。
 */
export interface FeishuGateway {
  exchangeCode(input: { code: string; redirectUri: string }): Promise<Result<FeishuToken, AuthError>>;
  getUserInfo(userAccessToken: string): Promise<Result<FeishuProfile, AuthError>>;
}
