import { randomUUID } from "node:crypto";

import { err, ok, type Result } from "@next-build/result";
import { and, desc, eq, or, sql } from "drizzle-orm";

import type { DbError } from "./auth-store";
import type { Db } from "./client";
import type { Logger } from "./logger";
import { deliveries, outboxEvents, taskAcceptances, taskRuns, tasks, webhookInbox } from "./schema";
import type { ConcurrencyConflictError } from "./project-store";

export type TaskStatus = "draft" | "queued" | "running" | "review" | "acceptance_pending" | "accepted" | "rejected" | "closed" | "failed" | "cancelled";
export type TaskRunStage =
  | "queued"
  | "provisioning"
  | "running"
  | "publishing"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "manual_repair";
export type DeliveryStatus = "none" | "branch_pushed" | "draft_pr_open" | "ready_for_review" | "merged" | "closed_unmerged";

export interface Task {
  id: string;
  projectId: string;
  projectRepoId: string;
  title: string;
  requirement: string;
  acceptanceCriteria: string[];
  nonGoals: string | null;
  validationCommands: string[];
  riskNotes: string | null;
  createdBy: string;
  reviewerId: string | null;
  status: TaskStatus;
  idempotencyKey: string;
  commandFingerprint: string;
  providerRepoId: string | null;
  canonicalRepo: string;
  defaultBranch: string;
  baseSha: string;
  validationVersion: number;
  branch: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface TaskRun {
  id: string;
  taskId: string;
  attempt: number;
  stage: TaskRunStage;
  sandboxRef: string | null;
  agentSessionId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  heartbeatAt: Date | null;
  deadlineAt: Date | null;
  workerId: string | null;
  leaseExpiresAt: Date | null;
  checkpoint: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface Delivery {
  id: string;
  taskId: string;
  status: DeliveryStatus;
  branch: string;
  baseSha: string;
  headSha: string | null;
  githubPrNumber: number | null;
  githubPrNodeId: string | null;
  githubPrUrl: string | null;
  mergedSha: string | null;
  mergedAt: Date | null;
  closedReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface AcceptanceCriterionResult {
  criterion: string;
  passed: boolean;
  evidence?: string;
}
export interface AcceptanceEvidence { label: string; url: string }
export interface TaskAcceptance {
  id: string;
  taskId: string;
  status: "pending" | "accepted" | "rejected";
  criteriaResults: AcceptanceCriterionResult[];
  environment: string | null;
  evidence: AcceptanceEvidence[];
  notes: string | null;
  decidedBy: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface TaskDetail {
  task: Task;
  runs: TaskRun[];
  delivery: Delivery;
  acceptance: TaskAcceptance;
}

export interface TaskIdempotencyConflictError {
  code: "TASK_IDEMPOTENCY_CONFLICT";
  message: string;
}

export interface AcceptanceNotReadyError { code: "ACCEPTANCE_NOT_READY"; message: string }
export interface AcceptanceInvalidError { code: "ACCEPTANCE_INVALID"; message: string }
export interface TaskInvalidTransitionStoreError { code: "TASK_INVALID_TRANSITION"; message: string }

export type TaskStoreBusinessError = TaskIdempotencyConflictError | ConcurrencyConflictError | AcceptanceNotReadyError | AcceptanceInvalidError | TaskInvalidTransitionStoreError;

export interface TaskStore {
  listRecoverableTasks(): Promise<Result<TaskDetail[], DbError>>;
  listDeliveriesNeedingReconcile(): Promise<Result<TaskDetail[], DbError>>;
  listTasks(projectId: string): Promise<Result<TaskDetail[], DbError>>;
  getTask(id: string): Promise<Result<TaskDetail | null, DbError>>;
  createTask(input: {
    taskId: string;
    projectId: string;
    projectRepoId: string;
    title: string;
    requirement: string;
    acceptanceCriteria: string[];
    nonGoals?: string | null;
    validationCommands: string[];
    riskNotes?: string | null;
    createdBy: string;
    reviewerId?: string | null;
    idempotencyKey: string;
    commandFingerprint: string;
    providerRepoId?: string | null;
    canonicalRepo: string;
    defaultBranch: string;
    baseSha: string;
    validationVersion: number;
    branch: string;
  }): Promise<Result<{ detail: TaskDetail; created: boolean }, DbError | TaskIdempotencyConflictError>>;
  updateTaskStatus(input: {
    taskId: string;
    expectedVersion: number;
    status: TaskStatus;
  }): Promise<Result<Task | null, DbError | ConcurrencyConflictError>>;
  createRun(input: { taskId: string; deadlineAt?: Date | null }): Promise<Result<TaskRun, DbError>>;
  retryTask(input: { taskId: string; expectedTaskVersion: number; deadlineAt?: Date | null }): Promise<Result<TaskDetail | null, DbError | TaskStoreBusinessError>>;
  updateRun(input: {
    runId: string;
    expectedVersion: number;
    stage: TaskRunStage;
    sandboxRef?: string | null;
    agentSessionId?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    heartbeatAt?: Date | null;
    startedAt?: Date | null;
    completedAt?: Date | null;
    workerId?: string | null;
    leaseExpiresAt?: Date | null;
    checkpoint?: string | null;
  }): Promise<Result<TaskRun | null, DbError | ConcurrencyConflictError>>;
  claimRun(input: { taskId: string; runId: string; workerId: string; leaseExpiresAt: Date; deadlineAt: Date }): Promise<Result<TaskDetail | null, DbError | TaskStoreBusinessError>>;
  heartbeatRun(input: { runId: string; workerId: string; leaseExpiresAt: Date }): Promise<Result<void, DbError>>;
  cancelTask(input: { taskId: string; expectedTaskVersion: number }): Promise<Result<TaskDetail | null, DbError | TaskStoreBusinessError>>;
  updateDelivery(input: {
    taskId: string;
    expectedVersion: number;
    status: DeliveryStatus;
    headSha?: string | null;
    githubPrNumber?: number | null;
    githubPrNodeId?: string | null;
    githubPrUrl?: string | null;
    mergedSha?: string | null;
    mergedAt?: Date | null;
    closedReason?: string | null;
  }): Promise<Result<Delivery | null, DbError | ConcurrencyConflictError>>;
  decideAcceptance(input: {
    taskId: string;
    actorId: string;
    decision: "accepted" | "rejected";
    criteriaResults: AcceptanceCriterionResult[];
    environment: string;
    evidence: AcceptanceEvidence[];
    notes?: string | null;
    expectedTaskVersion: number;
    expectedAcceptanceVersion: number;
  }): Promise<Result<TaskDetail | null, DbError | TaskStoreBusinessError>>;
  applyPullRequestFact(input: {
    eventId: string;
    eventName: string;
    repo: string;
    headBranch: string;
    number: number;
    nodeId: string;
    url: string;
    headSha: string;
    draft: boolean;
    state: "open" | "closed";
    merged: boolean;
    mergedAt: Date | null;
    mergedSha: string | null;
  }): Promise<Result<{ detail: TaskDetail | null; duplicate: boolean }, DbError>>;
}

type TaskRow = typeof tasks.$inferSelect;

function toTask(row: TaskRow): Task {
  return {
    ...row,
    acceptanceCriteria: JSON.parse(row.acceptanceCriteria) as string[],
    validationCommands: JSON.parse(row.validationCommands) as string[],
  };
}

type AcceptanceRow = typeof taskAcceptances.$inferSelect;
function toAcceptance(row: AcceptanceRow): TaskAcceptance {
  return {
    ...row,
    criteriaResults: JSON.parse(row.criteriaResults) as AcceptanceCriterionResult[],
    evidence: JSON.parse(row.evidence) as AcceptanceEvidence[],
  };
}

export function createTaskStore(db: Db, options?: { logger?: Logger }): TaskStore {
  const logFailure = (op: string, error: DbError) => {
    options?.logger?.error(
      { err: error.cause instanceof Error ? error.cause : undefined, "error.code": error.code, event: "db.error", op },
      error.message,
    );
  };

  const detailFor = (taskRow: TaskRow, runRows?: TaskRun[]): TaskDetail => {
    const delivery = db.select().from(deliveries).where(eq(deliveries.taskId, taskRow.id)).limit(1).all()[0];
    if (!delivery) throw new Error(`delivery missing for task ${taskRow.id}`);
    const acceptance = db.select().from(taskAcceptances).where(eq(taskAcceptances.taskId, taskRow.id)).limit(1).all()[0];
    if (!acceptance) throw new Error(`acceptance missing for task ${taskRow.id}`);
    const runs = runRows ?? db.select().from(taskRuns).where(eq(taskRuns.taskId, taskRow.id)).orderBy(taskRuns.attempt).all();
    return { acceptance: toAcceptance(acceptance), delivery, runs, task: toTask(taskRow) };
  };

  return {
    async listRecoverableTasks() {
      try {
        const taskRows = db.select().from(tasks).where(sql`${tasks.status} in ('queued', 'running')`).orderBy(tasks.createdAt).all();
        return ok(taskRows.map((task) => detailFor(task)));
      } catch (cause) {
        const error: DbError = { cause, code: "DB_READ_FAILED", message: "查询待恢复任务失败" };
        logFailure("listRecoverableTasks", error);
        return err(error);
      }
    },
    async listDeliveriesNeedingReconcile() {
      try {
        const taskRows = db.select().from(tasks).where(eq(tasks.status, "review")).orderBy(tasks.updatedAt).all();
        return ok(taskRows.map((task) => detailFor(task)).filter((detail) => detail.delivery.githubPrNumber !== null));
      } catch (cause) {
        const error: DbError = { cause, code: "DB_READ_FAILED", message: "查询待同步交付失败" };
        logFailure("listDeliveriesNeedingReconcile", error); return err(error);
      }
    },
    async listTasks(projectId) {
      try {
        const taskRows = db.select().from(tasks).where(eq(tasks.projectId, projectId)).orderBy(desc(tasks.createdAt)).all();
        return ok(taskRows.map((task) => detailFor(task)));
      } catch (cause) {
        const error: DbError = { cause, code: "DB_READ_FAILED", message: "查询任务列表失败" };
        logFailure("listTasks", error);
        return err(error);
      }
    },

    async getTask(id) {
      try {
        const task = db.select().from(tasks).where(eq(tasks.id, id)).limit(1).all()[0];
        return ok(task ? detailFor(task) : null);
      } catch (cause) {
        const error: DbError = { cause, code: "DB_READ_FAILED", message: "查询任务失败" };
        logFailure("getTask", error);
        return err(error);
      }
    },

    async createTask(input) {
      try {
        const existing = db
          .select()
          .from(tasks)
          .where(and(eq(tasks.createdBy, input.createdBy), eq(tasks.idempotencyKey, input.idempotencyKey)))
          .limit(1)
          .all()[0];
        if (existing) {
          if (existing.commandFingerprint !== input.commandFingerprint) {
            return err({ code: "TASK_IDEMPOTENCY_CONFLICT", message: "相同幂等键已用于不同任务请求" });
          }
          return ok({ created: false, detail: detailFor(existing) });
        }

        const now = new Date();
        const task: Task = {
          acceptanceCriteria: input.acceptanceCriteria,
          baseSha: input.baseSha,
          branch: input.branch,
          canonicalRepo: input.canonicalRepo,
          commandFingerprint: input.commandFingerprint,
          createdAt: now,
          createdBy: input.createdBy,
          defaultBranch: input.defaultBranch,
          id: input.taskId,
          idempotencyKey: input.idempotencyKey,
          nonGoals: input.nonGoals ?? null,
          projectId: input.projectId,
          projectRepoId: input.projectRepoId,
          providerRepoId: input.providerRepoId ?? null,
          requirement: input.requirement,
          reviewerId: input.reviewerId ?? null,
          riskNotes: input.riskNotes ?? null,
          status: "queued",
          title: input.title,
          updatedAt: now,
          validationCommands: input.validationCommands,
          validationVersion: input.validationVersion,
          version: 1,
        };
        const run: TaskRun = {
          agentSessionId: null,
          attempt: 1,
          completedAt: null,
          createdAt: now,
          deadlineAt: null,
          errorCode: null,
          errorMessage: null,
          heartbeatAt: null,
          workerId: null,
          leaseExpiresAt: null,
          checkpoint: null,
          id: randomUUID(),
          sandboxRef: null,
          stage: "queued",
          startedAt: null,
          taskId: task.id,
          updatedAt: now,
          version: 1,
        };
        const delivery: Delivery = {
          baseSha: input.baseSha,
          branch: input.branch,
          closedReason: null,
          createdAt: now,
          githubPrNodeId: null,
          githubPrNumber: null,
          githubPrUrl: null,
          headSha: null,
          id: randomUUID(),
          mergedAt: null,
          mergedSha: null,
          status: "none",
          taskId: task.id,
          updatedAt: now,
          version: 1,
        };
        const acceptance: TaskAcceptance = {
          createdAt: now,
          criteriaResults: [],
          decidedAt: null,
          decidedBy: null,
          environment: null,
          evidence: [],
          id: randomUUID(),
          notes: null,
          status: "pending",
          taskId: task.id,
          updatedAt: now,
          version: 1,
        };
        db.transaction((tx) => {
          tx.insert(tasks).values({
            ...task,
            acceptanceCriteria: JSON.stringify(task.acceptanceCriteria),
            validationCommands: JSON.stringify(task.validationCommands),
          }).run();
          tx.insert(taskRuns).values(run).run();
          tx.insert(deliveries).values(delivery).run();
          tx.insert(taskAcceptances).values({
            ...acceptance,
            criteriaResults: JSON.stringify(acceptance.criteriaResults),
            evidence: JSON.stringify(acceptance.evidence),
          }).run();
        });
        return ok({ created: true, detail: { acceptance, delivery, runs: [run], task } });
      } catch (cause) {
        const error: DbError = { cause, code: "DB_WRITE_FAILED", message: "创建任务失败" };
        logFailure("createTask", error);
        return err(error);
      }
    },

    async updateTaskStatus(input) {
      try {
        const rows = db.update(tasks)
          .set({ status: input.status, updatedAt: new Date(), version: sql`${tasks.version} + 1` })
          .where(and(eq(tasks.id, input.taskId), eq(tasks.version, input.expectedVersion)))
          .returning()
          .all();
        if (rows[0]) return ok(toTask(rows[0]));
        const exists = db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, input.taskId)).limit(1).all();
        if (exists.length === 0) return ok(null);
        return err({ code: "CONCURRENCY_CONFLICT", message: "任务已被其他操作更新，请刷新后重试" });
      } catch (cause) {
        const error: DbError = { cause, code: "DB_WRITE_FAILED", message: "更新任务状态失败" };
        logFailure("updateTaskStatus", error);
        return err(error);
      }
    },

    async createRun(input) {
      try {
        const now = new Date();
        const attempt = (db.select({ value: sql<number>`coalesce(max(${taskRuns.attempt}), 0)` }).from(taskRuns).where(eq(taskRuns.taskId, input.taskId)).all()[0]?.value ?? 0) + 1;
        const run: TaskRun = {
          agentSessionId: null,
          attempt,
          completedAt: null,
          createdAt: now,
          deadlineAt: input.deadlineAt ?? null,
          errorCode: null,
          errorMessage: null,
          heartbeatAt: null,
          checkpoint: null,
          id: randomUUID(),
          leaseExpiresAt: null,
          sandboxRef: null,
          stage: "queued",
          startedAt: null,
          taskId: input.taskId,
          updatedAt: now,
          version: 1,
          workerId: null,
        };
        db.insert(taskRuns).values(run).run();
        return ok(run);
      } catch (cause) {
        const error: DbError = { cause, code: "DB_WRITE_FAILED", message: "创建任务执行失败" };
        logFailure("createRun", error);
        return err(error);
      }
    },
    async retryTask(input) {
      try {
        const taskId = db.transaction((tx) => {
          const task = tx.select().from(tasks).where(eq(tasks.id, input.taskId)).limit(1).all()[0];
          if (!task) return null;
          if (task.version !== input.expectedTaskVersion) throw { code: "CONCURRENCY_CONFLICT", message: "任务已更新，请刷新后重试" } satisfies ConcurrencyConflictError;
          if (task.status !== "failed") throw { code: "TASK_INVALID_TRANSITION", message: "只有执行失败的任务可以原地重试" } satisfies TaskInvalidTransitionStoreError;
          const now = new Date();
          const attempt = (tx.select({ value: sql<number>`coalesce(max(${taskRuns.attempt}), 0)` }).from(taskRuns).where(eq(taskRuns.taskId, input.taskId)).all()[0]?.value ?? 0) + 1;
          tx.update(tasks).set({ status: "queued", updatedAt: now, version: sql`${tasks.version} + 1` })
            .where(and(eq(tasks.id, input.taskId), eq(tasks.version, input.expectedTaskVersion))).run();
          tx.insert(taskRuns).values({
            agentSessionId: null, attempt, checkpoint: null, completedAt: null, createdAt: now,
            deadlineAt: input.deadlineAt ?? null, errorCode: null, errorMessage: null, heartbeatAt: null,
            id: randomUUID(), leaseExpiresAt: null, sandboxRef: null, stage: "queued", startedAt: null,
            taskId: input.taskId, updatedAt: now, version: 1, workerId: null,
          }).run();
          return task.id;
        });
        if (!taskId) return ok(null);
        const task = db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1).all()[0];
        return ok(task ? detailFor(task) : null);
      } catch (cause) {
        if (typeof cause === "object" && cause !== null && "code" in cause && ["CONCURRENCY_CONFLICT", "TASK_INVALID_TRANSITION"].includes(String(cause.code))) return err(cause as TaskStoreBusinessError);
        const error: DbError = { cause, code: "DB_WRITE_FAILED", message: "重试任务失败" };
        logFailure("retryTask", error); return err(error);
      }
    },

    async updateRun(input) {
      try {
        const rows = db.update(taskRuns)
          .set({
            agentSessionId: input.agentSessionId,
            completedAt: input.completedAt,
            errorCode: input.errorCode,
            errorMessage: input.errorMessage,
            heartbeatAt: input.heartbeatAt,
            workerId: input.workerId,
            leaseExpiresAt: input.leaseExpiresAt,
            checkpoint: input.checkpoint,
            sandboxRef: input.sandboxRef,
            stage: input.stage,
            startedAt: input.startedAt,
            updatedAt: new Date(),
            version: sql`${taskRuns.version} + 1`,
          })
          .where(and(eq(taskRuns.id, input.runId), eq(taskRuns.version, input.expectedVersion)))
          .returning()
          .all();
        if (rows[0]) return ok(rows[0]);
        const exists = db.select({ id: taskRuns.id }).from(taskRuns).where(eq(taskRuns.id, input.runId)).limit(1).all();
        if (exists.length === 0) return ok(null);
        return err({ code: "CONCURRENCY_CONFLICT", message: "任务执行已被其他操作更新，请刷新后重试" });
      } catch (cause) {
        const error: DbError = { cause, code: "DB_WRITE_FAILED", message: "更新任务执行失败" };
        logFailure("updateRun", error);
        return err(error);
      }
    },

    async claimRun(input) {
      try {
        const taskId = db.transaction((tx) => {
          const run = tx.select().from(taskRuns).where(and(eq(taskRuns.id, input.runId), eq(taskRuns.taskId, input.taskId))).limit(1).all()[0];
          const task = tx.select().from(tasks).where(eq(tasks.id, input.taskId)).limit(1).all()[0];
          if (!run || !task) return null;
          const now = new Date();
          if (!["queued", "provisioning", "running"].includes(run.stage)) {
            throw { code: "TASK_INVALID_TRANSITION", message: "当前执行阶段不能被 worker 接管" } satisfies TaskInvalidTransitionStoreError;
          }
          if (run.leaseExpiresAt && run.leaseExpiresAt > now && run.workerId !== input.workerId) {
            throw { code: "CONCURRENCY_CONFLICT", message: "任务正在由其他 worker 执行" } satisfies ConcurrencyConflictError;
          }
          const claimed = tx.update(taskRuns).set({
            checkpoint: "provisioning", deadlineAt: run.deadlineAt ?? input.deadlineAt,
            heartbeatAt: now, leaseExpiresAt: input.leaseExpiresAt, stage: "provisioning",
            startedAt: run.startedAt ?? now, updatedAt: now, workerId: input.workerId,
            version: sql`${taskRuns.version} + 1`,
          }).where(and(eq(taskRuns.id, input.runId), eq(taskRuns.version, run.version))).run();
          if (claimed.changes === 0) throw { code: "CONCURRENCY_CONFLICT", message: "任务执行接管冲突" } satisfies ConcurrencyConflictError;
          tx.update(tasks).set({ status: "running", updatedAt: now, version: sql`${tasks.version} + 1` })
            .where(and(eq(tasks.id, input.taskId), eq(tasks.version, task.version))).run();
          return task.id;
        });
        if (!taskId) return ok(null);
        const task = db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1).all()[0];
        return ok(task ? detailFor(task) : null);
      } catch (cause) {
        if (typeof cause === "object" && cause !== null && "code" in cause && ["CONCURRENCY_CONFLICT", "TASK_INVALID_TRANSITION"].includes(String(cause.code))) return err(cause as TaskStoreBusinessError);
        const error: DbError = { cause, code: "DB_WRITE_FAILED", message: "接管任务执行失败" };
        logFailure("claimRun", error); return err(error);
      }
    },
    async heartbeatRun(input) {
      try {
        db.update(taskRuns).set({ heartbeatAt: new Date(), leaseExpiresAt: input.leaseExpiresAt, updatedAt: new Date() })
          .where(and(eq(taskRuns.id, input.runId), eq(taskRuns.workerId, input.workerId))).run();
        return ok(undefined);
      } catch (cause) {
        const error: DbError = { cause, code: "DB_WRITE_FAILED", message: "刷新任务执行心跳失败" };
        logFailure("heartbeatRun", error); return err(error);
      }
    },
    async cancelTask(input) {
      try {
        const taskId = db.transaction((tx) => {
          const task = tx.select().from(tasks).where(eq(tasks.id, input.taskId)).limit(1).all()[0];
          if (!task) return null;
          if (task.version !== input.expectedTaskVersion) throw { code: "CONCURRENCY_CONFLICT", message: "任务已更新，请刷新后重试" } satisfies ConcurrencyConflictError;
          if (!["queued", "running"].includes(task.status)) throw { code: "TASK_INVALID_TRANSITION", message: "当前任务状态不能取消" } satisfies TaskInvalidTransitionStoreError;
          const now = new Date();
          tx.update(tasks).set({ status: "cancelled", updatedAt: now, version: sql`${tasks.version} + 1` }).where(eq(tasks.id, input.taskId)).run();
          const run = tx.select().from(taskRuns).where(eq(taskRuns.taskId, input.taskId)).orderBy(desc(taskRuns.attempt)).limit(1).all()[0];
          if (run && ["queued", "provisioning", "running"].includes(run.stage)) {
            tx.update(taskRuns).set({ checkpoint: "cancelled", completedAt: now, leaseExpiresAt: null, stage: "cancelled", updatedAt: now, version: sql`${taskRuns.version} + 1` })
              .where(eq(taskRuns.id, run.id)).run();
          }
          return task.id;
        });
        if (!taskId) return ok(null);
        const task = db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1).all()[0];
        return ok(task ? detailFor(task) : null);
      } catch (cause) {
        if (typeof cause === "object" && cause !== null && "code" in cause && ["CONCURRENCY_CONFLICT", "TASK_INVALID_TRANSITION"].includes(String(cause.code))) return err(cause as TaskStoreBusinessError);
        const error: DbError = { cause, code: "DB_WRITE_FAILED", message: "取消任务失败" };
        logFailure("cancelTask", error); return err(error);
      }
    },

