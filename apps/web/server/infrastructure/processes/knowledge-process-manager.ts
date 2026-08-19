import type { KnowledgeStore, Logger } from "@next-build/db";

import type { KnowledgeDispatcher, KnowledgeGenerator } from "@/server/domains/knowledge/ports";

export class KnowledgeProcessManager implements KnowledgeDispatcher {
  private readonly queue = new Set<string>();
  private running = false;
  private started = false;
  constructor(private readonly deps: { knowledgeStore: KnowledgeStore; generator: KnowledgeGenerator; logger: Logger }) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    void this.deps.knowledgeStore.listRecoverableGenerations().then((result) => {
      if (!result.ok) return;
      for (const generation of result.value) this.queue.add(generation.id);
      void this.drain();
    });
  }
  enqueue(generationId: string): void { this.queue.add(generationId); void this.drain(); }
  private async drain() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.size) {
        const id = this.queue.values().next().value as string;
        this.queue.delete(id);
        await this.generate(id);
      }
    } finally { this.running = false; }
  }
  private async generate(id: string) {
    const found = await this.deps.knowledgeStore.getGeneration(id);
    if (!found.ok || !found.value || found.value.status === "published") return;
    const started = await this.deps.knowledgeStore.updateGeneration({ id, expectedVersion: found.value.version, startedAt: new Date(), status: "generating" });
    if (!started.ok || !started.value) return;
    const generated = await this.deps.generator.generate(started.value);
    if (!generated.ok) {
      await this.deps.knowledgeStore.updateGeneration({
        errorCode: generated.error.code, errorMessage: generated.error.message, id,
        expectedVersion: started.value.version, status: "failed",
      });
      this.deps.logger.error({ err: generated.error.cause instanceof Error ? generated.error.cause : undefined, "error.code": generated.error.code, event: "wiki.generation_failed", generation_id: id, project_id: started.value.projectId }, "知识生成失败");
      return;
    }
    const published = await this.deps.knowledgeStore.publishGeneration({
      documents: generated.value.documents, expectedVersion: started.value.version, id, sources: generated.value.sources,
    });
    if (!published.ok || !published.value) return;
    this.deps.logger.info({ document_count: generated.value.documents.length, event: "wiki.generation_published", generation_id: id, project_id: started.value.projectId, source_file_count: generated.value.sources.length }, "知识版本已原子发布");
  }
}
