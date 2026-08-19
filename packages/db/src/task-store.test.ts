import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { createAuthStore } from "./auth-store";
import { createDb } from "./client";
import { createProjectStore } from "./project-store";
import { createTaskStore } from "./task-store";

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

async function fixture() {
  const db = createDb({ dbPath: ":memory:", migrationsFolder });
  const user = await createAuthStore(db).upsertUser({ feishuOpenId: "ou_1", name: "张三" });
  if (!user.ok) throw new Error("user failed");
  const projectStore = createProjectStore(db);
  const project = await projectStore.createProject({ createdBy: user.value.id, name: "demo" });
  if (!project.ok) throw new Error("project failed");
  const repo = await projectStore.addRepo({ accessStatus: "available", defaultBranch: "main", projectId: project.value.id, repo: "octo/demo" });
  if (!repo.ok) throw new Error("repo failed");
  return { db, project: project.value, repo: repo.value, store: createTaskStore(db), user: user.value };
}

function command(input: Awaited<ReturnType<typeof fixture>>, overrides?: Partial<Parameters<typeof input.store.createTask>[0]>) {
  return {
    acceptanceCriteria: ["测试通过"],
    baseSha: "a".repeat(40),
    branch: "agent/12345678-demo",
    canonicalRepo: "octo/demo",
    commandFingerprint: "fingerprint-1",
    createdBy: input.user.id,
    defaultBranch: "main",
    idempotencyKey: "request-12345678",
    projectId: input.project.id,
    projectRepoId: input.repo.id,
    providerRepoId: "1",
    requirement: "实现功能",
    taskId: "task-1",
    title: "功能",
    validationCommands: ["pnpm test"],
    validationVersion: input.repo.version,
    ...overrides,
  };
}

