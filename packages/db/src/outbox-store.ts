import { err, ok, type Result } from "@next-build/result";
import { asc, eq, isNull, sql } from "drizzle-orm";

import type { DbError } from "./auth-store";
import type { Db } from "./client";
import type { Logger } from "./logger";
import { outboxEvents } from "./schema";

export interface OutboxEvent<T = unknown> {
  id: string;
  type: string;
  aggregateId: string;
  payload: T;
  createdAt: Date;
  processedAt: Date | null;
  attempts: number;
  lastError: string | null;
}
export interface OutboxStore {
  listPending(limit?: number): Promise<Result<OutboxEvent[], DbError>>;
  markProcessed(id: string): Promise<Result<void, DbError>>;
  markFailed(id: string, safeErrorCode: string): Promise<Result<void, DbError>>;
}

export function createOutboxStore(db: Db, options?: { logger?: Logger }): OutboxStore {
  const failure = (op: string, cause: unknown): Result<never, DbError> => {
    const error: DbError = { cause, code: "DB_WRITE_FAILED", message: "更新 outbox 失败" };
    options?.logger?.error({ err: cause instanceof Error ? cause : undefined, "error.code": error.code, event: "db.error", op }, error.message);
    return err(error);
  };
  return {
    async listPending(limit = 50) {
      try {
        const rows = db.select().from(outboxEvents).where(isNull(outboxEvents.processedAt)).orderBy(asc(outboxEvents.createdAt)).limit(limit).all();
        return ok(rows.map((row) => ({ ...row, payload: JSON.parse(row.payload) as unknown })));
      } catch (cause) {
        const error: DbError = { cause, code: "DB_READ_FAILED", message: "查询 outbox 失败" };
        options?.logger?.error({ err: cause instanceof Error ? cause : undefined, "error.code": error.code, event: "db.error", op: "listPendingOutbox" }, error.message);
        return err(error);
      }
    },
    async markProcessed(id) {
      try { db.update(outboxEvents).set({ processedAt: new Date() }).where(eq(outboxEvents.id, id)).run(); return ok(undefined); }
      catch (cause) { return failure("markOutboxProcessed", cause); }
    },
    async markFailed(id, safeErrorCode) {
      try {
        db.update(outboxEvents).set({ attempts: sql`${outboxEvents.attempts} + 1`, lastError: safeErrorCode }).where(eq(outboxEvents.id, id)).run();
        return ok(undefined);
      } catch (cause) { return failure("markOutboxFailed", cause); }
    },
  };
}
