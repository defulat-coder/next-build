import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { createAuthStore } from "./auth-store";
import { createDb, type Db } from "./client";
import { createProjectStore, type ProjectStore } from "./project-store";

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

/** projects.created_by 有外键约束，建项目前先落一个用户。 */
async function createTestStore(): Promise<{ db: Db; store: ProjectStore; userId: string }> {
  const db: Db = createDb({ dbPath: ":memory:", migrationsFolder });
  const user = await createAuthStore(db).upsertUser({ feishuOpenId: "ou_1", name: "张三" });
  if (!user.ok) throw new Error("upsertUser failed");
  return { db, store: createProjectStore(db), userId: user.value.id };
}

function availableRepo(projectId: string, repo: string) {
  return { accessStatus: "available" as const, defaultBranch: "main", projectId, repo };
}

describe("ProjectStore", () => {
  it("项目初始无仓库，详情与列表的主仓为空", async () => {
    const { store, userId } = await createTestStore();
    const created = await store.createProject({ createdBy: userId, description: "内部平台", name: "next-build" });
    if (!created.ok) throw new Error("createProject failed");

    const got = await store.getProject(created.value.id);
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(got.value?.project.name).toBe("next-build");
    expect(got.value?.repos).toEqual([]);
    expect(got.value?.primaryRepo).toBeNull();

    const list = await store.listProjects();
    expect(list.ok && list.value[0]).toMatchObject({ primaryRepo: null, repoCount: 0 });
    expect(await store.getProject("no-such-id")).toEqual({ ok: true, value: null });
  });

  it("更新项目名称/描述；更新不存在 id 返回 null", async () => {
    const { store, userId } = await createTestStore();
    const created = await store.createProject({ createdBy: userId, name: "p" });
    if (!created.ok) throw new Error("createProject failed");

    const updated = await store.updateProject(created.value.id, { description: "新描述", name: "p2" });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.value?.name).toBe("p2");
    expect(updated.value?.description).toBe("新描述");
    expect(updated.value?.updatedAt.getTime()).toBeGreaterThanOrEqual(created.value.updatedAt.getTime());
    expect(await store.updateProject("no-such-id", { name: "x" })).toEqual({ ok: true, value: null });
  });

  it("首仓自动成为主仓，后续仓库保持非主", async () => {
    const { store, userId } = await createTestStore();
    const project = await store.createProject({ createdBy: userId, name: "p" });
    if (!project.ok) throw new Error("createProject failed");

    const first = await store.addRepo(availableRepo(project.value.id, "octo/one"));
    const second = await store.addRepo(availableRepo(project.value.id, "octo/two"));
    expect(first.ok && first.value).toMatchObject({ accessStatus: "available", isPrimary: true });
    expect(second.ok && second.value).toMatchObject({ isPrimary: false });
    if (!first.ok) return;
    expect(first.value.lastValidatedAt.getTime()).toBe(first.value.addedAt.getTime());

    const got = await store.getProject(project.value.id);
    expect(got.ok && got.value?.primaryRepo?.repo).toBe("octo/one");
  });

  it("首个不可访问仓库仍可落库并自动成为主仓", async () => {
    const { store, userId } = await createTestStore();
    const project = await store.createProject({ createdBy: userId, name: "p" });
    if (!project.ok) throw new Error("createProject failed");

    const added = await store.addRepo({
      accessStatus: "unavailable",
      defaultBranch: null,
      projectId: project.value.id,
      repo: "octo/private",
    });
    expect(added.ok && added.value).toMatchObject({
      accessStatus: "unavailable",
      defaultBranch: null,
      isPrimary: true,
    });
  });

  it("同项目重复仓库报错，同一仓库可跨项目", async () => {
    const { store, userId } = await createTestStore();
    const a = await store.createProject({ createdBy: userId, name: "a" });
    const b = await store.createProject({ createdBy: userId, name: "b" });
    if (!a.ok || !b.ok) throw new Error("createProject failed");

    expect((await store.addRepo(availableRepo(a.value.id, "octo/hello"))).ok).toBe(true);
    const duplicate = await store.addRepo(availableRepo(a.value.id, "octo/hello"));
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.error.code).toBe("PROJECT_REPO_EXISTS");
    expect((await store.addRepo(availableRepo(b.value.id, "octo/hello"))).ok).toBe(true);
  });

  it("切换主仓在事务内清旧设新，不可访问目标会回滚", async () => {
    const { store, userId } = await createTestStore();
    const project = await store.createProject({ createdBy: userId, name: "p" });
    if (!project.ok) throw new Error("createProject failed");
    const first = await store.addRepo(availableRepo(project.value.id, "octo/one"));
    const second = await store.addRepo(availableRepo(project.value.id, "octo/two"));
    const unavailable = await store.addRepo({
      accessStatus: "unavailable",
      defaultBranch: null,
      projectId: project.value.id,
      repo: "octo/private",
    });
    if (!first.ok || !second.ok || !unavailable.ok) throw new Error("addRepo failed");

    expect((await store.setPrimaryRepo(project.value.id, second.value.id)).ok).toBe(true);
    let got = await store.getProject(project.value.id);
    expect(got.ok && got.value?.primaryRepo?.id).toBe(second.value.id);

    const rejected = await store.setPrimaryRepo(project.value.id, unavailable.value.id);
    expect(rejected.ok).toBe(false);
    got = await store.getProject(project.value.id);
    expect(got.ok && got.value?.primaryRepo?.id).toBe(second.value.id);
  });

  it("复检结果可刷新规范名、分支、访问状态和时间", async () => {
    const { store, userId } = await createTestStore();
    const project = await store.createProject({ createdBy: userId, name: "p" });
    if (!project.ok) throw new Error("createProject failed");
    const added = await store.addRepo(availableRepo(project.value.id, "octo/old"));
    if (!added.ok) throw new Error("addRepo failed");
    const validatedAt = new Date("2026-08-19T08:00:00Z");

    const updated = await store.updateRepoValidation(added.value.id, {
      accessStatus: "available",
      defaultBranch: "trunk",
      lastValidatedAt: validatedAt,
      repo: "Octo/New",
    });
    expect(updated.ok && updated.value).toMatchObject({
      accessStatus: "available",
      defaultBranch: "trunk",
      repo: "Octo/New",
    });
    if (updated.ok) expect(updated.value?.lastValidatedAt).toEqual(validatedAt);
  });

  it("删除非主仓、最后仓与带替代的主仓", async () => {
    const { store, userId } = await createTestStore();
    const project = await store.createProject({ createdBy: userId, name: "p" });
    if (!project.ok) throw new Error("createProject failed");
    const first = await store.addRepo(availableRepo(project.value.id, "octo/one"));
    const second = await store.addRepo(availableRepo(project.value.id, "octo/two"));
    const third = await store.addRepo(availableRepo(project.value.id, "octo/three"));
    if (!first.ok || !second.ok || !third.ok) throw new Error("addRepo failed");

    expect((await store.removeRepo({ projectId: project.value.id, repoId: third.value.id })).ok).toBe(true);
    const missingReplacement = await store.removeRepo({ projectId: project.value.id, repoId: first.value.id });
    expect(missingReplacement.ok).toBe(false);
    expect(
      (
        await store.removeRepo({
          projectId: project.value.id,
          repoId: first.value.id,
          replacementPrimaryRepoId: second.value.id,
        })
      ).ok,
    ).toBe(true);
    const after = await store.getProject(project.value.id);
    expect(after.ok && after.value?.primaryRepo?.id).toBe(second.value.id);

    expect((await store.removeRepo({ projectId: project.value.id, repoId: second.value.id })).ok).toBe(true);
    const empty = await store.getProject(project.value.id);
    expect(empty.ok && empty.value?.repos).toEqual([]);
  });

  it("替代切换后的删除失败会整体回滚", async () => {
    const { db, store, userId } = await createTestStore();
    const project = await store.createProject({ createdBy: userId, name: "p" });
    if (!project.ok) throw new Error("createProject failed");
    const first = await store.addRepo(availableRepo(project.value.id, "octo/one"));
    const second = await store.addRepo(availableRepo(project.value.id, "octo/two"));
    if (!first.ok || !second.ok) throw new Error("addRepo failed");

    const sqlite = (db as unknown as { $client: { exec: (sql: string) => void } }).$client;
    sqlite.exec(`
      CREATE TRIGGER abort_primary_delete
      BEFORE DELETE ON project_repos
      WHEN OLD.id = '${first.value.id}'
      BEGIN
        SELECT RAISE(ABORT, 'blocked');
      END;
    `);
    const result = await store.removeRepo({
      projectId: project.value.id,
      repoId: first.value.id,
      replacementPrimaryRepoId: second.value.id,
    });
    expect(result.ok).toBe(false);
    const got = await store.getProject(project.value.id);
    expect(got.ok && got.value?.primaryRepo?.id).toBe(first.value.id);
    expect(got.ok && got.value?.repos.find((repo) => repo.id === second.value.id)?.isPrimary).toBe(false);
  });

  it("删除项目时仓库级联删除，列表计数随仓库移除更新", async () => {
    const { store, userId } = await createTestStore();
    const a = await store.createProject({ createdBy: userId, name: "a" });
    const b = await store.createProject({ createdBy: userId, name: "b" });
    if (!a.ok || !b.ok) throw new Error("createProject failed");
    const repo = await store.addRepo(availableRepo(a.value.id, "octo/one"));
    if (!repo.ok) throw new Error("addRepo failed");

    let list = await store.listProjects();
    expect(list.ok && list.value.find((project) => project.id === a.value.id)?.repoCount).toBe(1);
    await store.removeRepo({ projectId: a.value.id, repoId: repo.value.id });
    list = await store.listProjects();
    expect(list.ok && list.value.find((project) => project.id === a.value.id)?.repoCount).toBe(0);

    await store.addRepo(availableRepo(a.value.id, "octo/two"));
    expect((await store.deleteProject(a.value.id)).ok).toBe(true);
    expect(await store.getProject(a.value.id)).toEqual({ ok: true, value: null });
  });
});
