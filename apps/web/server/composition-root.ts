import path from "node:path";

import { createAuthStore, createDb, createProjectStore } from "@next-build/db";

import { getFeishuEnv, getGitHubEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { FeishuGateway } from "@/server/domains/auth/ports";
import type { GitHubGateway } from "@/server/domains/project/ports";
import { createFeishuGateway } from "@/server/infrastructure/gateways/feishu-client";
import { createGitHubGateway } from "@/server/infrastructure/gateways/github-client";

/**
 * 组合根：唯一的数据库实例，db + logger + store/gateway 在此装配接线。
 * 迁移目录经 node_modules 符号链接定位（pnpm workspace），避免 Next 打包后 import.meta.url 失效。
 * packages 只接受注入的 Logger，此处传入 db 模块的 child logger。
 */
const dbLogger = logger.child({ module: "db" });

const db = createDb({
  dbPath: path.join(process.cwd(), "data", "app.db"),
  logger: dbLogger,
  migrationsFolder: path.join(process.cwd(), "node_modules", "@next-build", "db", "drizzle"),
});

export const authStore = createAuthStore(db, { logger: dbLogger });
export const projectStore = createProjectStore(db, { logger: dbLogger });

/** 飞书网关：凭证按请求惰性读取（lib/env.ts「谁用谁校验」），缺失即抛错由 onError 兜底。 */
export function getFeishuGateway(): FeishuGateway {
  const env = getFeishuEnv();
  return createFeishuGateway({ appId: env.FEISHU_APP_ID, appSecret: env.FEISHU_APP_SECRET });
}

/** GitHub 网关：同上，token 按请求惰性读取。 */
export function getGitHubGateway(): GitHubGateway {
  const env = getGitHubEnv();
  return createGitHubGateway({ token: env.GITHUB_TOKEN });
}
