import type { Result } from "@next-build/result";

import type { ProjectError } from "./errors";

/** 持久化端口：直接复用 packages/db 的窄接口契约（端口契约留在 packages，业务规则不进 packages）。 */
export type { ProjectStore } from "@next-build/db";

/** GitHub 校验通过的仓库（full_name 为 GitHub 返回的规范化 owner/repo）。 */
export interface GitHubRepo {
  repo: string;
  defaultBranch: string;
}

/**
 * GitHub 网关端口：校验仓库存在且当前 token 可访问，返回默认分支。
 * 实现见 infrastructure/gateways/github-client.ts；token 在装配时闭合。
 */
export interface GitHubGateway {
  checkRepo(repo: string): Promise<Result<GitHubRepo, ProjectError>>;
}
