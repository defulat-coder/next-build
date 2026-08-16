import type { Logger } from "@next-build/db";

import type { AuthStore } from "@/server/domains/auth/ports";

/**
 * 用例：退出登录——删会话并打点（auth.logout）。
 * DB 失败已在数据层记 error，此处不打断退出；cookie 清除由路由层负责。
 */
export function createLogout(deps: { authStore: AuthStore; logger: Logger }) {
  return async (sessionToken: string): Promise<void> => {
    const user = await deps.authStore.findUserBySession(sessionToken);
    await deps.authStore.deleteSession(sessionToken);
    deps.logger.info(
      { event: "auth.logout", user_id: user.ok ? (user.value?.id ?? undefined) : undefined },
      "用户退出登录",
    );
  };
}
