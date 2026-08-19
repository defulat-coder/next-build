import { randomUUID } from "node:crypto";

import { err, ok, type Result } from "@next-build/result";
import { and, desc, eq, sql } from "drizzle-orm";

import type { DbError } from "./auth-store";
import type { Db } from "./client";
import type { Logger } from "./logger";
import type { ConcurrencyConflictError } from "./project-store";
import { knowledgeGenerations, sourceFiles, wikiDocuments } from "./schema";

export type KnowledgeGenerationStatus = "queued" | "generating" | "published" | "failed";
export type KnowledgeGenerationTrigger = "manual" | "delivery_merged" | "initial";
export interface KnowledgeSource { repo: string; sha: string }
export interface KnowledgeGeneration {
  id: string;
  projectId: string;
  sourceSet: KnowledgeSource[];
  sourceFingerprint: string;
  status: KnowledgeGenerationStatus;
  trigger: KnowledgeGenerationTrigger;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  startedAt: Date | null;
  publishedAt: Date | null;
  version: number;
}
export interface KnowledgeDocument { id: string; generationId: string; projectId: string; repo: string; path: string; title: string; content: string }
export interface KnowledgeSourceFile { id: string; generationId: string; projectId: string; repo: string; path: string; content: string; language: string | null; truncated: boolean }

export interface KnowledgeStore {
  listGenerations(projectId: string): Promise<Result<KnowledgeGeneration[], DbError>>;
  getGeneration(id: string): Promise<Result<KnowledgeGeneration | null, DbError>>;
  listRecoverableGenerations(): Promise<Result<KnowledgeGeneration[], DbError>>;
  listPublishedDocuments(projectId: string): Promise<Result<KnowledgeDocument[], DbError>>;
  createGeneration(input: {
    projectId: string;
    sourceSet: KnowledgeSource[];
    sourceFingerprint: string;
    trigger: KnowledgeGenerationTrigger;
  }): Promise<Result<{ generation: KnowledgeGeneration; created: boolean }, DbError>>;
  updateGeneration(input: {
    id: string;
    expectedVersion: number;
    status: KnowledgeGenerationStatus;
    errorCode?: string | null;
    errorMessage?: string | null;
    startedAt?: Date | null;
    publishedAt?: Date | null;
  }): Promise<Result<KnowledgeGeneration | null, DbError | ConcurrencyConflictError>>;
  publishGeneration(input: {
    id: string;
    expectedVersion: number;
    documents: KnowledgeDocument[];
    sources: KnowledgeSourceFile[];
  }): Promise<Result<KnowledgeGeneration | null, DbError | ConcurrencyConflictError>>;
}

type Row = typeof knowledgeGenerations.$inferSelect;
function toGeneration(row: Row): KnowledgeGeneration {
  return { ...row, sourceSet: JSON.parse(row.sourceSet) as KnowledgeSource[] };
}

