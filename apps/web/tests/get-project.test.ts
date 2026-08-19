import { describe, expect, it, vi } from "vitest";

import { ok } from "@next-build/result";

import { createGetProject } from "@/server/application/project/get-project";
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
  repo: "octo/one",
  version: 1,
};

function makeStore(): ProjectStore {
  return {
    addRepo: vi.fn(),
    createProject: vi.fn(),
    archiveProject: vi.fn(),
    deleteProject: vi.fn(),
    getProject: vi.fn(async () => ok({ primaryRepo: repo, project, repos: [repo] })),
    listProjects: vi.fn(),
    removeRepo: vi.fn(),
    setPrimaryRepo: vi.fn(),
    updateProject: vi.fn(),
    updateRepoValidation: vi.fn(),
  };
}

function actorFor(projectId: string): ActorContext {
  return {
    permissions: {
      projects: [{ permissions: ["project:read"], projectId, role: "project:viewer" }],
      sitePermissions: [],
      siteRole: null,
      userId: "u-1",
    },
    userId: "u-1",
  };
}

describe("getProject", () => {
  it("当前项目有 project:read 时返回派生就绪状态", async () => {
    const projectStore = makeStore();
    const result = await createGetProject({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() }, projectStore })({
      actor: actorFor("p-1"),
      id: "p-1",
    });

    expect(result.ok && result.value).toMatchObject({ readiness: "ready", primaryRepo: { id: "r-1" } });
  });

  it("只有其他项目的 project:read 时拒绝且不查询详情", async () => {
    const projectStore = makeStore();
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    const result = await createGetProject({ logger, projectStore })({ actor: actorFor("p-2"), id: "p-1" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    expect(projectStore.getProject).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "authz.denied", project_id: "p-1" }),
      "项目级权限不足",
    );
  });

  it("site admin 可读取任意项目", async () => {
    const projectStore = makeStore();
    const admin: ActorContext = {
      permissions: { projects: [], sitePermissions: [], siteRole: "site:admin", userId: "admin" },
      userId: "admin",
    };
    const result = await createGetProject({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() }, projectStore })({
      actor: admin,
      id: "p-1",
    });
    expect(result.ok).toBe(true);
  });
});
