import { err, ok, type Result } from "@next-build/result";
import type { Logger } from "@next-build/db";

import { authErrorFromDb, type AuthError } from "@/server/domains/auth/errors";
import type { AuthUser } from "@/server/domains/auth/model";
import type { AuthStore, FeishuGateway } from "@/server/domains/auth/ports";

export interface LoginWithFeishuInput {
  code: string;
  redirectUri: string;
}

export interface LoginWithFeishuOutput {
  user: AuthUser;
  sessionToken: string;
}

/**
 * 用例：飞书登录（事务脚本）。编排 换 token → 取资料 → upsert 用户 → 建会话。
 * 失败日志在此打点（auth.failed：业务异常 warn、系统异常 error；err 带堆栈，不记录 token/code），
 * 路由层只负责 state 校验、写 cookie 与重定向。
 */
export function createLoginWithFeishu(deps: {
  authStore: AuthStore;
  gateway: FeishuGateway;
  logger: Logger;
  sessionTtlMs: number;
}) {
  const logFailure = (error: AuthError): Result<never, AuthError> => {
    deps.logger[error.kind === "business" ? "warn" : "error"](
      {
        err: error.cause instanceof Error ? error.cause : undefined,
        "error.code": error.code,
        "error.message": error.message,
        event: "auth.failed",
      },
      "飞书登录失败",
    );
    return err(error);
  };

  return async (input: LoginWithFeishuInput): Promise<Result<LoginWithFeishuOutput, AuthError>> => {
    const token = await deps.gateway.exchangeCode({ code: input.code, redirectUri: input.redirectUri });
    if (!token.ok) return logFailure(token.error);

    const profile = await deps.gateway.getUserInfo(token.value.userAccessToken);
    if (!profile.ok) return logFailure(profile.error);

    const user = await deps.authStore.upsertUser({
      avatarUrl: profile.value.avatarUrl,
      feishuOpenId: profile.value.openId,
      name: profile.value.name,
    });
    if (!user.ok) return logFailure(authErrorFromDb(user.error));

    const sessionToken = await deps.authStore.createSession(user.value.id, deps.sessionTtlMs);
    if (!sessionToken.ok) return logFailure(authErrorFromDb(sessionToken.error));

    deps.logger.info(
      { event: "auth.login", feishu_open_id: user.value.feishuOpenId, user_id: user.value.id },
      "用户登录",
    );
    return ok({ sessionToken: sessionToken.value, user: user.value });
  };
}
