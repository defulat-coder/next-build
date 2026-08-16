import type { DbError } from "@next-build/db";

/**
 * 认证上下文的错误判别联合（AGENTS.md「异常处理」）：
 * - kind: "business" —— 飞书授权失败等业务异常（预期内、用户可重试），message 面向用户，日志记 warn；
 * - kind: "system" —— DB 等基础设施故障，API 不透传内部细节，日志记 error。
 */
export type AuthError =
  | { code: "FEISHU_TOKEN_EXCHANGE_FAILED"; kind: "business"; message: string; cause?: unknown }
  | { code: "FEISHU_USER_INFO_FAILED"; kind: "business"; message: string; cause?: unknown }
  | { code: DbError["code"]; kind: "system"; message: string; cause?: unknown };

/** 数据层失败翻译为本上下文的系统异常（cause 保留原始异常，日志可带完整堆栈）。 */
export function authErrorFromDb(error: DbError): AuthError {
  return { ...error, kind: "system" };
}
