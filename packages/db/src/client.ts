import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import * as schema from "./schema";
import type { Logger } from "./logger";

export type Db = BetterSQLite3Database<typeof schema>;

/**
 * 打开（必要时创建）SQLite 库并执行 Drizzle 迁移。
 * migrationsFolder 由调用方（组合根）显式传入：Next 打包后 import.meta.url 不再指向源码目录，
 * 不能在本模块内自行解析迁移目录。
 * 迁移失败是启动期系统异常：记 error（含完整堆栈）后原样 throw。
 */
export function createDb(options: { dbPath: string; migrationsFolder: string; logger?: Logger }): Db {
  if (options.dbPath !== ":memory:") {
    mkdirSync(dirname(options.dbPath), { recursive: true });
  }
  const sqlite = new Database(options.dbPath);
  sqlite.pragma("journal_mode = WAL");
  // SQLite 默认不关外键；project_repos 的级联删除依赖它。
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  const start = performance.now();
  try {
    migrate(db, { migrationsFolder: options.migrationsFolder });
  } catch (cause) {
    options.logger?.error(
      { err: cause, "error.code": "DB_MIGRATION_FAILED", event: "db.error" },
      "数据库迁移失败",
    );
    throw cause;
  }
  options.logger?.info(
    { duration_ms: Math.round(performance.now() - start), event: "db.migrated" },
    "数据库迁移完成",
  );
  return db;
}
