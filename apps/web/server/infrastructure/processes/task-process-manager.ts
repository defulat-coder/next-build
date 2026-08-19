import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";

import type { Logger, TaskDetail, TaskRun, TaskStore } from "@next-build/db";
import type { Sandbox, SandboxProvider } from "@next-build/sandbox";

import type { GitHubGateway } from "@/server/domains/project/ports";
import type { TaskDispatcher } from "@/server/domains/task/ports";

interface Credentials { anthropicApiKey: string; githubToken: string }
interface ExecutionFailure { code: string; message: string; cause?: unknown }

/** 单进程持久化队列协调器：状态在 SQLite，内存只保存唤醒信号。 */
export class TaskProcessManager implements TaskDispatcher {
  private readonly queue = new Set<string>();
  private running = false;
  private started = false;
  private readonly workerId = `worker-${process.pid}-${randomUUID()}`;

  constructor(private readonly deps: {
    taskStore: TaskStore;
    sandboxProvider: SandboxProvider;
    gateway: GitHubGateway;
    credentials: () => Credentials;
    logger: Logger;
  }) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    void this.deps.taskStore.listRecoverableTasks().then((result) => {
      if (!result.ok) {
        this.deps.logger.error({ "error.code": result.error.code, event: "task.recovery_scan_failed" }, "扫描待恢复任务失败");
        return;
      }
      for (const detail of result.value) this.queue.add(detail.task.id);
      void this.drain();
    });
  }

  enqueue(taskId: string): void {
    this.queue.add(taskId);
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.size > 0) {
        const taskId = this.queue.values().next().value as string;
        this.queue.delete(taskId);
        await this.execute(taskId);
      }
    } finally {
      this.running = false;
    }
  }

  private async execute(taskId: string): Promise<void> {
    const found = await this.deps.taskStore.getTask(taskId);
    if (!found.ok || !found.value) return;
    let detail = found.value;
    let latestRun = detail.runs.at(-1);
    if (!latestRun) return;
    if (latestRun.stage === "publishing") {
      await this.recoverPublishing(detail, latestRun);
      return;
    }
    if (!["queued", "provisioning", "running"].includes(latestRun.stage)) return;
    const claimed = await this.deps.taskStore.claimRun({
      deadlineAt: new Date(Date.now() + 60 * 60_000), leaseExpiresAt: new Date(Date.now() + 45_000),
      runId: latestRun.id, taskId, workerId: this.workerId,
    });
    if (!claimed.ok || !claimed.value) return;
    detail = claimed.value;
    latestRun = detail.runs.at(-1);
    if (!latestRun) return;

    let run = latestRun;
    let sandbox: Sandbox | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    try {
      const credentials = this.deps.credentials();
      heartbeatTimer = setInterval(() => {
        void this.deps.taskStore.heartbeatRun({ runId: run.id, workerId: this.workerId, leaseExpiresAt: new Date(Date.now() + 45_000) });
      }, 15_000);
      const basic = Buffer.from(`x-access-token:${credentials.githubToken}`).toString("base64");
      const created = await this.deps.sandboxProvider.create({
        env: {
          GIT_CONFIG_COUNT: "1",
          GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
        },
        name: `task-${taskId}`,
        secrets: [
          { allowedHost: "api.anthropic.com", envVar: "ANTHROPIC_API_KEY", value: credentials.anthropicApiKey },
          { allowedHost: "github.com", envVar: "GIT_CONFIG_VALUE_0", value: `AUTHORIZATION: basic ${basic}` },
        ],
        source: { depth: 50, revision: detail.task.baseSha, url: `https://github.com/${detail.task.canonicalRepo}.git` },
      });
      if (!created.ok) throw created.error;
      sandbox = created.value;
      run = await this.requireRun(await this.deps.taskStore.updateRun({
        agentSessionId: taskId,
        expectedVersion: run.version,
        heartbeatAt: new Date(),
        checkpoint: "agent_running",
        leaseExpiresAt: new Date(Date.now() + 45_000),
        runId: run.id,
        sandboxRef: sandbox.name,
        stage: "running",
        workerId: this.workerId,
      }));

      await mustExec(sandbox, "git", ["checkout", "-b", detail.task.branch], "/workspace", "BRANCH_CREATE_FAILED");
      const arch = await mustExec(sandbox, "uname", ["-m"], "/workspace", "SANDBOX_ARCH_FAILED");
      const platform = arch.stdout.trim() === "x86_64" ? "linux-x64" : "linux-arm64";
      await mustExec(sandbox, "sh", ["-lc", `mkdir -p /opt/claude && cd /opt/claude && npm pack @anthropic-ai/claude-agent-sdk-${platform}@0.3.233 --silent > /tmp/claude-package && tar -xzf \"$(cat /tmp/claude-package)\" --strip-components=1 && chmod +x claude`], "/workspace", "AGENT_INSTALL_FAILED");
      const prompt = buildPrompt(detail);
      const agent = await mustExec(sandbox, "/opt/claude/claude", [
        "--print", "--output-format", "json", "--bare", "--dangerously-skip-permissions", "--permission-mode", "bypassPermissions",
        "--max-budget-usd", "10", "--session-id", taskId, prompt,
      ], "/workspace", "AGENT_FAILED");
      const validation: string[] = [];
      for (const command of detail.task.validationCommands) {
        const output = await mustExec(sandbox, "sh", ["-lc", command], "/workspace", "VALIDATION_FAILED");
        validation.push(`- \`${command}\`: passed${output.stdout.trim() ? ` — ${output.stdout.trim().slice(-300)}` : ""}`);
      }
      const changes = await mustExec(sandbox, "git", ["status", "--porcelain"], "/workspace", "GIT_STATUS_FAILED");
      if (!changes.stdout.trim()) throw { code: "NO_CHANGES", message: "Agent 未产生可交付的代码变更" } satisfies ExecutionFailure;
      await mustExec(sandbox, "git", ["config", "user.name", "Next Build Agent"], "/workspace", "GIT_CONFIG_FAILED");
      await mustExec(sandbox, "git", ["config", "user.email", "agent@next-build.local"], "/workspace", "GIT_CONFIG_FAILED");
      await mustExec(sandbox, "git", ["add", "-A"], "/workspace", "GIT_ADD_FAILED");
      await mustExec(sandbox, "git", ["commit", "-m", `feat(task): ${detail.task.title}`], "/workspace", "GIT_COMMIT_FAILED");
      const pushed = await mustExec(sandbox, "git", ["push", "-u", "origin", detail.task.branch], "/workspace", "GIT_PUSH_FAILED");
      const head = await mustExec(sandbox, "git", ["rev-parse", "HEAD"], "/workspace", "GIT_HEAD_FAILED");
      let delivery = await this.requireDelivery(await this.deps.taskStore.updateDelivery({
        expectedVersion: detail.delivery.version, headSha: head.stdout.trim(), status: "branch_pushed", taskId,
      }));
      run = await this.requireRun(await this.deps.taskStore.updateRun({
        checkpoint: "publishing_pr", expectedVersion: run.version, heartbeatAt: new Date(),
        leaseExpiresAt: new Date(Date.now() + 45_000), runId: run.id, stage: "publishing", workerId: this.workerId,
      }));
      const pullRequest = await this.deps.gateway.createDraftPullRequest({
        base: detail.task.defaultBranch,
        body: buildDeliverySummary(detail, agent.stdout, validation, pushed.stdout),
        head: detail.task.branch,
        repo: detail.task.canonicalRepo,
        title: detail.task.title,
      });
      if (!pullRequest.ok) throw pullRequest.error;
      delivery = await this.requireDelivery(await this.deps.taskStore.updateDelivery({
        expectedVersion: delivery.version,
        githubPrNodeId: pullRequest.value.nodeId,
        githubPrNumber: pullRequest.value.number,
        githubPrUrl: pullRequest.value.url,
        headSha: pullRequest.value.headSha,
        status: "draft_pr_open",
        taskId,
      }));
      detail = await this.requireTask(await this.deps.taskStore.updateTaskStatus({ expectedVersion: detail.task.version, status: "review", taskId }), detail);
      run = await this.requireRun(await this.deps.taskStore.updateRun({
        checkpoint: "draft_pr_open", completedAt: new Date(), expectedVersion: run.version, heartbeatAt: new Date(),
        leaseExpiresAt: null, runId: run.id, stage: "succeeded", workerId: this.workerId,
      }));
      this.deps.logger.info({ event: "task.execution_succeeded", pr_number: delivery.githubPrNumber, repo: detail.task.canonicalRepo, task_id: taskId }, "任务已交付为 Draft PR");
      const destroyed = await sandbox.destroy();
      if (!destroyed.ok) this.deps.logger.warn({ "error.code": destroyed.error.code, event: "sandbox.cleanup_failed", task_id: taskId }, "成功任务的沙箱清理失败");
    } catch (cause) {
      const failure = executionFailure(cause);
      const current = await this.deps.taskStore.getTask(taskId);
      if (current.ok && current.value?.task.status === "cancelled") {
        if (sandbox) await sandbox.destroy();
        this.deps.logger.info({ event: "task.execution_cancelled", task_id: taskId }, "任务执行已停止");
        return;
      }
      await this.markFailed(detail, run, failure);
      this.deps.logger.error({ err: failure.cause instanceof Error ? failure.cause : undefined, "error.code": failure.code, event: "task.execution_failed", task_id: taskId }, failure.message);
    } finally {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
    }
  }

  private async markFailed(detail: TaskDetail, run: TaskRun, failure: ExecutionFailure) {
    await this.deps.taskStore.updateRun({ checkpoint: "failed", completedAt: new Date(), errorCode: failure.code, errorMessage: failure.message, expectedVersion: run.version, leaseExpiresAt: null, runId: run.id, stage: "failed", workerId: this.workerId });
    await this.deps.taskStore.updateTaskStatus({ expectedVersion: detail.task.version, status: "failed", taskId: detail.task.id });
  }
  private async recoverPublishing(detail: TaskDetail, run: TaskRun) {
    const found = await this.deps.gateway.findPullRequestByHead(detail.task.canonicalRepo, detail.task.branch);
    if (!found.ok) {
      await this.markManualRepair(detail, run, found.error.code, "无法查询发布阶段的远端 PR，请人工修复");
      return;
    }
    let pull = found.value;
    if (!pull) {
      const created = await this.deps.gateway.createDraftPullRequest({
        base: detail.task.defaultBranch,
        body: `## Delivery Recovery\n\n发布进程在创建 PR 阶段中断。分支 \`${detail.task.branch}\` 已恢复为 Draft PR，请人工复核验证证据。`,
        head: detail.task.branch,
        repo: detail.task.canonicalRepo,
        title: detail.task.title,
      });
      if (!created.ok) {
        await this.markManualRepair(detail, run, created.error.code, "远端分支存在但无法恢复 Draft PR，请人工修复");
        return;
      }
      pull = created.value;
    }
    await this.deps.taskStore.applyPullRequestFact({
      draft: pull.draft,
      eventId: `publish-recovery:${pull.nodeId}:${pull.headSha}`,
      eventName: "publish_recovery",
      headBranch: detail.task.branch,
      headSha: pull.headSha,
      merged: pull.merged,
      mergedAt: pull.mergedAt,
      mergedSha: pull.mergedSha,
      nodeId: pull.nodeId,
      number: pull.number,
      repo: detail.task.canonicalRepo,
      state: pull.state,
      url: pull.url,
    });
    await this.deps.taskStore.updateRun({
      checkpoint: "draft_pr_open", completedAt: new Date(), expectedVersion: run.version,
      heartbeatAt: new Date(), leaseExpiresAt: null, runId: run.id, stage: "succeeded", workerId: this.workerId,
    });
    if (run.sandboxRef) {
      const sandbox = await this.deps.sandboxProvider.get(run.sandboxRef);
      if (sandbox.ok) await sandbox.value.destroy();
    }
    this.deps.logger.info({ event: "task.publish_recovered", pr_number: pull.number, task_id: detail.task.id }, "发布阶段已向前恢复");
  }
  private async markManualRepair(detail: TaskDetail, run: TaskRun, code: string, message: string) {
    await this.deps.taskStore.updateRun({ checkpoint: "manual_repair", completedAt: new Date(), errorCode: code, errorMessage: message, expectedVersion: run.version, leaseExpiresAt: null, runId: run.id, stage: "manual_repair", workerId: this.workerId });
    await this.deps.taskStore.updateTaskStatus({ expectedVersion: detail.task.version, status: "failed", taskId: detail.task.id });
    this.deps.logger.warn({ "error.code": code, event: "task.manual_repair_required", task_id: detail.task.id }, message);
  }
  private async requireRun(result: Awaited<ReturnType<TaskStore["updateRun"]>>): Promise<TaskRun> {
    if (!result.ok) throw result.error; if (!result.value) throw { code: "TASK_RUN_NOT_FOUND", message: "任务执行记录不存在" }; return result.value;
  }
  private async requireTask(result: Awaited<ReturnType<TaskStore["updateTaskStatus"]>>, detail: TaskDetail): Promise<TaskDetail> {
    if (!result.ok) throw result.error; if (!result.value) throw { code: "TASK_NOT_FOUND", message: "任务不存在" }; return { ...detail, task: result.value };
  }
  private async requireDelivery(result: Awaited<ReturnType<TaskStore["updateDelivery"]>>) {
    if (!result.ok) throw result.error; if (!result.value) throw { code: "DELIVERY_NOT_FOUND", message: "交付记录不存在" }; return result.value;
  }
}

