import path from "node:path";

import { createAuthStore, createDb, createIamStore, createKnowledgeStore, createOutboxStore, createProjectStore, createTaskStore, seedIam } from "@next-build/db";
import { createMicrosandboxProvider } from "@next-build/sandbox";

import { getAnthropicEnv, getFeishuEnv, getGitHubEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { FeishuGateway } from "@/server/domains/auth/ports";
import type { GitHubGateway } from "@/server/domains/project/ports";
import { createFeishuGateway } from "@/server/infrastructure/gateways/feishu-client";
import { createGitHubGateway } from "@/server/infrastructure/gateways/github-client";
import { TaskProcessManager } from "@/server/infrastructure/processes/task-process-manager";
import { OutboxDispatcher } from "@/server/infrastructure/processes/outbox-dispatcher";
import { KnowledgeProcessManager } from "@/server/infrastructure/processes/knowledge-process-manager";
import { createOpenWikiGenerator } from "@/server/infrastructure/gateways/openwiki-client";
import { DeliveryReconciler } from "@/server/infrastructure/processes/delivery-reconciler";

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

// IAM 种子与既有数据迁移（幂等）：内置角色/权限/映射对齐常量表，users/projects 回填（docs/architecture-rbac-menu.md §7）。
seedIam(db, { logger: dbLogger });

export const authStore = createAuthStore(db, { logger: dbLogger });
export const iamStore = createIamStore(db, { logger: dbLogger });
export const projectStore = createProjectStore(db, { logger: dbLogger });
export const taskStore = createTaskStore(db, { logger: dbLogger });
export const knowledgeStore = createKnowledgeStore(db, { logger: dbLogger });
export const outboxStore = createOutboxStore(db, { logger: dbLogger });

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

/** 后台恢复扫描不应因“当前没有待执行任务”而提前要求 GitHub 环境变量。 */
const lazyGitHubGateway: GitHubGateway = {
  checkRepo: (repo) => getGitHubGateway().checkRepo(repo),
  createDraftPullRequest: (input) => getGitHubGateway().createDraftPullRequest(input),
  getPullRequest: (repo, number) => getGitHubGateway().getPullRequest(repo, number),
  findPullRequestByHead: (repo, headBranch) => getGitHubGateway().findPullRequestByHead(repo, headBranch),
  resolveExecutionTarget: (repo) => getGitHubGateway().resolveExecutionTarget(repo),
  resolveRepoHead: (repo) => getGitHubGateway().resolveRepoHead(repo),
};

let taskProcessManager: TaskProcessManager | undefined;
export function getTaskProcessManager(): TaskProcessManager {
  taskProcessManager ??= new TaskProcessManager({
    credentials: () => ({
      anthropicApiKey: getAnthropicEnv().ANTHROPIC_API_KEY,
      githubToken: getGitHubEnv().GITHUB_TOKEN,
    }),
    gateway: lazyGitHubGateway,
    logger,
    sandboxProvider: createMicrosandboxProvider(),
    taskStore,
  });
  taskProcessManager.start();
  getOutboxDispatcher().start();
  getDeliveryReconciler().start();
  return taskProcessManager;
}

let deliveryReconciler: DeliveryReconciler | undefined;
function getDeliveryReconciler(): DeliveryReconciler {
  deliveryReconciler ??= new DeliveryReconciler({ gateway: lazyGitHubGateway, logger, outbox: getOutboxDispatcher(), taskStore });
  return deliveryReconciler;
}

let outboxDispatcher: OutboxDispatcher | undefined;
export function getOutboxDispatcher(): OutboxDispatcher {
  outboxDispatcher ??= new OutboxDispatcher({ gateway: lazyGitHubGateway, knowledgeDispatcher: getKnowledgeProcessManager(), knowledgeStore, logger, outboxStore, projectStore });
  return outboxDispatcher;
}

let knowledgeProcessManager: KnowledgeProcessManager | undefined;
export function getKnowledgeProcessManager(): KnowledgeProcessManager {
  knowledgeProcessManager ??= new KnowledgeProcessManager({
    generator: {
      generate: (generation) => {
        const credentials = { anthropicApiKey: getAnthropicEnv().ANTHROPIC_API_KEY, githubToken: getGitHubEnv().GITHUB_TOKEN };
        return createOpenWikiGenerator(credentials).generate(generation);
      },
    },
    knowledgeStore,
    logger,
  });
  knowledgeProcessManager.start();
  return knowledgeProcessManager;
}
