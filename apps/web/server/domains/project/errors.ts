import type { DbError, ProjectStoreBusinessError } from "@next-build/db";

import type { ForbiddenError } from "@/server/domains/iam/errors";

/**
 * 项目上下文的错误判别联合（AGENTS.md「异常处理」）：
 * - kind: "business" —— 项目不存在、仓库重复、越权、GitHub 仓库不可达等用户可行动的失败，message 面向用户，日志记 warn；
 * - kind: "system" —— DB / GitHub API 故障，API 不透传内部细节，日志记 error。
 */
export type ProjectError =
  | { code: "PROJECT_NOT_FOUND"; kind: "business"; message: string; cause?: unknown }
  | { code: "PROJECT_REPO_EXISTS"; kind: "business"; message: string; cause?: unknown }
  | { code: "PROJECT_REPO_NOT_FOUND"; kind: "business"; message: string; cause?: unknown }
  | { code: "PROJECT_REPO_UNAVAILABLE"; kind: "business"; message: string; cause?: unknown }
  | { code: "PRIMARY_REPO_REPLACEMENT_REQUIRED"; kind: "business"; message: string; cause?: unknown }
  | { code: "CONCURRENCY_CONFLICT"; kind: "business"; message: string; cause?: unknown }
  | { code: "PROJECT_ARCHIVED"; kind: "business"; message: string; cause?: unknown }
  | { code: "PROJECT_EXECUTION_NOT_READY"; kind: "business"; message: string; cause?: unknown }
  | { code: "PROJECT_COMPLETION_BLOCKED"; kind: "business"; message: string; cause?: unknown }
  | { code: "GITHUB_REPO_NOT_FOUND"; kind: "business"; message: string; cause?: unknown }
  | { code: "GITHUB_DELIVERY_REJECTED"; kind: "business"; message: string; cause?: unknown }
  | ForbiddenError
  | { code: "GITHUB_API_FAILED"; kind: "system"; message: string; cause?: unknown }
  | { code: DbError["code"]; kind: "system"; message: string; cause?: unknown };

/** 数据层失败翻译为本上下文错误：唯一约束是业务异常，其余 DB 故障是系统异常。 */
export function projectErrorFromStore(error: DbError | ProjectStoreBusinessError): ProjectError {
  return error.code === "DB_READ_FAILED" || error.code === "DB_WRITE_FAILED"
    ? { ...error, kind: "system" }
    : { ...error, kind: "business" };
}