async function mustExec(sandbox: Sandbox, command: string, args: string[], cwd: string, code: string) {
  const result = await sandbox.exec(command, args, { cwd });
  if (!result.ok) throw result.error;
  if (result.value.exitCode !== 0) throw { code, message: result.value.stderr.trim() || `${command} 执行失败` } satisfies ExecutionFailure;
  return result.value;
}
function executionFailure(cause: unknown): ExecutionFailure {
  if (typeof cause === "object" && cause !== null && "code" in cause && "message" in cause) {
    return { cause: "cause" in cause ? cause.cause : cause, code: String(cause.code), message: String(cause.message) };
  }
  return { cause, code: "TASK_EXECUTION_FAILED", message: "任务执行发生未知错误" };
}
function buildPrompt(detail: TaskDetail): string {
  return `在当前仓库完成以下研发任务。直接修改代码并运行必要检查，不要创建或推送分支，不要创建 PR。\n\n标题：${detail.task.title}\n需求：${detail.task.requirement}\n验收标准：\n${detail.task.acceptanceCriteria.map((item) => `- ${item}`).join("\n")}\n非目标：${detail.task.nonGoals ?? "无"}\n风险：${detail.task.riskNotes ?? "无"}\n预期验证：\n${detail.task.validationCommands.map((item) => `- ${item}`).join("\n")}`;
}
function buildDeliverySummary(detail: TaskDetail, agentOutput: string, validation: string[], pushOutput: string): string {
  let summary = agentOutput.trim();
  try { const parsed = JSON.parse(agentOutput) as { result?: string }; summary = parsed.result ?? summary; } catch {}
  return `## Delivery Summary\n\n${summary.slice(0, 6000)}\n\n## 验证\n\n${validation.join("\n")}\n\n## 交付证据\n\n- Base: \`${detail.task.baseSha}\`\n- Branch: \`${detail.task.branch}\`\n- Push: ${pushOutput.trim().slice(-500) || "completed"}\n\n> 由 Next Build 自动创建为 Draft PR；合并仍由人工完成。`;
}