    async updateDelivery(input) {
      try {
        const rows = db.update(deliveries)
          .set({
            closedReason: input.closedReason,
            githubPrNodeId: input.githubPrNodeId,
            githubPrNumber: input.githubPrNumber,
            githubPrUrl: input.githubPrUrl,
            headSha: input.headSha,
            mergedAt: input.mergedAt,
            mergedSha: input.mergedSha,
            status: input.status,
            updatedAt: new Date(),
            version: sql`${deliveries.version} + 1`,
          })
          .where(and(eq(deliveries.taskId, input.taskId), eq(deliveries.version, input.expectedVersion)))
          .returning()
          .all();
        if (rows[0]) return ok(rows[0]);
        const exists = db.select({ id: deliveries.id }).from(deliveries).where(eq(deliveries.taskId, input.taskId)).limit(1).all();
        if (exists.length === 0) return ok(null);
        return err({ code: "CONCURRENCY_CONFLICT", message: "交付状态已被其他操作更新，请刷新后重试" });
      } catch (cause) {
        const error: DbError = { cause, code: "DB_WRITE_FAILED", message: "更新交付状态失败" };
        logFailure("updateDelivery", error);
        return err(error);
      }
    },

    async decideAcceptance(input) {
      try {
        const detail = db.transaction((tx) => {
          const task = tx.select().from(tasks).where(eq(tasks.id, input.taskId)).limit(1).all()[0];
          if (!task) return null;
          const delivery = tx.select().from(deliveries).where(eq(deliveries.taskId, input.taskId)).limit(1).all()[0];
          const acceptance = tx.select().from(taskAcceptances).where(eq(taskAcceptances.taskId, input.taskId)).limit(1).all()[0];
          if (!delivery || !acceptance) throw new Error(`task detail incomplete: ${input.taskId}`);
          if (task.version !== input.expectedTaskVersion || acceptance.version !== input.expectedAcceptanceVersion) {
            throw { code: "CONCURRENCY_CONFLICT", message: "任务或验收记录已更新，请刷新后重试" } satisfies ConcurrencyConflictError;
          }
          if (delivery.status !== "merged" || !["acceptance_pending", "rejected"].includes(task.status)) {
            throw { code: "ACCEPTANCE_NOT_READY", message: "交付尚未合并，不能进行业务验收" } satisfies AcceptanceNotReadyError;
          }
          const expectedCriteria = JSON.parse(task.acceptanceCriteria) as string[];
          if (input.criteriaResults.length !== expectedCriteria.length ||
              expectedCriteria.some((criterion) => !input.criteriaResults.some((result) => result.criterion === criterion))) {
            throw { code: "ACCEPTANCE_INVALID", message: "必须逐条确认全部验收标准" } satisfies AcceptanceInvalidError;
          }
          if (input.decision === "accepted" && input.criteriaResults.some((result) => !result.passed)) {
            throw { code: "ACCEPTANCE_INVALID", message: "存在未通过标准时不能验收通过" } satisfies AcceptanceInvalidError;
          }
          const now = new Date();
          const nextAcceptance = tx.update(taskAcceptances).set({
            criteriaResults: JSON.stringify(input.criteriaResults),
            decidedAt: now,
            decidedBy: input.actorId,
            environment: input.environment,
            evidence: JSON.stringify(input.evidence),
            notes: input.notes ?? null,
            status: input.decision,
            updatedAt: now,
            version: sql`${taskAcceptances.version} + 1`,
          }).where(and(eq(taskAcceptances.taskId, input.taskId), eq(taskAcceptances.version, input.expectedAcceptanceVersion))).returning().all()[0];
          const nextTask = tx.update(tasks).set({
            status: input.decision === "accepted" ? "accepted" : "rejected",
            updatedAt: now,
            version: sql`${tasks.version} + 1`,
          }).where(and(eq(tasks.id, input.taskId), eq(tasks.version, input.expectedTaskVersion))).returning().all()[0];
          if (!nextAcceptance || !nextTask) throw { code: "CONCURRENCY_CONFLICT", message: "验收提交冲突，请刷新后重试" } satisfies ConcurrencyConflictError;
          const runs = tx.select().from(taskRuns).where(eq(taskRuns.taskId, input.taskId)).orderBy(taskRuns.attempt).all();
          return { acceptance: toAcceptance(nextAcceptance), delivery, runs, task: toTask(nextTask) };
        });
        return ok(detail);
      } catch (cause) {
        if (typeof cause === "object" && cause !== null && "code" in cause &&
            ["CONCURRENCY_CONFLICT", "ACCEPTANCE_NOT_READY", "ACCEPTANCE_INVALID"].includes(String(cause.code))) {
          return err(cause as TaskStoreBusinessError);
        }
        const error: DbError = { cause, code: "DB_WRITE_FAILED", message: "提交业务验收失败" };
        logFailure("decideAcceptance", error);
        return err(error);
      }
    },

