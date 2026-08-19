import { err, ok, tryCatch, type Result } from "@next-build/result";

import type { ProjectError } from "@/server/domains/project/errors";
import type { GitHubExecutionTarget, GitHubGateway, GitHubPullRequest, GitHubRepo, GitHubRepoHead } from "@/server/domains/project/ports";

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
    id?: number;
    full_name?: string;
    default_branch?: string;
    permissions?: { push?: boolean };
  } | null;
  if (!body?.id || !body.full_name || !body.default_branch) {
    return err({ code: "GITHUB_API_FAILED", kind: "system", message: "GitHub API 响应缺少 id/full_name/default_branch" });
  }
  const canPush = body.permissions?.push === true;
  return ok({
    canCreatePr: canPush,
    canPush,
    defaultBranch: body.default_branch,
    providerRepoId: String(body.id),
    repo: body.full_name,
  });
}

/** 冻结一次任务执行目标：重新校验仓库能力，并读取默认分支当前 SHA。 */
export async function resolveExecutionTarget(
  config: GitHubConfig,
  repo: string,
): Promise<Result<GitHubExecutionTarget, ProjectError>> {
  const checked = await checkRepo(config, repo);
  if (!checked.ok) return checked;
  if (!checked.value.canPush || !checked.value.canCreatePr) {
    return err({
      code: "PROJECT_EXECUTION_NOT_READY",
      kind: "business",
      message: `服务端 GitHub 凭证无法向 ${checked.value.repo} 推送分支或创建 Pull Request`,
    });
  }
  const head = await readBranchHead(config, checked.value.repo, checked.value.defaultBranch);
  if (!head.ok) return head;
  return ok({ ...checked.value, baseSha: head.value });
}

async function readBranchHead(config: GitHubConfig, repo: string, branch: string): Promise<Result<string, ProjectError>> {
  const response = await tryCatch(
    fetch(`https://api.github.com/repos/${repo}/branches/${encodeURIComponent(branch)}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${config.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    }),
    (cause): ProjectError => ({ cause, code: "GITHUB_API_FAILED", kind: "system", message: "读取 GitHub 默认分支失败" }),
  );
  if (!response.ok) return response;
  if (!response.value.ok) {
    return err({ code: "GITHUB_API_FAILED", kind: "system", message: `GitHub API 返回 HTTP ${response.value.status}` });
  }
  const body = (await response.value.json().catch(() => null)) as { commit?: { sha?: string } } | null;
  if (!body?.commit?.sha) {
    return err({ code: "GITHUB_API_FAILED", kind: "system", message: "GitHub API 响应缺少默认分支 SHA" });
  }
  return ok(body.commit.sha);
}

export async function resolveRepoHead(config: GitHubConfig, repo: string): Promise<Result<GitHubRepoHead, ProjectError>> {
  const checked = await checkRepo(config, repo);
  if (!checked.ok) return checked;
  const head = await readBranchHead(config, checked.value.repo, checked.value.defaultBranch);
  return head.ok ? ok({ ...checked.value, headSha: head.value }) : head;
}

function toPullRequest(body: {
  number?: number; node_id?: string; html_url?: string; state?: string; merged?: boolean;
  merged_at?: string | null; merge_commit_sha?: string | null; head?: { sha?: string }; draft?: boolean;
}): Result<GitHubPullRequest, ProjectError> {
  if (!body.number || !body.node_id || !body.html_url || !body.head?.sha || (body.state !== "open" && body.state !== "closed")) {
    return err({ code: "GITHUB_API_FAILED", kind: "system", message: "GitHub Pull Request 响应字段不完整" });
  }
  return ok({
    draft: body.draft === true,
    headSha: body.head.sha,
    merged: body.merged === true,
    mergedAt: body.merged_at ? new Date(body.merged_at) : null,
    mergedSha: body.merge_commit_sha ?? null,
    nodeId: body.node_id,
    number: body.number,
    state: body.state,
    url: body.html_url,
  });
}

export async function createDraftPullRequest(config: GitHubConfig, input: {
  repo: string; title: string; body: string; head: string; base: string;
}): Promise<Result<GitHubPullRequest, ProjectError>> {
  const response = await tryCatch(fetch(`https://api.github.com/repos/${input.repo}/pulls`, {
    body: JSON.stringify({ base: input.base, body: input.body, draft: true, head: input.head, title: input.title }),
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${config.token}`, "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28" },
    method: "POST",
  }), (cause): ProjectError => ({ cause, code: "GITHUB_API_FAILED", kind: "system", message: "创建 GitHub Pull Request 失败" }));
  if (!response.ok) return response;
  if (response.value.status === 422) return err({ code: "GITHUB_DELIVERY_REJECTED", kind: "business", message: "GitHub 拒绝创建 Draft PR，请检查分支是否已有 PR 或没有新提交" });
  if (!response.value.ok) return err({ code: "GITHUB_API_FAILED", kind: "system", message: `GitHub API 返回 HTTP ${response.value.status}` });
  return toPullRequest(await response.value.json() as Parameters<typeof toPullRequest>[0]);
}

export async function getPullRequest(config: GitHubConfig, repo: string, number: number): Promise<Result<GitHubPullRequest, ProjectError>> {
  const response = await tryCatch(fetch(`https://api.github.com/repos/${repo}/pulls/${number}`, {
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${config.token}`, "X-GitHub-Api-Version": "2022-11-28" },
  }), (cause): ProjectError => ({ cause, code: "GITHUB_API_FAILED", kind: "system", message: "读取 GitHub Pull Request 失败" }));
  if (!response.ok) return response;
  if (response.value.status === 404) return err({ code: "GITHUB_DELIVERY_REJECTED", kind: "business", message: "GitHub Pull Request 不存在或无权访问" });
  if (!response.value.ok) return err({ code: "GITHUB_API_FAILED", kind: "system", message: `GitHub API 返回 HTTP ${response.value.status}` });
  return toPullRequest(await response.value.json() as Parameters<typeof toPullRequest>[0]);
}

export async function findPullRequestByHead(config: GitHubConfig, repo: string, headBranch: string): Promise<Result<GitHubPullRequest | null, ProjectError>> {
  const owner = repo.split("/")[0];
  const query = new URLSearchParams({ head: `${owner}:${headBranch}`, per_page: "1", state: "all" });
  const response = await tryCatch(fetch(`https://api.github.com/repos/${repo}/pulls?${query}`, {
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${config.token}`, "X-GitHub-Api-Version": "2022-11-28" },
  }), (cause): ProjectError => ({ cause, code: "GITHUB_API_FAILED", kind: "system", message: "按分支查询 GitHub Pull Request 失败" }));
  if (!response.ok) return response;
  if (!response.value.ok) return err({ code: "GITHUB_API_FAILED", kind: "system", message: `GitHub API 返回 HTTP ${response.value.status}` });
  const body = await response.value.json() as Array<Parameters<typeof toPullRequest>[0]>;
  if (!body[0]) return ok(null);
  return toPullRequest(body[0]);
}

/** 装配 GitHubGateway 端口实现：token 在此闭合。 */
export function createGitHubGateway(config: GitHubConfig): GitHubGateway {
  return {
    checkRepo: (repo) => checkRepo(config, repo),
    resolveRepoHead: (repo) => resolveRepoHead(config, repo),
    resolveExecutionTarget: (repo) => resolveExecutionTarget(config, repo),
    createDraftPullRequest: (input) => createDraftPullRequest(config, input),
    getPullRequest: (repo, number) => getPullRequest(config, repo, number),
    findPullRequestByHead: (repo, headBranch) => findPullRequestByHead(config, repo, headBranch),
  };
}
