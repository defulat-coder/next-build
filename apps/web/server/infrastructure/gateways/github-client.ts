import { err, ok, tryCatch, type Result } from "@next-build/result";

import type { ProjectError } from "@/server/domains/project/errors";
import type { GitHubGateway, GitHubRepo } from "@/server/domains/project/ports";

/**
 * GitHub REST 端点封装（infrastructure 适配器，实现 domains/project/ports 的 GitHubGateway）。
 * token 由调用方（组合根，从 lib/env.ts 读取）传入，本模块不直接读 process.env，便于测试。
 * 失败分类：仓库不存在/无权限是业务异常（kind: "business"），网络/限流/非预期响应是系统异常。
 */

export interface GitHubConfig {
  token: string;
}

const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/;

/**
 * 解析用户输入的仓库标识：接受 `owner/repo` 或 GitHub URL（可带 .git / 末尾斜杠）。
 * 非法输入返回 null，由路由层按入参校验失败处理。
 */
export function parseRepoInput(input: string): string | null {
  const trimmed = input.trim();
  if (REPO_PATTERN.test(trimmed)) return trimmed;
  const match = /^https?:\/\/github\.com\/([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/i.exec(trimmed);
  return match ? match[1] : null;
}

/** GET /repos/{owner}/{repo}：校验存在性与可访问性，并取默认分支。 */
export async function checkRepo(config: GitHubConfig, repo: string): Promise<Result<GitHubRepo, ProjectError>> {
  const result = await tryCatch(
    fetch(`https://api.github.com/repos/${repo}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${config.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    }),
    (cause): ProjectError => ({ cause, code: "GITHUB_API_FAILED", kind: "system", message: "请求 GitHub API 失败" }),
  );
  if (!result.ok) return result;

  // GitHub 对无权限的私有仓库同样返回 404，不区分这两种情况（避免泄露存在性）。
  if (result.value.status === 404) {
    return err({ code: "GITHUB_REPO_NOT_FOUND", kind: "business", message: `仓库 ${repo} 不存在或无访问权限` });
  }
  if (!result.value.ok) {
    return err({
      code: "GITHUB_API_FAILED",
      kind: "system",
      message: `GitHub API 返回 HTTP ${result.value.status}`,
    });
  }
  const body = (await result.value.json().catch(() => null)) as {
    full_name?: string;
    default_branch?: string;
  } | null;
  if (!body?.full_name || !body.default_branch) {
    return err({ code: "GITHUB_API_FAILED", kind: "system", message: "GitHub API 响应缺少 full_name/default_branch" });
  }
  return ok({ defaultBranch: body.default_branch, repo: body.full_name });
}

/** 装配 GitHubGateway 端口实现：token 在此闭合。 */
export function createGitHubGateway(config: GitHubConfig): GitHubGateway {
  return {
    checkRepo: (repo) => checkRepo(config, repo),
  };
}
