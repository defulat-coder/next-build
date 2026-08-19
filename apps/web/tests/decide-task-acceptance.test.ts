import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createAuthStore, createDb, createProjectStore, createTaskStore } from "@next-build/db";

import { createDecideTaskAcceptance } from "@/server/application/task/decide-task-acceptance";
import type { ActorContext } from "@/server/domains/iam/model";

const migrationsFolder = resolve(process.cwd(), "../../packages/db/drizzle");

describe("decideTaskAcceptance", () => {
  it("合并后只有指定 reviewer 可逐条提交业务验收", async () => {
    const db = createDb({ dbPath: ":memory:", migrationsFolder });
    const reviewer = await createAuthStore(db).upsertUser({ feishuOpenId: "ou_1", name: "验收人" });
    if (!reviewer.ok) throw new Error("user failed");
    const projectStore = createProjectStore(db);
    const project = await projectStore.createProject({ createdBy: reviewer.value.id, name: "demo" });
    if (!project.ok) throw new Error("project failed");
    const repo = await projectStore.addRepo({ accessStatus: "available", defaultBranch: "main", projectId: project.value.id, repo: "octo/demo" });
    if (!repo.ok) throw new Error("repo failed");
    const store = createTaskStore(db);
    const task = await store.createTask({ acceptanceCriteria: ["首页可访问"], baseSha: "a", branch: "agent/demo", canonicalRepo: "octo/demo", commandFingerprint: "fp", createdBy: reviewer.value.id, defaultBranch: "main", idempotencyKey: "key-12345678", projectId: project.value.id, projectRepoId: repo.value.id, requirement: "上线首页", reviewerId: reviewer.value.id, taskId: "task-1", title: "首页", validationCommands: ["pnpm test"], validationVersion: 1 });
    if (!task.ok) throw new Error("task failed");
    await store.applyPullRequestFact({ draft: false, eventId: "delivery-1", eventName: "pull_request", headBranch: "agent/demo", headSha: "b", merged: true, mergedAt: new Date(), mergedSha: "c", nodeId: "PR_1", number: 1, repo: "octo/demo", state: "closed", url: "https://github.com/octo/demo/pull/1" });
    const permissions = (userId: string): ActorContext => ({
      permissions: { projects: [{ permissions: ["task:accept"], projectId: project.value.id, role: "project:member" }], sitePermissions: [], siteRole: null, userId }, userId,
    });
    const useCase = createDecideTaskAcceptance({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() }, taskStore: store });
    const command = { criteriaResults: [{ criterion: "首页可访问", passed: true }], decision: "accepted" as const, environment: "production", evidence: [], projectId: project.value.id, taskId: "task-1" };
    const forbidden = await useCase({ ...command, actor: permissions("other") });
    expect(forbidden.ok).toBe(false);
    if (!forbidden.ok) expect(forbidden.error.code).toBe("FORBIDDEN");
    const accepted = await useCase({ ...command, actor: permissions(reviewer.value.id) });
    expect(accepted.ok && accepted.value.task.status).toBe("accepted");
  });
});
