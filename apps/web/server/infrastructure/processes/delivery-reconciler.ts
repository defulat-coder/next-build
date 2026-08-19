import type { Logger, TaskStore } from "@next-build/db";

import type { GitHubGateway } from "@/server/domains/project/ports";
import type { OutboxDispatcher } from "./outbox-dispatcher";

export class DeliveryReconciler {
  private started = false;
  private running = false;
  constructor(private readonly deps: { taskStore: TaskStore; gateway: GitHubGateway; outbox: OutboxDispatcher; logger: Logger }) {}
  start() {
    if (this.started) return;
    this.started = true;
    void this.run();
    const timer = setInterval(() => void this.run(), 60_000);
    timer.unref();
  }
  private async run() {
    if (this.running) return;
    this.running = true;
    try {
      const pending = await this.deps.taskStore.listDeliveriesNeedingReconcile();
      if (!pending.ok) return;
      for (const detail of pending.value) {
        const number = detail.delivery.githubPrNumber!;
        const remote = await this.deps.gateway.getPullRequest(detail.task.canonicalRepo, number);
        if (!remote.ok) continue;
        await this.deps.taskStore.applyPullRequestFact({
          draft: remote.value.draft,
          eventId: `scheduled:${remote.value.nodeId}:${remote.value.mergedSha ?? remote.value.headSha}:${remote.value.state}:${remote.value.draft}`,
          eventName: "scheduled_reconcile",
          headBranch: detail.task.branch,
          headSha: remote.value.headSha,
          merged: remote.value.merged,
          mergedAt: remote.value.mergedAt,
          mergedSha: remote.value.mergedSha,
          nodeId: remote.value.nodeId,
          number,
          repo: detail.task.canonicalRepo,
          state: remote.value.state,
          url: remote.value.url,
        });
      }
      this.deps.outbox.start();
    } finally { this.running = false; }
  }
}
