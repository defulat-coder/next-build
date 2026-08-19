import { describe, expect, it, vi } from "vitest";

import { err, ok } from "@next-build/result";

import { createAddRepo } from "@/server/application/project/add-repo";
import type { ActorContext } from "@/server/domains/iam/model";
import type { ProjectError } from "@/server/domains/project/errors";
import type { GitHubGateway, ProjectStore } from "@/server/domains/project/ports";

const project = {
  createdAt: new Date("2026-01-01"),
  createdBy: "u-1",
  description: null,
  id: "p-1",
  name: "demo",
  updatedAt: new Date("2026-01-01"),
};

/** 项目 owner 操作者（repo:manage 判定放行）。 */
const actor: ActorContext = {
  permissions: {
    projects: [{ permissions: ["repo:manage"], projectId: "p-1", role: "project:owner" }],
    sitePermissions: [],
    siteRole: null,
    userId: "u-1",
  },
  userId: "u-1",
};
const input = { actor, projectId: "p-1", repo: "octocat/hello-world" };

function makeDeps() {
  const projectStore: ProjectStore = {
    addRepo: vi.fn(async (repoInput: {
      accessStatus: "available" | "unavailable";
      projectId: string;
      repo: string;
      defaultBranch: string | null;
    }) =>
      ok({
        accessStatus: repoInput.accessStatus,
        addedAt: new Date(),
        defaultBranch: repoInput.defaultBranch,
        id: "r-1",
        isPrimary: true,
        lastValidatedAt: new Date(),
        projectId: repoInput.projectId,
        repo: repoInput.repo,
      }),
    ),
    createProject: vi.fn(),
    deleteProject: vi.fn(async () => ok(undefined)),
    getProject: vi.fn(async () => ok({ primaryRepo: null, project, repos: [] })),
    listProjects: vi.fn(async () => ok([])),
    removeRepo: vi.fn(async () => ok(undefined)),
    setPrimaryRepo: vi.fn(async () => ok(undefined)),
    updateRepoValidation: vi.fn(),
    updateProject: vi.fn(),
  };
  const gateway: GitHubGateway = {
    checkRepo: vi.fn(async (repo: string) => ok({ defaultBranch: "main", repo })),
  };
  const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
  return { gateway, logger, projectStore };
}

describe("addRepo", () => {
  it("成功路径：先 GitHub 校验再入库（默认分支来自校验结果）", async () => {
    const deps = makeDeps();
    const addRepo = createAddRepo(deps);

    const result = await addRepo(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.repo).toBe("octocat/hello-world");
    expect(deps.gateway.checkRepo).toHaveBeenCalledWith("octocat/hello-world");
    expect(deps.projectStore.addRepo).toHaveBeenCalledWith({
      accessStatus: "available",
      defaultBranch: "main",
      projectId: "p-1",
      repo: "octocat/hello-world",
    });
    expect(deps.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: "project.repo_added", project_id: "p-1", repo: "octocat/hello-world" }),
      "仓库添加到项目",
    );
  });

  it("GitHub 404/无权限时保留不可访问记录", async () => {
    const error: ProjectError = {
      code: "GITHUB_REPO_NOT_FOUND",
      kind: "business",
      message: "仓库 octocat/no-such 不存在或无访问权限",
    };
    const deps = makeDeps();
    vi.mocked(deps.gateway.checkRepo).mockResolvedValue(err(error));
    const addRepo = createAddRepo(deps);

    const result = await addRepo({ ...input, repo: "octocat/no-such" });

    expect(result.ok).toBe(true);
    expect(deps.projectStore.addRepo).toHaveBeenCalledWith({
      accessStatus: "unavailable",
      defaultBranch: null,
      projectId: "p-1",
      repo: "octocat/no-such",
    });
    expect(deps.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ access_status: "unavailable", event: "project.repo_added" }),
      "不可访问仓库已保留在项目中",
    );
  });

  it("GitHub 网络或限流失败时不覆盖数据", async () => {
    const error: ProjectError = {
      code: "GITHUB_API_FAILED",
      kind: "system",
      message: "请求 GitHub API 失败",
    };
    const deps = makeDeps();
    vi.mocked(deps.gateway.checkRepo).mockResolvedValue(err(error));

    const result = await createAddRepo(deps)(input);

    expect(result).toEqual({ error, ok: false });
    expect(deps.projectStore.addRepo).not.toHaveBeenCalled();
  });

  it("重复添加时透出业务错误 PROJECT_REPO_EXISTS", async () => {
    const deps = makeDeps();
    vi.mocked(deps.projectStore.addRepo).mockResolvedValue(
      err({ code: "PROJECT_REPO_EXISTS", message: "仓库 octocat/hello-world 已在项目中" }),
    );
    const addRepo = createAddRepo(deps);

    const result = await addRepo(input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PROJECT_REPO_EXISTS");
    expect(result.error.kind).toBe("business");
  });
});
