import { describe, expect, it, vi } from "vitest";

import { ok } from "@next-build/result";

import { createRemoveRepo } from "@/server/application/project/remove-repo";
import type { ActorContext } from "@/server/domains/iam/model";
import type { ProjectStore } from "@/server/domains/project/ports";

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
const primary = {
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
  repo: "octo/one",
  version: 1,
};
const replacement = { ...primary, id: "r-2", isPrimary: false, repo: "octo/two" };
const unavailable = {
  ...replacement,
  accessStatus: "unavailable" as const,
  id: "r-3",
  repo: "octo/private",
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

function makeDeps(repos = [primary, replacement, unavailable]) {
  const projectStore: ProjectStore = {
    addRepo: vi.fn(),
    createProject: vi.fn(),
    archiveProject: vi.fn(),
    deleteProject: vi.fn(),
    getProject: vi.fn(async () => ok({ primaryRepo: repos.find((repo) => repo.isPrimary) ?? null, project, repos })),
    listProjects: vi.fn(),
    removeRepo: vi.fn(async () => ok(undefined)),
    setPrimaryRepo: vi.fn(),
    updateProject: vi.fn(),
    updateRepoValidation: vi.fn(),
  };
  return { logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() }, projectStore };
}

describe("removeRepo", () => {
  it("删除主仓时把显式可用替代与删除合并为一次 store 调用", async () => {
    const deps = makeDeps();
    const result = await createRemoveRepo(deps)({
      actor,
      projectId: "p-1",
      repoId: "r-1",
      replacementPrimaryRepoId: "r-2",
    });

    expect(result.ok).toBe(true);
    expect(deps.projectStore.removeRepo).toHaveBeenCalledWith({
      expectedVersion: 1,
      projectId: "p-1",
      repoId: "r-1",
      replacementExpectedVersion: 1,
      replacementPrimaryRepoId: "r-2",
    });
    expect(deps.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: "project.primary_repo_changed", from_repo_id: "r-1", to_repo_id: "r-2" }),
      "移除主仓库时切换替代主仓库",
    );
  });

  it("主仓还有其他仓库时缺少替代会拒绝", async () => {
    const deps = makeDeps();
    const result = await createRemoveRepo(deps)({ actor, projectId: "p-1", repoId: "r-1" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("PRIMARY_REPO_REPLACEMENT_REQUIRED");
    expect(deps.projectStore.removeRepo).not.toHaveBeenCalled();
  });

  it("不可访问仓库不能作为替代主仓", async () => {
    const deps = makeDeps();
    const result = await createRemoveRepo(deps)({
      actor,
      projectId: "p-1",
      repoId: "r-1",
      replacementPrimaryRepoId: "r-3",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("PROJECT_REPO_UNAVAILABLE");
    expect(deps.projectStore.removeRepo).not.toHaveBeenCalled();
  });

  it("删除最后仓库无需替代", async () => {
    const deps = makeDeps([primary]);
    const result = await createRemoveRepo(deps)({ actor, projectId: "p-1", repoId: "r-1" });

    expect(result.ok).toBe(true);
    expect(deps.projectStore.removeRepo).toHaveBeenCalledWith({
      expectedVersion: 1,
      projectId: "p-1",
      repoId: "r-1",
      replacementExpectedVersion: undefined,
      replacementPrimaryRepoId: undefined,
    });
  });
});
