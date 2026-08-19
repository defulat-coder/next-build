import type { AcceptanceInvalidError, AcceptanceNotReadyError, DbError, TaskIdempotencyConflictError, TaskInvalidTransitionStoreError } from "@next-build/db";

import type { ProjectError } from "@/server/domains/project/errors";

export type TaskError =
  | ProjectError
  | { code: "TASK_NOT_FOUND"; kind: "business"; message: string }
  | { code: "TASK_INVALID_TRANSITION"; kind: "business"; message: string }
  | { code: "TASK_IDEMPOTENCY_CONFLICT"; kind: "business"; message: string }
  | { code: "CONCURRENCY_CONFLICT"; kind: "business"; message: string }
  | { code: "ACCEPTANCE_NOT_READY"; kind: "business"; message: string }
  | { code: "ACCEPTANCE_INVALID"; kind: "business"; message: string }
  | { code: "TASK_REVIEWER_INVALID"; kind: "business"; message: string }
  | { code: DbError["code"]; kind: "system"; message: string; cause?: unknown };

export function taskErrorFromStore(
  error: DbError | TaskIdempotencyConflictError | AcceptanceNotReadyError | AcceptanceInvalidError | TaskInvalidTransitionStoreError | { code: "CONCURRENCY_CONFLICT"; message: string },
): TaskError {
  return error.code === "DB_READ_FAILED" || error.code === "DB_WRITE_FAILED"
    ? { ...error, kind: "system" }
    : { ...error, kind: "business" };
}
