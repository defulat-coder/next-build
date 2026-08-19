/** Next.js Node server 启动即恢复持久化工作流；生产构建 worker 不执行真实任务。 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const [{ getKnowledgeProcessManager, getOutboxDispatcher, getTaskProcessManager }, { logger }] = await Promise.all([
    import("@/server/composition-root"), import("@/lib/logger"),
  ]);
  getTaskProcessManager();
  getKnowledgeProcessManager();
  getOutboxDispatcher().start();
  logger.info({ event: "workflow.workers_started" }, "持久化任务、交付与知识 worker 已启动");
}
