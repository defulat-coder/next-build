import path from "node:path";

import { createAuthStore, createDb } from "@next-build/db";

/**
 * 组合根：唯一的数据库实例。
 * 迁移目录经 node_modules 符号链接定位（pnpm workspace），避免 Next 打包后 import.meta.url 失效。
 */
const db = createDb({
  dbPath: path.join(process.cwd(), "data", "app.db"),
  migrationsFolder: path.join(process.cwd(), "node_modules", "@next-build", "db", "drizzle"),
});

export const authStore = createAuthStore(db);
