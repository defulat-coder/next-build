import { describe, expect, it, vi } from "vitest";

import { ok } from "@next-build/result";

import { createSetPrimaryRepo } from "@/server/application/project/set-primary-repo";
import type { ActorContext } from "@/server/domains/iam/model";
import type { ProjectStore } from "@/server/domains/project/ports";

const project = {
  createdAt: new Date("2026-01-01"),
  createdBy: "u-1",
  description: null,
  id: "p-1",
  name: "demo",
  updatedAt: new Date("2026-01-01"),
};
const primary = {
  accessStatus: "available" as const,
  addedAt: new Date("2026-01-01"),
  defaultBranch: "main",
  id: "r-1",
  isPrimary: true,
  lastValidatedAt: new Date("2026-01-01"),
  projectId: "p-1",
  repo: "octo/one",
};
const candidate = { ...primary, id: "r-2", isPrimary: false, repo: "octo/two" };
const unavailable = {
  ...candidate,
  accessStatus: "unavailable" as const,
  defaultBranch: null,
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

function makeDeps() {
  const projectStore: ProjectStore = {
    addRepo: vi.fn(),
    createProject: vi.fn(),
    deleteProject: vi.fn(),
    getProject: vi.fn(async () =>
      ok({ primaryRepo: primary, project, repos: [primary, candidate, unavailable] }),
    ),
    listProjects: vi.fn(),
    removeRepo: vi.fn(),
    setPrimaryRepo: vi.fn(async () => ok(undefined)),
    updateProject: vi.fn(),
    updateRepoValidation: vi.fn(),
  };
  return { logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() }, projectStore };
}

describe("setPrimaryRepo", () => {
  it("把同项目可访问仓库切为主仓并记录事件", async () => {
    const deps = makeDeps();
    const result = await createSetPrimaryRepo(deps)({ actor, projectId: "p-1", repoId: "r-2" });

    expect(result.ok && result.value.isPrimary).toBe(true);
    expect(deps.projectStore.setPrimaryRepo).toHaveBeenCalledWith("p-1", "r-2");
    expect(deps.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: "project.primary_repo_changed", from_repo_id: "r-1", to_repo_id: "r-2" }),
      "项目主仓库已切换",
    );
  });

  it("不可访问仓库不能主动设为主仓", async () => {
    const deps = makeDeps();
    const result = await createSetPrimaryRepo(deps)({ actor, projectId: "p-1", repoId: "r-3" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("PROJECT_REPO_UNAVAILABLE");
    expect(deps.projectStore.setPrimaryRepo).not.toHaveBeenCalled();
  });

  it("其他项目的 repo:manage 不会放行当前项目", async () => {
    const deps = makeDeps();
    const otherActor: ActorContext = {
      ...actor,
      permissions: {
        ...actor.permissions,
        projects: [{ permissions: ["repo:manage"], projectId: "p-2", role: "project:owner" }],
      },
    };
    const result = await createSetPrimaryRepo(deps)({ actor: otherActor, projectId: "p-1", repoId: "r-2" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    expect(deps.projectStore.setPrimaryRepo).not.toHaveBeenCalled();
  });
});
