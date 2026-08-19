import type { DbError } from "@next-build/db";

import type { ProjectError } from "@/server/domains/project/errors";

export type KnowledgeError =
  | ProjectError
  | { code: "KNOWLEDGE_SOURCE_NOT_READY"; kind: "business"; message: string }
  | { code: "CONCURRENCY_CONFLICT"; kind: "business"; message: string }
  | { code: DbError["code"]; kind: "system"; message: string; cause?: unknown };

export function knowledgeErrorFromStore(error: DbError | { code: "CONCURRENCY_CONFLICT"; message: string }): KnowledgeError {
  return error.code === "DB_READ_FAILED" || error.code === "DB_WRITE_FAILED"
    ? { ...error, kind: "system" }
    : { ...error, kind: "business" };
}
