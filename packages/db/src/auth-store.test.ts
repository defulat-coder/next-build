import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { describe, expect, it } from "vitest";

import { createAuthStore, type AuthStore } from "./auth-store";
import { createDb } from "./client";
import * as schema from "./schema";

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

function createTestStore(): AuthStore {
  const db = createDb({ dbPath: ":memory:", migrationsFolder });
  return createAuthStore(db);
}

const profile = { avatarUrl: "https://example.com/a.png", feishuOpenId: "ou_1", name: "张三" };

describe("AuthStore", () => {
  it("upsertUser 首次插入，再次登录复用同一用户并更新资料", async () => {
    const store = createTestStore();
    const first = await store.upsertUser(profile);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = await store.upsertUser({ ...profile, name: "张三(改)" });
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.value.id).toBe(first.value.id);
    expect(second.value.name).toBe("张三(改)");
  });

  it("createSession 后可凭 token 查到用户", async () => {
    const store = createTestStore();
    const user = await store.upsertUser(profile);
    if (!user.ok) throw new Error("upsertUser failed");

    const token = await store.createSession(user.value.id, 60_000);
    expect(token.ok).toBe(true);
    if (!token.ok) return;
    expect(token.value).toMatch(/^[0-9a-f]{64}$/);

    const found = await store.findUserBySession(token.value);
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value?.id).toBe(user.value.id);
  });

  it("过期会话返回 null", async () => {
    const store = createTestStore();
    const user = await store.upsertUser(profile);
    if (!user.ok) throw new Error("upsertUser failed");

    const token = await store.createSession(user.value.id, -1);
    if (!token.ok) throw new Error("createSession failed");

    const found = await store.findUserBySession(token.value);
    expect(found).toEqual({ ok: true, value: null });
  });

  it("deleteSession 后会话失效；未知 token 查询返回 null", async () => {
    const store = createTestStore();
    const user = await store.upsertUser(profile);
    if (!user.ok) throw new Error("upsertUser failed");
    const token = await store.createSession(user.value.id, 60_000);
    if (!token.ok) throw new Error("createSession failed");

    await store.deleteSession(token.value);
    const found = await store.findUserBySession(token.value);
    expect(found).toEqual({ ok: true, value: null });

    const unknown = await store.findUserBySession("0".repeat(64));
    expect(unknown).toEqual({ ok: true, value: null });
  });

  it("DB 失败时在产生层打 db.error（err 带原始异常），Result 照常返回", async () => {
    const calls: { fields: Record<string, unknown>; message: string }[] = [];
    const logger = {
      error: (fields: Record<string, unknown>, message: string) => calls.push({ fields, message }),
      info: () => {},
      warn: () => {},
    };
    // 人为制造故障：不跑迁移，sessions 表不存在，findUserBySession 必炸
    const db = drizzle(new Database(":memory:"), { schema });
    const store = createAuthStore(db, { logger });

    const result = await store.findUserBySession("0".repeat(64));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("DB_READ_FAILED");

    expect(calls).toHaveLength(1);
    expect(calls[0].fields).toMatchObject({ "error.code": "DB_READ_FAILED", event: "db.error", op: "findUserBySession" });
    expect(calls[0].fields.err).toBeInstanceOf(Error);
  });
});
