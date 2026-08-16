import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { createAuthStore } from "./auth-store";
import { createDb, type Db } from "./client";
import { createProjectStore, type ProjectStore } from "./project-store";

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

/** projects.created_by 有外键约束，建项目前先落一个用户。 */
async function createTestStore(): Promise<{ store: ProjectStore; userId: string }> {
  const db: Db = createDb({ dbPath: ":memory:", migrationsFolder });
  const user = await createAuthStore(db).upsertUser({ feishuOpenId: "ou_1", name: "张三" });
  if (!user.ok) throw new Error("upsertUser failed");
  return { store: createProjectStore(db), userId: user.value.id };
}

describe("ProjectStore", () => {
  it("建项目后可按 id 查到（初始无仓库）", async () => {
    const { store, userId } = await createTestStore();
    const created = await store.createProject({ createdBy: userId, description: "内部平台", name: "next-build" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const got = await store.getProject(created.value.id);
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(got.value?.project.name).toBe("next-build");
    expect(got.value?.project.description).toBe("内部平台");
    expect(got.value?.repos).toEqual([]);

    const missing = await store.getProject("no-such-id");
    expect(missing).toEqual({ ok: true, value: null });
  });

  it("同一项目重复添加同一仓库返回业务错误 PROJECT_REPO_EXISTS", async () => {
    const { store, userId } = await createTestStore();
    const project = await store.createProject({ createdBy: userId, name: "p" });
    if (!project.ok) throw new Error("createProject failed");

    const input = { defaultBranch: "main", projectId: project.value.id, repo: "octo/hello" };
    const first = await store.addRepo(input);
    expect(first.ok).toBe(true);

    const dup = await store.addRepo(input);
    expect(dup.ok).toBe(false);
    if (dup.ok) return;
    expect(dup.error.code).toBe("PROJECT_REPO_EXISTS");
  });

  it("删除项目时仓库级联删除", async () => {
    const { store, userId } = await createTestStore();
    const project = await store.createProject({ createdBy: userId, name: "p" });
    if (!project.ok) throw new Error("createProject failed");
    await store.addRepo({ defaultBranch: "main", projectId: project.value.id, repo: "octo/hello" });

    const removed = await store.deleteProject(project.value.id);
    expect(removed.ok).toBe(true);

    const got = await store.getProject(project.value.id);
    expect(got).toEqual({ ok: true, value: null });
  });

  it("列表含各项目仓库数，removeRepo 后计数减少", async () => {
    const { store, userId } = await createTestStore();
    const a = await store.createProject({ createdBy: userId, name: "a" });
    const b = await store.createProject({ createdBy: userId, name: "b" });
    if (!a.ok || !b.ok) throw new Error("createProject failed");

    const repo1 = await store.addRepo({ defaultBranch: "main", projectId: a.value.id, repo: "octo/one" });
    await store.addRepo({ defaultBranch: "main", projectId: a.value.id, repo: "octo/two" });
    if (!repo1.ok) throw new Error("addRepo failed");

    const list = await store.listProjects();
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    const byName = new Map(list.value.map((p) => [p.name, p.repoCount]));
    expect(byName.get("a")).toBe(2);
    expect(byName.get("b")).toBe(0);

    await store.removeRepo(repo1.value.id);
    const after = await store.listProjects();
    if (!after.ok) throw new Error("listProjects failed");
    expect(after.value.find((p) => p.name === "a")?.repoCount).toBe(1);
  });
});
