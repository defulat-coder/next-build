import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createAuthStore, createDb, createProjectStore, createTaskStore } from "@next-build/db";
import { ok } from "@next-build/result";
import type { Sandbox, SandboxProvider } from "@next-build/sandbox";

import type { GitHubGateway } from "@/server/domains/project/ports";
import { TaskProcessManager } from "@/server/infrastructure/processes/task-process-manager";

const migrationsFolder = resolve(process.cwd(), "../../packages/db/drizzle");

describe("TaskProcessManager", () => {
  it("把 queued TaskRun 推进到 Draft PR，并分别落 execution 与 delivery 状态", async () => {
    const db = createDb({ dbPath: ":memory:", migrationsFolder });
    const user = await createAuthStore(db).upsertUser({ feishuOpenId: "ou_1", name: "张三" });
    if (!user.ok) throw new Error("user failed");
    const projectStore = createProjectStore(db);
    const project = await projectStore.createProject({ createdBy: user.value.id, name: "demo" });
    if (!project.ok) throw new Error("project failed");
    const repo = await projectStore.addRepo({ accessStatus: "available", defaultBranch: "main", projectId: project.value.id, repo: "octo/demo" });
    if (!repo.ok) throw new Error("repo failed");
    const taskStore = createTaskStore(db);
    const created = await taskStore.createTask({ acceptanceCriteria: ["通过"], baseSha: "a".repeat(40), branch: "agent/task-demo", canonicalRepo: "octo/demo", commandFingerprint: "fp", createdBy: user.value.id, defaultBranch: "main", idempotencyKey: "request-12345678", projectId: project.value.id, projectRepoId: repo.value.id, requirement: "实现", taskId: "11111111-1111-4111-8111-111111111111", title: "任务", validationCommands: ["pnpm test"], validationVersion: 1 });
    if (!created.ok) throw new Error("task failed");
    const sandbox: Sandbox = {
      destroy: vi.fn(async () => ok(undefined)), name: "task-box", readFile: vi.fn(), writeFile: vi.fn(),
      exec: vi.fn(async (command, args) => {
        if (command === "uname") return ok({ exitCode: 0, stderr: "", stdout: "aarch64\n" });
        if (command === "/opt/claude/claude") return ok({ exitCode: 0, stderr: "", stdout: JSON.stringify({ result: "完成实现" }) });
        if (command === "git" && args?.[0] === "status") return ok({ exitCode: 0, stderr: "", stdout: " M app.ts\n" });
        if (command === "git" && args?.[0] === "rev-parse") return ok({ exitCode: 0, stderr: "", stdout: `${"b".repeat(40)}\n` });
        return ok({ exitCode: 0, stderr: "", stdout: "ok\n" });
      }),
    };
    const sandboxProvider: SandboxProvider = { create: vi.fn(async () => ok(sandbox)), get: vi.fn() };
    const gateway: GitHubGateway = {
      checkRepo: vi.fn(), findPullRequestByHead: vi.fn(), getPullRequest: vi.fn(), resolveExecutionTarget: vi.fn(), resolveRepoHead: vi.fn(),
      createDraftPullRequest: vi.fn(async () => ok({ draft: true, headSha: "b".repeat(40), merged: false, mergedAt: null, mergedSha: null, nodeId: "PR_1", number: 7, state: "open" as const, url: "https://github.com/octo/demo/pull/7" })),
    };
    const manager = new TaskProcessManager({ credentials: () => ({ anthropicApiKey: "test", githubToken: "test" }), gateway, logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() }, sandboxProvider, taskStore });
    manager.enqueue(created.value.detail.task.id);
    await vi.waitFor(async () => {
      const found = await taskStore.getTask(created.value.detail.task.id);
      expect(found.ok && found.value?.task.status).toBe("review");
    });
    const found = await taskStore.getTask(created.value.detail.task.id);
    expect(found.ok && found.value).toMatchObject({ delivery: { githubPrNumber: 7, status: "draft_pr_open" }, runs: [{ stage: "succeeded" }], task: { status: "review" } });
    expect(sandbox.destroy).toHaveBeenCalled();
  });
});
