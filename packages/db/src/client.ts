import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

/**
 * 打开（必要时创建）SQLite 库并执行 Drizzle 迁移。
 * migrationsFolder 由调用方（组合根）显式传入：Next 打包后 import.meta.url 不再指向源码目录，
 * 不能在本模块内自行解析迁移目录。
 */
export function createDb(options: { dbPath: string; migrationsFolder: string }): Db {
  if (options.dbPath !== ":memory:") {
    mkdirSync(dirname(options.dbPath), { recursive: true });
  }
  const sqlite = new Database(options.dbPath);
  sqlite.pragma("journal_mode = WAL");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: options.migrationsFolder });
  return db;
}
