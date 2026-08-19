import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { createAuthStore, createDb, createProjectStore } from "@next-build/db";

import { createListProjects } from "@/server/application/project/list-projects";
import type { ActorContext } from "@/server/domains/iam/model";

const migrationsFolder = resolve(process.cwd(), "../../packages/db/drizzle");

describe("listProjects", () => {
  it("仅按当前项目的 project:read 权限返回，不因 createdBy 泄露项目", async () => {
    const db = createDb({ dbPath: ":memory:", migrationsFolder });
    const user = await createAuthStore(db).upsertUser({ feishuOpenId: "ou_1", name: "张三" });
    if (!user.ok) throw new Error("user failed");
    const store = createProjectStore(db);
    const readable = await store.createProject({ createdBy: user.value.id, name: "可见" });
    const hidden = await store.createProject({ createdBy: user.value.id, name: "不可见" });
    if (!readable.ok || !hidden.ok) throw new Error("project failed");
    const actor: ActorContext = {
      permissions: { projects: [{ permissions: ["project:read"], projectId: readable.value.id, role: "project:viewer" }], sitePermissions: [], siteRole: null, userId: user.value.id },
      userId: user.value.id,
    };
    const result = await createListProjects({ projectStore: store })(actor);
    expect(result.ok && result.value.map((project) => project.id)).toEqual([readable.value.id]);
  });
});