export function createKnowledgeStore(db: Db, options?: { logger?: Logger }): KnowledgeStore {
  const logFailure = (op: string, error: DbError) => options?.logger?.error(
    { err: error.cause instanceof Error ? error.cause : undefined, "error.code": error.code, event: "db.error", op },
    error.message,
  );
  return {
    async listGenerations(projectId) {
      try {
        return ok(db.select().from(knowledgeGenerations).where(eq(knowledgeGenerations.projectId, projectId))
          .orderBy(desc(knowledgeGenerations.createdAt)).all().map(toGeneration));
      } catch (cause) {
        const error: DbError = { cause, code: "DB_READ_FAILED", message: "查询知识版本失败" };
        logFailure("listGenerations", error);
        return err(error);
      }
    },
    async getGeneration(id) {
      try {
        const row = db.select().from(knowledgeGenerations).where(eq(knowledgeGenerations.id, id)).limit(1).all()[0];
        return ok(row ? toGeneration(row) : null);
      } catch (cause) {
        const error: DbError = { cause, code: "DB_READ_FAILED", message: "查询知识版本失败" };
        logFailure("getGeneration", error); return err(error);
      }
    },
    async listRecoverableGenerations() {
      try {
        return ok(db.select().from(knowledgeGenerations)
          .where(sql`${knowledgeGenerations.status} in ('queued', 'generating')`)
          .orderBy(knowledgeGenerations.createdAt).all().map(toGeneration));
      } catch (cause) {
        const error: DbError = { cause, code: "DB_READ_FAILED", message: "查询待恢复知识版本失败" };
        logFailure("listRecoverableGenerations", error); return err(error);
      }
    },
    async listPublishedDocuments(projectId) {
      try {
        const generation = db.select().from(knowledgeGenerations).where(and(
          eq(knowledgeGenerations.projectId, projectId), eq(knowledgeGenerations.status, "published"),
        )).orderBy(desc(knowledgeGenerations.publishedAt)).limit(1).all()[0];
        if (!generation) return ok([]);
        return ok(db.select().from(wikiDocuments).where(eq(wikiDocuments.generationId, generation.id)).orderBy(wikiDocuments.repo, wikiDocuments.path).all());
      } catch (cause) {
        const error: DbError = { cause, code: "DB_READ_FAILED", message: "查询已发布 Wiki 失败" };
        logFailure("listPublishedDocuments", error); return err(error);
      }
    },
    async createGeneration(input) {
      try {
        const existing = db.select().from(knowledgeGenerations).where(and(
          eq(knowledgeGenerations.projectId, input.projectId),
          eq(knowledgeGenerations.sourceFingerprint, input.sourceFingerprint),
        )).limit(1).all()[0];
        if (existing) {
          if (existing.status !== "failed") return ok({ created: false, generation: toGeneration(existing) });
          const retried = db.update(knowledgeGenerations).set({
            errorCode: null, errorMessage: null, publishedAt: null, startedAt: null, status: "queued",
            version: sql`${knowledgeGenerations.version} + 1`,
          }).where(eq(knowledgeGenerations.id, existing.id)).returning().all()[0];
          return ok({ created: true, generation: toGeneration(retried) });
        }
        const generation: KnowledgeGeneration = {
          createdAt: new Date(),
          errorCode: null,
          errorMessage: null,
          id: randomUUID(),
          projectId: input.projectId,
          publishedAt: null,
          sourceFingerprint: input.sourceFingerprint,
          sourceSet: input.sourceSet,
          startedAt: null,
          status: "queued",
          trigger: input.trigger,
          version: 1,
        };
        db.insert(knowledgeGenerations).values({ ...generation, sourceSet: JSON.stringify(generation.sourceSet) }).run();
        return ok({ created: true, generation });
      } catch (cause) {
        const error: DbError = { cause, code: "DB_WRITE_FAILED", message: "创建知识版本失败" };
        logFailure("createGeneration", error);
        return err(error);
      }
    },
    async updateGeneration(input) {
      try {
        const rows = db.update(knowledgeGenerations).set({
          errorCode: input.errorCode,
          errorMessage: input.errorMessage,
          publishedAt: input.publishedAt,
          startedAt: input.startedAt,
          status: input.status,
          version: sql`${knowledgeGenerations.version} + 1`,
        }).where(and(eq(knowledgeGenerations.id, input.id), eq(knowledgeGenerations.version, input.expectedVersion)))
          .returning().all();
        if (rows[0]) return ok(toGeneration(rows[0]));
        const exists = db.select({ id: knowledgeGenerations.id }).from(knowledgeGenerations)
          .where(eq(knowledgeGenerations.id, input.id)).limit(1).all();
        if (exists.length === 0) return ok(null);
        return err({ code: "CONCURRENCY_CONFLICT", message: "知识版本已被其他操作更新，请刷新后重试" });
      } catch (cause) {
        const error: DbError = { cause, code: "DB_WRITE_FAILED", message: "更新知识版本失败" };
        logFailure("updateGeneration", error);
        return err(error);
      }
    },
    async publishGeneration(input) {
      try {
        const published = db.transaction((tx) => {
          const current = tx.select().from(knowledgeGenerations).where(eq(knowledgeGenerations.id, input.id)).limit(1).all()[0];
          if (!current) return null;
          if (current.version !== input.expectedVersion) throw { code: "CONCURRENCY_CONFLICT", message: "知识版本已更新，请刷新后重试" } satisfies ConcurrencyConflictError;
          tx.delete(wikiDocuments).where(eq(wikiDocuments.generationId, input.id)).run();
          tx.delete(sourceFiles).where(eq(sourceFiles.generationId, input.id)).run();
          if (input.documents.length > 0) tx.insert(wikiDocuments).values(input.documents).run();
          if (input.sources.length > 0) tx.insert(sourceFiles).values(input.sources).run();
          const row = tx.update(knowledgeGenerations).set({
            errorCode: null, errorMessage: null, publishedAt: new Date(), status: "published",
            version: sql`${knowledgeGenerations.version} + 1`,
          }).where(and(eq(knowledgeGenerations.id, input.id), eq(knowledgeGenerations.version, input.expectedVersion))).returning().all()[0];
          if (!row) throw { code: "CONCURRENCY_CONFLICT", message: "知识版本发布冲突" } satisfies ConcurrencyConflictError;
          return toGeneration(row);
        });
        return ok(published);
      } catch (cause) {
        if (typeof cause === "object" && cause !== null && "code" in cause && cause.code === "CONCURRENCY_CONFLICT") return err(cause as ConcurrencyConflictError);
        const error: DbError = { cause, code: "DB_WRITE_FAILED", message: "原子发布知识版本失败" };
        logFailure("publishGeneration", error); return err(error);
      }
    },
  };
}
