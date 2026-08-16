import { createHash, randomBytes, randomUUID } from "node:crypto";

import { err, ok, type Result } from "@next-build/result";
import { eq } from "drizzle-orm";

import type { Db } from "./client";
import type { Logger } from "./logger";
import { sessions, users } from "./schema";

/** 数据层错误：判别联合，code 为稳定常量（日志与 API 边界的聚合键）。 */
export type DbError =
  | { code: "DB_READ_FAILED"; message: string; cause?: unknown }
  | { code: "DB_WRITE_FAILED"; message: string; cause?: unknown };

/** 飞书 user_info 返回的用户资料（入库前的最小集）。 */
export interface FeishuUserProfile {
  feishuOpenId: string;
  name: string;
  avatarUrl?: string;
}

export interface AuthUser {
  id: string;
  feishuOpenId: string;
  name: string;
  avatarUrl: string | null;
}

export interface AuthStore {
  /** 按 feishuOpenId 存在即更新资料与 lastLoginAt，否则插入新用户。 */
  upsertUser(profile: FeishuUserProfile): Promise<Result<AuthUser, DbError>>;
  /** 生成会话 token（32 字节随机 hex），库里只存 sha256；返回的 token 原值用于写 cookie。 */
  createSession(userId: string, ttlMs: number): Promise<Result<string, DbError>>;
  /** 按 token 查用户；会话不存在或已过期返回 null（过期会话顺手删除）。 */
  findUserBySession(token: string): Promise<Result<AuthUser | null, DbError>>;
  deleteSession(token: string): Promise<Result<void, DbError>>;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createAuthStore(db: Db, options?: { logger?: Logger }): AuthStore {
  /** DB 失败是系统异常：产生层记 error（err 带完整堆栈），Result 照常返回给边界翻译。 */
  const logFailure = (op: string, error: DbError) => {
    options?.logger?.error(
      { err: error.cause instanceof Error ? error.cause : undefined, "error.code": error.code, event: "db.error", op },
      error.message,
    );
  };
  return {
    async upsertUser(profile) {
      try {
        const now = new Date();
        const existing = db
          .select()
          .from(users)
          .where(eq(users.feishuOpenId, profile.feishuOpenId))
          .limit(1)
          .all();
        if (existing.length > 0) {
          const user = existing[0];
          db.update(users)
            .set({
              avatarUrl: profile.avatarUrl ?? user.avatarUrl,
              lastLoginAt: now,
              name: profile.name,
            })
            .where(eq(users.id, user.id))
            .run();
          return ok({
            avatarUrl: profile.avatarUrl ?? user.avatarUrl,
            feishuOpenId: user.feishuOpenId,
            id: user.id,
            name: profile.name,
          });
        }
        const user: AuthUser = {
          avatarUrl: profile.avatarUrl ?? null,
          feishuOpenId: profile.feishuOpenId,
          id: randomUUID(),
          name: profile.name,
        };
        db.insert(users)
          .values({ ...user, createdAt: now, lastLoginAt: now })
          .run();
        return ok(user);
      } catch (cause) {
        const error: DbError = { cause, code: "DB_WRITE_FAILED", message: "写入用户失败" };
        logFailure("upsertUser", error);
        return err(error);
      }
    },

    async createSession(userId, ttlMs) {
      try {
        const token = randomBytes(32).toString("hex");
        const now = new Date();
        db.insert(sessions)
          .values({
            createdAt: now,
            expiresAt: new Date(now.getTime() + ttlMs),
            tokenHash: hashToken(token),
            userId,
          })
          .run();
        return ok(token);
      } catch (cause) {
        const error: DbError = { cause, code: "DB_WRITE_FAILED", message: "创建会话失败" };
        logFailure("createSession", error);
        return err(error);
      }
    },

    async findUserBySession(token) {
      try {
        const rows = db
          .select({ session: sessions, user: users })
          .from(sessions)
          .innerJoin(users, eq(sessions.userId, users.id))
          .where(eq(sessions.tokenHash, hashToken(token)))
          .limit(1)
          .all();
        if (rows.length === 0) return ok(null);
        const { session, user } = rows[0];
        if (session.expiresAt.getTime() <= Date.now()) {
          db.delete(sessions).where(eq(sessions.tokenHash, session.tokenHash)).run();
          return ok(null);
        }
        return ok({
          avatarUrl: user.avatarUrl,
          feishuOpenId: user.feishuOpenId,
          id: user.id,
          name: user.name,
        });
      } catch (cause) {
        const error: DbError = { cause, code: "DB_READ_FAILED", message: "查询会话失败" };
        logFailure("findUserBySession", error);
        return err(error);
      }
    },

    async deleteSession(token) {
      try {
        db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token))).run();
        return ok(undefined);
      } catch (cause) {
        const error: DbError = { cause, code: "DB_WRITE_FAILED", message: "删除会话失败" };
        logFailure("deleteSession", error);
        return err(error);
      }
    },
  };
}
