import { describe, expect, it, vi } from "vitest";

import { err, ok } from "@next-build/result";

import { createUpdateProject } from "@/server/application/project/update-project";
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

/** 项目 owner 操作者（project:update 判定放行）。 */
const actor: ActorContext = {
  permissions: {
    projects: [{ permissions: ["project:update"], projectId: "p-1", role: "project:owner" }],
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
    deleteProject: vi.fn(async () => ok(undefined)),
    getProject: vi.fn(async () => ok({ primaryRepo: null, project, repos: [] })),
    listProjects: vi.fn(async () => ok([])),
    removeRepo: vi.fn(async () => ok(undefined)),
    setPrimaryRepo: vi.fn(async () => ok(undefined)),
    updateRepoValidation: vi.fn(),
    updateProject: vi.fn(async (id: string, input: { name: string; description?: string | null }) =>
      ok({ ...project, description: input.description ?? null, id, name: input.name }),
    ),
  };
  const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
  const taskStore = { listTasks: vi.fn(async () => ok([])) } as unknown as import("@next-build/db").TaskStore;
  return { logger, projectStore, taskStore };
}

describe("updateProject", () => {
  it("成功路径：更新名称/描述并打点 project.updated", async () => {
    const deps = makeDeps();
    const updateProject = createUpdateProject(deps);

    const result = await updateProject({ actor, description: "新描述", id: "p-1", name: "demo-2" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe("demo-2");
    expect(result.value.description).toBe("新描述");
    expect(deps.projectStore.updateProject).toHaveBeenCalledWith(
      "p-1",
      expect.objectContaining({ description: "新描述", expectedVersion: 1, name: "demo-2" }),
    );
    expect(deps.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: "project.updated", project_id: "p-1", user_id: "u-1" }),
      "项目更新",
    );
  });

  it("项目不存在时返回业务错误 PROJECT_NOT_FOUND", async () => {
    const deps = makeDeps();
    // 用例先查存在性再判权限：getProject 返回 null 即 PROJECT_NOT_FOUND。
    vi.mocked(deps.projectStore.getProject).mockResolvedValue(ok(null));
    const updateProject = createUpdateProject(deps);

    const result = await updateProject({ actor, id: "no-such", name: "x" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PROJECT_NOT_FOUND");
    expect(result.error.kind).toBe("business");
    expect(deps.logger.info).not.toHaveBeenCalled();
  });

  it("DB 故障翻译为系统错误透出", async () => {
    const deps = makeDeps();
    vi.mocked(deps.projectStore.updateProject).mockResolvedValue(
      err({ code: "DB_WRITE_FAILED", message: "更新项目失败" }),
    );
    const updateProject = createUpdateProject(deps);

    const result = await updateProject({ actor, id: "p-1", name: "x" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("DB_WRITE_FAILED");
    expect(result.error.kind).toBe("system");
  });

  it("没有已业务验收任务时阻止项目直接标记完成", async () => {
    const deps = makeDeps();
    const result = await createUpdateProject(deps)({ actor, id: "p-1", lifecycleStatus: "completed", name: "demo" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("PROJECT_COMPLETION_BLOCKED");
    expect(deps.projectStore.updateProject).not.toHaveBeenCalled();
  });

  it("已验收任务与项目成功标准全部通过时允许完成并记录总结", async () => {
    const deps = makeDeps();
    vi.mocked(deps.projectStore.getProject).mockResolvedValue(ok({ primaryRepo: null, project: { ...project, successCriteria: ["用户可正常使用"] }, repos: [] }));
    vi.mocked(deps.taskStore.listTasks).mockResolvedValue(ok([{ task: { status: "accepted" } }] as never));
    const result = await createUpdateProject(deps)({
      actor,
      completionCriteriaResults: [{ criterion: "用户可正常使用", passed: true }],
      completionSummary: "已上线并完成验收",
      id: "p-1",
      lifecycleStatus: "completed",
      name: "demo",
    });
    expect(result.ok).toBe(true);
    expect(deps.projectStore.updateProject).toHaveBeenCalledWith("p-1", expect.objectContaining({
      completedBy: "u-1",
      completionSummary: "已上线并完成验收",
      lifecycleStatus: "completed",
    }));
  });
});