describe("TaskStore", () => {
  it("原子创建 Task、首个 TaskRun 与 Delivery，并支持相同命令幂等重放", async () => {
    const input = await fixture();
    const first = await input.store.createTask(command(input));
    expect(first.ok && first.value.created).toBe(true);
    if (!first.ok) return;
    expect(first.value.detail).toMatchObject({
      delivery: { status: "none" },
      runs: [{ attempt: 1, stage: "queued" }],
      task: { status: "queued", title: "功能" },
    });

    const replay = await input.store.createTask(command(input, { taskId: "ignored" }));
    expect(replay.ok && replay.value).toMatchObject({ created: false, detail: { task: { id: "task-1" } } });
    const conflict = await input.store.createTask(command(input, { commandFingerprint: "different", taskId: "task-2" }));
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) expect(conflict.error.code).toBe("TASK_IDEMPOTENCY_CONFLICT");
  });

  it("用 CAS 更新任务、执行与交付，重试 attempt 单调递增", async () => {
    const input = await fixture();
    const created = await input.store.createTask(command(input));
    if (!created.ok) throw new Error("task failed");
    const task = await input.store.updateTaskStatus({ expectedVersion: 1, status: "running", taskId: "task-1" });
    expect(task.ok && task.value).toMatchObject({ status: "running", version: 2 });
    const stale = await input.store.updateTaskStatus({ expectedVersion: 1, status: "failed", taskId: "task-1" });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error.code).toBe("CONCURRENCY_CONFLICT");

    const firstRun = created.value.detail.runs[0];
    const run = await input.store.updateRun({ expectedVersion: firstRun.version, runId: firstRun.id, stage: "running", startedAt: new Date() });
    expect(run.ok && run.value).toMatchObject({ stage: "running", version: 2 });
    const retry = await input.store.createRun({ taskId: "task-1" });
    expect(retry.ok && retry.value.attempt).toBe(2);

    const delivery = await input.store.updateDelivery({
      expectedVersion: 1,
      githubPrNumber: 42,
      githubPrUrl: "https://github.com/octo/demo/pull/42",
      status: "draft_pr_open",
      taskId: "task-1",
    });
    expect(delivery.ok && delivery.value).toMatchObject({ githubPrNumber: 42, status: "draft_pr_open", version: 2 });
  });

  it("仅允许对已合并交付逐条提交业务验收，并原子更新 Task", async () => {
    const input = await fixture();
    const created = await input.store.createTask(command(input));
    if (!created.ok) throw new Error("task failed");
    const premature = await input.store.decideAcceptance({
      actorId: input.user.id,
      criteriaResults: [{ criterion: "测试通过", passed: true }],
      decision: "accepted",
      environment: "production",
      evidence: [],
      expectedAcceptanceVersion: 1,
      expectedTaskVersion: 1,
      taskId: "task-1",
    });
    expect(premature.ok).toBe(false);
    if (!premature.ok) expect(premature.error.code).toBe("ACCEPTANCE_NOT_READY");

    const delivery = await input.store.updateDelivery({ expectedVersion: 1, mergedAt: new Date(), mergedSha: "b".repeat(40), status: "merged", taskId: "task-1" });
    const task = await input.store.updateTaskStatus({ expectedVersion: 1, status: "acceptance_pending", taskId: "task-1" });
    if (!delivery.ok || !task.ok || !task.value) throw new Error("merge setup failed");
    const accepted = await input.store.decideAcceptance({
      actorId: input.user.id,
      criteriaResults: [{ criterion: "测试通过", evidence: "线上检查", passed: true }],
      decision: "accepted",
      environment: "production · https://example.com",
      evidence: [{ label: "发布页", url: "https://example.com" }],
      expectedAcceptanceVersion: 1,
      expectedTaskVersion: task.value.version,
      notes: "符合预期",
      taskId: "task-1",
    });
    expect(accepted.ok && accepted.value).toMatchObject({
      acceptance: { environment: "production · https://example.com", status: "accepted", version: 2 },
      task: { status: "accepted", version: 3 },
    });
  });

  it("GitHub webhook 按 delivery id 去重，并通过稳定分支恢复 PR 映射与 DeliveryMerged outbox", async () => {
    const input = await fixture();
    const created = await input.store.createTask(command(input));
    if (!created.ok) throw new Error("task failed");
    const fact = {
      draft: false,
      eventId: "delivery-1",
      eventName: "pull_request",
      headBranch: "agent/12345678-demo",
      headSha: "b".repeat(40),
      merged: true,
      mergedAt: new Date("2026-08-20T00:00:00Z"),
      mergedSha: "c".repeat(40),
      nodeId: "PR_1",
      number: 42,
      repo: "octo/demo",
      state: "closed" as const,
      url: "https://github.com/octo/demo/pull/42",
    };
    const applied = await input.store.applyPullRequestFact(fact);
    expect(applied.ok && applied.value.detail).toMatchObject({
      delivery: { githubPrNumber: 42, status: "merged" },
      task: { status: "acceptance_pending" },
    });
    const duplicate = await input.store.applyPullRequestFact(fact);
    expect(duplicate).toEqual({ ok: true, value: { detail: null, duplicate: true } });
    const { outboxEvents } = await import("./schema");
    expect(input.db.select().from(outboxEvents).all()).toHaveLength(1);
  });

  it("任务重试在一个事务内同时创建新 run 并恢复 queued", async () => {
    const input = await fixture();
    const created = await input.store.createTask(command(input));
    if (!created.ok) throw new Error("task failed");
    const failed = await input.store.updateTaskStatus({ expectedVersion: 1, status: "failed", taskId: "task-1" });
    if (!failed.ok || !failed.value) throw new Error("fail setup failed");
    const retried = await input.store.retryTask({ expectedTaskVersion: failed.value.version, taskId: "task-1" });
    expect(retried.ok && retried.value).toMatchObject({
      runs: [{ attempt: 1 }, { attempt: 2, stage: "queued" }],
      task: { status: "queued", version: 3 },
    });
  });

  it("取消任务会在一个事务内同时终止当前 run", async () => {
    const input = await fixture();
    const created = await input.store.createTask(command(input));
    if (!created.ok) throw new Error("task failed");
    const cancelled = await input.store.cancelTask({ expectedTaskVersion: 1, taskId: "task-1" });
    expect(cancelled.ok && cancelled.value).toMatchObject({
      runs: [{ checkpoint: "cancelled", stage: "cancelled" }],
      task: { status: "cancelled", version: 2 },
    });
  });
});
