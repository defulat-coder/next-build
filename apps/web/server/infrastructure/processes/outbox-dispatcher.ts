import type { KnowledgeStore, Logger, OutboxEvent, OutboxStore } from "@next-build/db";

import { queueKnowledgeGeneration } from "@/server/application/knowledge/trigger-knowledge-generation";
import type { GitHubGateway, ProjectStore } from "@/server/domains/project/ports";
import type { KnowledgeDispatcher } from "@/server/domains/knowledge/ports";

type DeliveryMerged = { projectId: string };

/** 可靠跨上下文事实的最小 dispatcher；outbox 是真相源，内存只防同进程并发 drain。 */
export class OutboxDispatcher {
  private running = false;
  constructor(private readonly deps: {
    outboxStore: OutboxStore;
    knowledgeStore: KnowledgeStore;
    projectStore: ProjectStore;
    gateway: GitHubGateway;
    logger: Logger;
    knowledgeDispatcher: KnowledgeDispatcher;
  }) {}

  start(): void { void this.drain(); }
  async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const pending = await this.deps.outboxStore.listPending();
      if (!pending.ok) return;
      for (const event of pending.value) await this.dispatch(event);
    } finally { this.running = false; }
  }

  private async dispatch(event: OutboxEvent): Promise<void> {
    if (event.type !== "DeliveryMerged.v1") {
      await this.deps.outboxStore.markProcessed(event.id);
      return;
    }
    const payload = event.payload as DeliveryMerged;
    const queued = await queueKnowledgeGeneration(this.deps, { projectId: payload.projectId, trigger: "delivery_merged" });
    if (queued.ok) {
      if (queued.value.created) this.deps.knowledgeDispatcher.enqueue(queued.value.generation.id);
      await this.deps.outboxStore.markProcessed(event.id);
      this.deps.logger.info({ event: "outbox.processed", event_id: event.id, event_type: event.type, project_id: payload.projectId }, "DeliveryMerged 已驱动知识刷新");
      return;
    }
    await this.deps.outboxStore.markFailed(event.id, queued.error.code);
    this.deps.logger.warn({ attempts: event.attempts + 1, "error.code": queued.error.code, event: "outbox.delivery_failed", event_id: event.id, event_type: event.type }, "DeliveryMerged 知识刷新暂未成功");
  }
}
