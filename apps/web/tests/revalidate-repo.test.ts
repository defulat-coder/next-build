import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { err, ok } from "@next-build/result";

import { createRevalidateRepo } from "@/server/application/project/revalidate-repo";
import type { ActorContext } from "@/server/domains/iam/model";
import type { ProjectError } from "@/server/domains/project/errors";
import type { GitHubGateway, ProjectStore } from "@/server/domains/project/ports";

const now = new Date("2026-08-19T08:00:00Z");
const project = {
  archivedAt: null,
  completedAt: null,
  completedBy: null,
  completionCriteriaResults: [],
  completionSummary: null,
  createdAt: new Date("2026-01-01"),
  createdBy: "u-1",
  description: null,
  desiredOutcome: null,
  id: "p-1",
  name: "demo",
  nonGoals: null,
  problemStatement: null,
  successCriteria: [],
  targetDate: null,
  lifecycleStatus: "planned" as const,
  updatedAt: new Date("2026-01-01"),
  version: 1,
};
const repo = {
  accessStatus: "available" as const,
  addedAt: new Date("2026-01-01"),
  defaultBranch: "main",
  canCreatePr: true,
  canPush: true,
  detachedAt: null,
  id: "r-1",
  isPrimary: true,
  lastExecutionValidatedAt: new Date("2026-01-01"),
  lastValidatedAt: new Date("2026-01-01"),
  projectId: "p-1",
  providerRepoId: "1",
  repo: "octo/old",
  version: 1,
};
const actor: ActorContext = {
  permissions: {
    projects: [{ permissions: ["repo:manage"], projectId: "p-1", role: "project:owner" }],
    sitePermissions: [],
    siteRole: null,
    userId: "u-1",
  },
  userId: "u-1",
};

function makeDeps() {
  const projectStore: ProjectStore = {
    addRepo: vi.fn(),
    createProject: vi.fn(),
    archiveProject: vi.fn(),
    deleteProject: vi.fn(),
    getProject: vi.fn(async () => ok({ primaryRepo: repo, project, repos: [repo] })),
    listProjects: vi.fn(),
    removeRepo: vi.fn(),
    setPrimaryRepo: vi.fn(),
    updateProject: vi.fn(),
    updateRepoValidation: vi.fn(async (_id, input) => ok({ ...repo, ...input })),
  };
  const gateway: GitHubGateway = {
    checkRepo: vi.fn(async () => ok({ canCreatePr: true, canPush: true, defaultBranch: "trunk", providerRepoId: "2", repo: "Octo/Renamed" })),
    createDraftPullRequest: vi.fn(),
    getPullRequest: vi.fn(),
    findPullRequestByHead: vi.fn(),
    resolveRepoHead: vi.fn(),
    resolveExecutionTarget: vi.fn(),
  };
  return { gateway, logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() }, projectStore };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("revalidateRepo", () => {
  it("成功时刷新规范名、默认分支、状态和时间", async () => {
    const deps = makeDeps();
    const result = await createRevalidateRepo(deps)({ actor, projectId: "p-1", repoId: "r-1" });

    expect(result.ok).toBe(true);
    expect(deps.projectStore.updateRepoValidation).toHaveBeenCalledWith("r-1", {
      accessStatus: "available",
      canCreatePr: true,
      canPush: true,
      defaultBranch: "trunk",
      expectedVersion: 1,
      lastExecutionValidatedAt: now,
      lastValidatedAt: now,
      providerRepoId: "2",
      repo: "Octo/Renamed",
    });
    expect(deps.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ access_status: "available", event: "project.repo_revalidated" }),
      "仓库复检通过",
    );
  });

  it("404/无权限时保留仓库名与分支，标不可访问并刷新时间", async () => {
    const deps = makeDeps();
    vi.mocked(deps.gateway.checkRepo).mockResolvedValue(
      err({ code: "GITHUB_REPO_NOT_FOUND", kind: "business", message: "不存在或无权限" }),
    );

    const result = await createRevalidateRepo(deps)({ actor, projectId: "p-1", repoId: "r-1" });

    expect(result.ok).toBe(true);
    expect(deps.projectStore.updateRepoValidation).toHaveBeenCalledWith("r-1", {
      accessStatus: "unavailable",
      defaultBranch: "main",
      expectedVersion: 1,
      lastValidatedAt: now,
      repo: "octo/old",
    });
    expect(deps.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ access_status: "unavailable", event: "project.repo_revalidated" }),
      "仓库复检后不可访问",
    );
  });

  it("网络或限流失败时不覆盖旧状态", async () => {
    const deps = makeDeps();
    const error: ProjectError = {
      code: "GITHUB_API_FAILED",
      kind: "system",
      message: "GitHub API 返回 HTTP 429",
    };
    vi.mocked(deps.gateway.checkRepo).mockResolvedValue(err(error));

    const result = await createRevalidateRepo(deps)({ actor, projectId: "p-1", repoId: "r-1" });

    expect(result).toEqual({ error, ok: false });
    expect(deps.projectStore.updateRepoValidation).not.toHaveBeenCalled();
    expect(deps.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ "error.code": "GITHUB_API_FAILED", event: "project.repo_revalidated" }),
      "仓库复检失败，保留旧状态",
    );
  });
});
