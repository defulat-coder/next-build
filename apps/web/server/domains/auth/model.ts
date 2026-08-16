/**
 * 认证上下文的核心概念（统一语言的载体）。
 * 持久化契约由 packages/db 的窄接口（AuthStore）持有，此处归口 re-export，不重复定义。
 */
export type { AuthUser, FeishuUserProfile } from "@next-build/db";
