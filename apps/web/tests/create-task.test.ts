import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createAuthStore, createDb, createProjectStore, createTaskStore } from "@next-build/db";
import { ok } from "@next-build/result";

import { createCreateTask } from "@/server/application/task/create-task";
import type { ActorContext } from "@/server/domains/iam/model";
import type { GitHubGateway } from "@/server/domains/project/ports";

const migrationsFolder = resolve(process.cwd(), "../../packages/db/drizzle");

async function fixture() {
  const db = createDb({ dbPath: ":memory:", migrationsFolder });
  const user = await createAuthStore(db).upsertUser({ feishuOpenId: "ou_1", name: "张三" });
  if (!user.ok) throw new Error("user failed");
  const projectStore = createProjectStore(db);
  const project = await projectStore.createProject({ createdBy: user.value.id, name: "demo" });
  if (!project.ok) throw new Error("project failed");
  const repo = await projectStore.addRepo({ accessStatus: "available", canCreatePr: true, canPush: true, defaultBranch: "main", projectId: project.value.id, providerRepoId: "1", repo: "octo/demo" });
  if (!repo.ok) throw new Error("repo failed");
  const actor: ActorContext = {
    permissions: { projects: [{ permissions: ["task:create"], projectId: project.value.id, role: "project:member" }], sitePermissions: [], siteRole: null, userId: user.value.id },
    userId: user.value.id,
  };
  const gateway: GitHubGateway = {
    checkRepo: vi.fn(), createDraftPullRequest: vi.fn(), findPullRequestByHead: vi.fn(), getPullRequest: vi.fn(), resolveRepoHead: vi.fn(),
    resolveExecutionTarget: vi.fn(async () => ok({ baseSha: "a".repeat(40), canCreatePr: true, canPush: true, defaultBranch: "main", providerRepoId: "1", repo: "octo/demo" })),
  };
  const iamStore = { getProjectRole: vi.fn(async () => ok("project:owner" as const)) } as unknown as import("@next-build/db").IamStore;
  return { actor, gateway, iamStore, project: project.value, projectStore, repo: repo.value, taskStore: createTaskStore(db) };
}

describe("createTask", () => {
  it("通过 Project admission 冻结执行目标并原子创建三份记录，然后唤醒服务端执行器", async () => {
    const input = await fixture();
    const dispatcher = { enqueue: vi.fn() };
    const result = await createCreateTask({ dispatcher, gateway: input.gateway, iamStore: input.iamStore, logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() }, projectStore: input.projectStore, taskStore: input.taskStore })({
      acceptanceCriteria: ["测试通过"], actor: input.actor, idempotencyKey: "request-12345678", projectId: input.project.id,
      nonGoals: "不改登录", projectRepoId: input.repo.id, requirement: "实现项目任务视图", reviewerId: input.actor.userId,
      riskNotes: "影响项目页", title: "项目任务", validationCommands: ["pnpm test"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.detail).toMatchObject({ delivery: { status: "none" }, runs: [{ stage: "queued" }], task: { canonicalRepo: "octo/demo", status: "queued" } });
    expect(result.value.detail.task.branch).toMatch(/^agent\/[a-f0-9]{8}-task$/);
    expect(dispatcher.enqueue).toHaveBeenCalledWith(result.value.detail.task.id);
  });

  it("相同幂等键与相同命令返回原任务，不重复唤醒执行器", async () => {
    const input = await fixture();
    const dispatcher = { enqueue: vi.fn() };
    const useCase = createCreateTask({ dispatcher, gateway: input.gateway, iamStore: input.iamStore, logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() }, projectStore: input.projectStore, taskStore: input.taskStore });
    const command = { acceptanceCriteria: ["通过"], actor: input.actor, idempotencyKey: "request-12345678", nonGoals: "无", projectId: input.project.id, projectRepoId: input.repo.id, requirement: "实现", reviewerId: input.actor.userId, riskNotes: "低", title: "Task", validationCommands: ["pnpm test"] };
    const first = await useCase(command); const replay = await useCase(command);
    expect(first.ok && replay.ok && replay.value.created).toBe(false);
    if (first.ok && replay.ok) expect(replay.value.detail.task.id).toBe(first.value.detail.task.id);
    expect(dispatcher.enqueue).toHaveBeenCalledTimes(1);
  });
});
