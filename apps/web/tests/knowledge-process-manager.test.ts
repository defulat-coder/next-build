import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createAuthStore, createDb, createKnowledgeStore, createProjectStore } from "@next-build/db";
import { ok } from "@next-build/result";

import { KnowledgeProcessManager } from "@/server/infrastructure/processes/knowledge-process-manager";

const migrationsFolder = resolve(process.cwd(), "../../packages/db/drizzle");

describe("KnowledgeProcessManager", () => {
  it("把 queued generation 的文档与源码一次性发布", async () => {
    const db = createDb({ dbPath: ":memory:", migrationsFolder });
    const user = await createAuthStore(db).upsertUser({ feishuOpenId: "ou_1", name: "张三" });
    if (!user.ok) throw new Error("user failed");
    const project = await createProjectStore(db).createProject({ createdBy: user.value.id, name: "demo" });
    if (!project.ok) throw new Error("project failed");
    const store = createKnowledgeStore(db);
    const queued = await store.createGeneration({
      projectId: project.value.id, sourceFingerprint: "fp", sourceSet: [{ repo: "octo/demo", sha: "a".repeat(40) }], trigger: "manual",
    });
    if (!queued.ok) throw new Error("queue failed");
    const manager = new KnowledgeProcessManager({
      generator: {
        generate: vi.fn(async (generation) => ok({
          documents: [{ content: "# 架构", generationId: generation.id, id: "doc-1", path: "architecture.md", projectId: generation.projectId, repo: "octo/demo", title: "架构" }],
          sources: [{ content: "export {}", generationId: generation.id, id: "source-1", language: "typescript", path: "index.ts", projectId: generation.projectId, repo: "octo/demo", truncated: false }],
        })),
      },
      knowledgeStore: store,
      logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
    });
    manager.enqueue(queued.value.generation.id);
    await vi.waitFor(async () => {
      const found = await store.getGeneration(queued.value.generation.id);
      expect(found.ok && found.value?.status).toBe("published");
    });
    const documents = await store.listPublishedDocuments(project.value.id);
    expect(documents.ok && documents.value).toMatchObject([{ title: "架构" }]);
  });
});
