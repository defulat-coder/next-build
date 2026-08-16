import type { DbError } from "@next-build/db";

/**
 * 越权（FORBIDDEN）：业务异常，message 面向用户，403。
 * 独立导出以便 project 等其他上下文复用同一错误形状（用例内项目级判定产出）。
 */
export type ForbiddenError = { code: "FORBIDDEN"; kind: "business"; message: string; cause?: unknown };

/**
 * 授权（IAM）上下文的错误判别联合（AGENTS.md「异常处理」，docs/architecture-rbac-menu.md §5）：
 * - kind: "business" —— 越权、成员冲突等用户可行动的失败，message 面向用户，日志记 warn；
 * - kind: "system" —— DB 基础设施故障，API 不透传内部细节，日志记 error。
 */
export type IamError =
  | ForbiddenError
  | { code: "MEMBER_EXISTS"; kind: "business"; message: string; cause?: unknown }
  | { code: "MEMBER_NOT_FOUND"; kind: "business"; message: string; cause?: unknown }
  | { code: "ROLE_NOT_FOUND"; kind: "business"; message: string; cause?: unknown }
  | { code: "LAST_OWNER"; kind: "business"; message: string; cause?: unknown }
  | { code: "LAST_ADMIN"; kind: "business"; message: string; cause?: unknown }
  | { code: DbError["code"]; kind: "system"; message: string; cause?: unknown };

/** 数据层失败翻译为本上下文的系统异常（cause 保留原始异常，日志可带完整堆栈）。 */
export function iamErrorFromDb(error: DbError): IamError {
  return { ...error, kind: "system" };
}