    async applyPullRequestFact(input) {
      try {
        const outcome = db.transaction((tx) => {
          const inserted = tx.insert(webhookInbox).values({ id: input.eventId, eventName: input.eventName, receivedAt: new Date() })
            .onConflictDoNothing().run();
          if (inserted.changes === 0) return { duplicate: true, taskId: null as string | null };
          const row = tx.select({ taskId: tasks.id })
            .from(tasks)
            .innerJoin(deliveries, eq(deliveries.taskId, tasks.id))
            .where(or(
              and(eq(tasks.canonicalRepo, input.repo), eq(deliveries.githubPrNumber, input.number)),
              and(eq(tasks.canonicalRepo, input.repo), eq(tasks.branch, input.headBranch)),
            )).limit(1).all()[0];
          if (!row) return { duplicate: false, taskId: null as string | null };
          const task = tx.select().from(tasks).where(eq(tasks.id, row.taskId)).limit(1).all()[0];
          const delivery = tx.select().from(deliveries).where(eq(deliveries.taskId, row.taskId)).limit(1).all()[0];
          if (!task || !delivery) throw new Error(`task delivery missing: ${row.taskId}`);
          const nextDeliveryStatus: DeliveryStatus = delivery.status === "merged" || input.merged
            ? "merged"
            : input.state === "closed"
              ? "closed_unmerged"
              : input.draft ? "draft_pr_open" : "ready_for_review";
          tx.update(deliveries).set({
            closedReason: input.state === "closed" && !input.merged ? "closed_on_github" : null,
            githubPrNodeId: input.nodeId,
            githubPrNumber: input.number,
            githubPrUrl: input.url,
            headSha: input.headSha,
            mergedAt: input.mergedAt,
            mergedSha: input.mergedSha,
            status: nextDeliveryStatus,
            updatedAt: new Date(),
            version: sql`${deliveries.version} + 1`,
          }).where(eq(deliveries.taskId, row.taskId)).run();
          const terminal = ["accepted", "rejected", "closed", "cancelled"].includes(task.status);
          const nextTaskStatus: TaskStatus = terminal
            ? task.status
            : input.merged
              ? "acceptance_pending"
              : input.state === "closed" ? "closed" : "review";
          tx.update(tasks).set({ status: nextTaskStatus, updatedAt: new Date(), version: sql`${tasks.version} + 1` })
            .where(eq(tasks.id, row.taskId)).run();
          if (input.merged && input.mergedSha) {
            const eventId = `delivery-merged:${delivery.id}:${input.mergedSha}`;
            tx.insert(outboxEvents).values({
              aggregateId: delivery.id,
              attempts: 0,
              createdAt: new Date(),
              id: eventId,
              lastError: null,
              payload: JSON.stringify({
                deliveryId: delivery.id,
                mergeSha: input.mergedSha,
                mergedAt: input.mergedAt?.toISOString() ?? null,
                prNumber: input.number,
                projectId: task.projectId,
                projectRepoId: task.projectRepoId,
                taskId: task.id,
              }),
              processedAt: null,
              type: "DeliveryMerged.v1",
            }).onConflictDoNothing().run();
          }
          return { duplicate: false, taskId: row.taskId };
        });
        if (!outcome.taskId) return ok({ detail: null, duplicate: outcome.duplicate });
        const task = db.select().from(tasks).where(eq(tasks.id, outcome.taskId)).limit(1).all()[0];
        return ok({ detail: task ? detailFor(task) : null, duplicate: outcome.duplicate });
      } catch (cause) {
        const error: DbError = { cause, code: "DB_WRITE_FAILED", message: "应用 GitHub Pull Request 事实失败" };
        logFailure("applyPullRequestFact", error);
        return err(error);
      }
    },
  };
}
