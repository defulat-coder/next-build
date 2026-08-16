import type { DbError } from "@next-build/db";
import type { Result } from "@next-build/result";

import type { AuthUser } from "@/server/domains/auth/model";
import type { AuthStore } from "@/server/domains/auth/ports";

/** 用例：查询当前登录用户；会话不存在或已过期返回 null，DB 失败原样透出由边界翻译。 */
export function createGetCurrentUser(deps: { authStore: AuthStore }) {
  return (sessionToken: string): Promise<Result<AuthUser | null, DbError>> =>
    deps.authStore.findUserBySession(sessionToken);
}
