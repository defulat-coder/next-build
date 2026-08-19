import { randomUUID } from "node:crypto";

import { err, ok, type Result } from "@next-build/result";
import { and, eq, isNull, sql } from "drizzle-orm";

import type { Db } from "./client";
import type { Logger } from "./logger";
import { projectRepos, projects } from "./schema";
import type { DbError } from "./auth-store";

export interface Project {
  id: string;
  name: string;
  description: string | null;
  problemStatement: string | null;
  desiredOutcome: string | null;
  successCriteria: string[];
  nonGoals: string | null;
  targetDate: Date | null;
  lifecycleStatus: ProjectLifecycleStatus;
  archivedAt: Date | null;
  completionSummary: string | null;
  completionCriteriaResults: Array<{ criterion: string; passed: boolean; evidence?: string }>;
  completedAt: Date | null;
  completedBy: string | null;
  version: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectRepo {
  id: string;
  projectId: string;
  /** owner/repo */
  repo: string;
  defaultBranch: string | null;
  isPrimary: boolean;
  accessStatus: RepoAccessStatus;
  lastValidatedAt: Date;
  providerRepoId: string | null;
  canPush: boolean | null;
  canCreatePr: boolean | null;
  lastExecutionValidatedAt: Date | null;
  detachedAt: Date | null;
  version: number;
  addedAt: Date;
}

export type RepoAccessStatus = "available" | "unavailable";
export type ProjectLifecycleStatus = "planned" | "active" | "blocked" | "completed" | "archived";

export interface ProjectDetail {
  project: Project;
  repos: ProjectRepo[];
  primaryRepo: ProjectRepo | null;
}

/** 持久化读模型：项目 + 仓库数 + 主仓记录；业务就绪状态由 project 上下文派生。 */
export interface ProjectSummary extends Project {
  repoCount: number;
  primaryRepo: ProjectRepo | null;
}

/** 重复添加同一仓库：数据完整性约束映射出的稳定业务错误码（唯一索引 (projectId, repo)）。 */
export interface ProjectRepoExistsError {
  code: "PROJECT_REPO_EXISTS";
  message: string;
  cause?: unknown;
}

export interface ConcurrencyConflictError {
  code: "CONCURRENCY_CONFLICT";
  message: string;
  cause?: unknown;
}

export interface ProjectRepoNotFoundError {
  code: "PROJECT_REPO_NOT_FOUND";
  message: string;
}

export interface ProjectRepoUnavailableError {
  code: "PROJECT_REPO_UNAVAILABLE";
  message: string;
}

export interface PrimaryRepoReplacementRequiredError {
  code: "PRIMARY_REPO_REPLACEMENT_REQUIRED";
  message: string;
}

export type ProjectStoreBusinessError =
  | ProjectRepoExistsError
  | ConcurrencyConflictError
  | ProjectRepoNotFoundError
  | ProjectRepoUnavailableError
  | PrimaryRepoReplacementRequiredError;

export interface ProjectStore {
  /** 全部项目（含各项目仓库数），按创建时间倒序。 */
  listProjects(): Promise<Result<ProjectSummary[], DbError>>;
  /** 项目详情（含仓库列表）；不存在返回 null。 */
  getProject(id: string): Promise<Result<ProjectDetail | null, DbError>>;
  createProject(input: {
    name: string;
    description?: string;
    problemStatement?: string;
    desiredOutcome?: string;
    successCriteria?: string[];
    nonGoals?: string;
    targetDate?: Date;
    createdBy: string;
  }): Promise<Result<Project, DbError>>;
  /** 更新名称/描述；不存在返回 null。 */
  updateProject(
    id: string,
    input: {
      name: string;
      description?: string | null;
      problemStatement?: string | null;
      desiredOutcome?: string | null;
      successCriteria?: string[];
      nonGoals?: string | null;
      targetDate?: Date | null;
      lifecycleStatus?: Exclude<ProjectLifecycleStatus, "archived">;
      completionSummary?: string | null;
      completionCriteriaResults?: Array<{ criterion: string; passed: boolean; evidence?: string }>;
      completedAt?: Date | null;
      completedBy?: string | null;
      expectedVersion: number;
    },
  ): Promise<Result<Project | null, DbError | ConcurrencyConflictError>>;
  archiveProject(id: string, expectedVersion: number): Promise<Result<Project | null, DbError | ConcurrencyConflictError>>;
  /** 删除项目；仓库经外键级联删除。 */
  deleteProject(id: string): Promise<Result<void, DbError>>;
  /** 挂载仓库；同项目重复添加返回业务错误 PROJECT_REPO_EXISTS。 */
  addRepo(input: {
    projectId: string;
    repo: string;
    defaultBranch: string | null;
    accessStatus: RepoAccessStatus;
    providerRepoId?: string | null;
    canPush?: boolean | null;
    canCreatePr?: boolean | null;
    lastExecutionValidatedAt?: Date | null;
  }): Promise<Result<ProjectRepo, DbError | ProjectRepoExistsError>>;
  /** 主仓切换在单一事务内完成。 */
  setPrimaryRepo(
    projectId: string,
    repoId: string,
    expectedVersion: number,
  ): Promise<Result<void, DbError | ProjectStoreBusinessError>>;
  /** 更新一次确定性校验结果；规范仓库名冲突仍按重复仓库返回。 */
  updateRepoValidation(
    repoId: string,
    input: {
      repo: string;
      defaultBranch: string | null;
      accessStatus: RepoAccessStatus;
      lastValidatedAt: Date;
      providerRepoId?: string | null;
      canPush?: boolean | null;
      canCreatePr?: boolean | null;
      lastExecutionValidatedAt?: Date | null;
      expectedVersion: number;
    },
  ): Promise<Result<ProjectRepo | null, DbError | ProjectStoreBusinessError>>;
  /** 删除主仓时可显式传替代主仓；切换与删除在同一事务内完成。 */
  removeRepo(input: {
    projectId: string;
    repoId: string;
    expectedVersion: number;
    replacementPrimaryRepoId?: string;
    replacementExpectedVersion?: number;
  }): Promise<Result<void, DbError | ProjectStoreBusinessError>>;
}

type ProjectRow = typeof projects.$inferSelect;

function toProject(row: ProjectRow): Project {
  return {
    ...row,
    completionCriteriaResults: JSON.parse(row.completionCriteriaResults) as Array<{ criterion: string; passed: boolean; evidence?: string }>,
    successCriteria: JSON.parse(row.successCriteria) as string[],
  };
}

function isUniqueViolation(cause: unknown): boolean {
  return (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    (cause as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE"
  );
}

function isProjectStoreBusinessError(cause: unknown): cause is ProjectStoreBusinessError {
  if (typeof cause !== "object" || cause === null || !("code" in cause)) return false;
  return [
    "PROJECT_REPO_EXISTS",
    "CONCURRENCY_CONFLICT",
    "PROJECT_REPO_NOT_FOUND",
    "PROJECT_REPO_UNAVAILABLE",
    "PRIMARY_REPO_REPLACEMENT_REQUIRED",
  ].includes(String((cause as { code: unknown }).code));
}

export function createProjectStore(db: Db, options?: { logger?: Logger }): ProjectStore {
  /** DB 失败是系统异常：产生层记 error（err 带完整堆栈），Result 照常返回给边界翻译。 */
  const logFailure = (op: string, error: DbError) => {
    options?.logger?.error(
      { err: error.cause instanceof Error ? error.cause : undefined, "error.code": error.code, event: "db.error", op },
      error.message,
    );
  };
  return {
    async listProjects() {
      try {
        const projectRows = db.select().from(projects).orderBy(sql`${projects.createdAt} desc`).all();
        const repoRows = db
          .select()
          .from(projectRepos)
          .where(isNull(projectRepos.detachedAt))
          .orderBy(sql`${projectRepos.addedAt} asc`, sql`${projectRepos.id} asc`)
          .all();
        const reposByProject = new Map<string, ProjectRepo[]>();
        for (const repo of repoRows) {
          const list = reposByProject.get(repo.projectId) ?? [];
          list.push(repo);
          reposByProject.set(repo.projectId, list);
        }
        return ok(
          projectRows.map((project) => {
            const repos = reposByProject.get(project.id) ?? [];
            return {
              ...toProject(project),
              primaryRepo: repos.find((repo) => repo.isPrimary) ?? null,
              repoCount: repos.length,
            };
          }),
        );
      } catch (cause) {
        const error: DbError = { cause, code: "DB_READ_FAILED", message: "查询项目列表失败" };
        logFailure("listProjects", error);
        return err(error);
      }
    },

    async getProject(id) {
      try {
        const found = db.select().from(projects).where(eq(projects.id, id)).limit(1).all();
        if (found.length === 0) return ok(null);
        const repos = db
          .select()
          .from(projectRepos)
          .where(and(eq(projectRepos.projectId, id), isNull(projectRepos.detachedAt)))
          .orderBy(sql`${projectRepos.addedAt} asc`)
          .all();
        return ok({ project: toProject(found[0]), repos, primaryRepo: repos.find((repo) => repo.isPrimary) ?? null });
      } catch (cause) {
        const error: DbError = { cause, code: "DB_READ_FAILED", message: "查询项目失败" };
        logFailure("getProject", error);
        return err(error);
      }
    },

    async createProject(input) {
      try {
        const now = new Date();
        const project: Project = {
          archivedAt: null,
          completedAt: null,
          completedBy: null,
          completionCriteriaResults: [],
          completionSummary: null,
          createdAt: now,
          createdBy: input.createdBy,
          description: input.description ?? null,
          desiredOutcome: input.desiredOutcome ?? null,
          id: randomUUID(),
          lifecycleStatus: "planned",
          name: input.name,
          nonGoals: input.nonGoals ?? null,
          problemStatement: input.problemStatement ?? null,
          successCriteria: input.successCriteria ?? [],
          targetDate: input.targetDate ?? null,
          updatedAt: now,
          version: 1,
        };
        db.insert(projects)
          .values({ ...project, completionCriteriaResults: JSON.stringify(project.completionCriteriaResults), successCriteria: JSON.stringify(project.successCriteria) })
          .run();
        return ok(project);
      } catch (cause) {
        const error: DbError = { cause, code: "DB_WRITE_FAILED", message: "创建项目失败" };
        logFailure("createProject", error);
        return err(error);
      }
    },

    async updateProject(id, input) {
      try {
        const rows = db
          .update(projects)
          .set({
            description: input.description ?? null,
            completedAt: input.completedAt,
            completedBy: input.completedBy,
            completionCriteriaResults: input.completionCriteriaResults ? JSON.stringify(input.completionCriteriaResults) : undefined,
            completionSummary: input.completionSummary,
            desiredOutcome: input.desiredOutcome,
            lifecycleStatus: input.lifecycleStatus,
            name: input.name,
            nonGoals: input.nonGoals,
            problemStatement: input.problemStatement,
            successCriteria: input.successCriteria ? JSON.stringify(input.successCriteria) : undefined,
            targetDate: input.targetDate,
            updatedAt: new Date(),
            version: sql`${projects.version} + 1`,
          })
          .where(and(eq(projects.id, id), eq(projects.version, input.expectedVersion), isNull(projects.archivedAt)))
          .returning()
          .all();
        if (rows[0]) return ok(toProject(rows[0]));
        const exists = db.select({ id: projects.id }).from(projects).where(eq(projects.id, id)).limit(1).all();
        if (exists.length === 0) return ok(null);
        return err({ code: "CONCURRENCY_CONFLICT", message: "项目已被其他操作更新，请刷新后重试" });
      } catch (cause) {
        const error: DbError = { cause, code: "DB_WRITE_FAILED", message: "更新项目失败" };
        logFailure("updateProject", error);
        return err(error);
      }
    },

    async archiveProject(id, expectedVersion) {
      try {
        const now = new Date();
        const rows = db
          .update(projects)
          .set({ archivedAt: now, lifecycleStatus: "archived", updatedAt: now, version: sql`${projects.version} + 1` })
          .where(and(eq(projects.id, id), eq(projects.version, expectedVersion), isNull(projects.archivedAt)))
          .returning()
          .all();
        if (rows[0]) return ok(toProject(rows[0]));
        const exists = db.select({ id: projects.id }).from(projects).where(eq(projects.id, id)).limit(1).all();
        if (exists.length === 0) return ok(null);
        return err({ code: "CONCURRENCY_CONFLICT", message: "项目已被归档或更新，请刷新后重试" });
      } catch (cause) {
        const error: DbError = { cause, code: "DB_WRITE_FAILED", message: "归档项目失败" };
        logFailure("archiveProject", error);
        return err(error);
      }
    },

    async deleteProject(id) {
      try {
        db.delete(projects).where(eq(projects.id, id)).run();
        return ok(undefined);
      } catch (cause) {
        const error: DbError = { cause, code: "DB_WRITE_FAILED", message: "删除项目失败" };
        logFailure("deleteProject", error);
        return err(error);
      }
    },

    async addRepo(input) {
      try {
        const now = new Date();
        const repo = db.transaction((tx) => {
          const isPrimary =
            tx.select({ id: projectRepos.id })
              .from(projectRepos)
              .where(and(eq(projectRepos.projectId, input.projectId), isNull(projectRepos.detachedAt)))
              .limit(1)
              .all().length === 0;
          const next: ProjectRepo = {
            accessStatus: input.accessStatus,
            addedAt: now,
            canCreatePr: input.canCreatePr ?? null,
            canPush: input.canPush ?? null,
            defaultBranch: input.defaultBranch,
            detachedAt: null,
            id: randomUUID(),
            isPrimary,
            lastExecutionValidatedAt: input.lastExecutionValidatedAt ?? null,
            lastValidatedAt: now,
            projectId: input.projectId,
            providerRepoId: input.providerRepoId ?? null,
            repo: input.repo,
            version: 1,
          };
          tx.insert(projectRepos).values(next).run();
          return next;
        });
        return ok(repo);
      } catch (cause) {
        if (isUniqueViolation(cause)) {
          return err({ cause, code: "PROJECT_REPO_EXISTS", message: `仓库 ${input.repo} 已在项目中` });
        }
        const error: DbError = { cause, code: "DB_WRITE_FAILED", message: "添加仓库失败" };
        logFailure("addRepo", error);
        return err(error);
      }
    },

    async setPrimaryRepo(projectId, repoId, expectedVersion) {
      try {
        db.transaction((tx) => {
          const target = tx
            .select()
            .from(projectRepos)
            .where(and(eq(projectRepos.projectId, projectId), eq(projectRepos.id, repoId), isNull(projectRepos.detachedAt)))
            .limit(1)
            .all()[0];
          if (!target) {
            throw { code: "PROJECT_REPO_NOT_FOUND", message: "目标仓库不存在" } satisfies ProjectRepoNotFoundError;
          }
          if (target.version !== expectedVersion) {
            throw { code: "CONCURRENCY_CONFLICT", message: "仓库已被其他操作更新，请刷新后重试" } satisfies ConcurrencyConflictError;
          }
          if (target.accessStatus !== "available") {
            throw { code: "PROJECT_REPO_UNAVAILABLE", message: "仅可访问的仓库可以设为主仓库" } satisfies ProjectRepoUnavailableError;
          }
          if (target.isPrimary) return;
          tx.update(projectRepos)
            .set({ isPrimary: false, version: sql`${projectRepos.version} + 1` })
            .where(and(eq(projectRepos.projectId, projectId), eq(projectRepos.isPrimary, true), isNull(projectRepos.detachedAt)))
            .run();
          const selected = tx.update(projectRepos)
            .set({ isPrimary: true, version: sql`${projectRepos.version} + 1` })
            .where(
              and(
                eq(projectRepos.projectId, projectId),
                eq(projectRepos.id, repoId),
                eq(projectRepos.accessStatus, "available"),
                eq(projectRepos.version, expectedVersion),
                isNull(projectRepos.detachedAt),
              ),
            )
            .run();
          if (selected.changes === 0) {
            throw { code: "CONCURRENCY_CONFLICT", message: "仓库已被其他操作更新，请刷新后重试" } satisfies ConcurrencyConflictError;
          }
        });
        return ok(undefined);
      } catch (cause) {
        if (isProjectStoreBusinessError(cause)) return err(cause);
        const error: DbError = { cause, code: "DB_WRITE_FAILED", message: "设置主仓库失败" };
        logFailure("setPrimaryRepo", error);
        return err(error);
      }
    },

    async updateRepoValidation(repoId, input) {
      try {
        const rows = db
          .update(projectRepos)
          .set({
            accessStatus: input.accessStatus,
            canCreatePr: input.canCreatePr,
            canPush: input.canPush,
            defaultBranch: input.defaultBranch,
            lastExecutionValidatedAt: input.lastExecutionValidatedAt,
            lastValidatedAt: input.lastValidatedAt,
            providerRepoId: input.providerRepoId,
            repo: input.repo,
            version: sql`${projectRepos.version} + 1`,
          })
          .where(and(eq(projectRepos.id, repoId), eq(projectRepos.version, input.expectedVersion), isNull(projectRepos.detachedAt)))
          .returning()
          .all();
        if (rows[0]) return ok(rows[0]);
        const exists = db
          .select({ id: projectRepos.id })
          .from(projectRepos)
          .where(and(eq(projectRepos.id, repoId), isNull(projectRepos.detachedAt)))
          .limit(1)
          .all();
        if (exists.length === 0) return ok(null);
        return err({ code: "CONCURRENCY_CONFLICT", message: "仓库已被其他操作更新，请刷新后重试" });
      } catch (cause) {
        if (isUniqueViolation(cause)) {
          return err({ cause, code: "PROJECT_REPO_EXISTS", message: `仓库 ${input.repo} 已在项目中` });
        }
        const error: DbError = { cause, code: "DB_WRITE_FAILED", message: "更新仓库校验状态失败" };
        logFailure("updateRepoValidation", error);
        return err(error);
      }
    },

    async removeRepo(input) {
      try {
        const now = new Date();
        db.transaction((tx) => {
          let targetDetached = false;
          const target = tx
            .select()
            .from(projectRepos)
            .where(and(eq(projectRepos.projectId, input.projectId), eq(projectRepos.id, input.repoId), isNull(projectRepos.detachedAt)))
            .limit(1)
            .all()[0];
          if (!target) {
            throw { code: "PROJECT_REPO_NOT_FOUND", message: "待移除仓库不存在" } satisfies ProjectRepoNotFoundError;
          }
          if (target.version !== input.expectedVersion) {
            throw { code: "CONCURRENCY_CONFLICT", message: "仓库已被其他操作更新，请刷新后重试" } satisfies ConcurrencyConflictError;
          }
          const otherRepos = tx
            .select()
            .from(projectRepos)
            .where(and(eq(projectRepos.projectId, input.projectId), sql`${projectRepos.id} <> ${input.repoId}`, isNull(projectRepos.detachedAt)))
            .all();
          if (target.isPrimary && otherRepos.length > 0) {
            if (!input.replacementPrimaryRepoId || input.replacementPrimaryRepoId === input.repoId) {
              throw {
                code: "PRIMARY_REPO_REPLACEMENT_REQUIRED",
                message: "移除主仓库前，请选择一个可访问的替代主仓库",
              } satisfies PrimaryRepoReplacementRequiredError;
            }
            const replacement = otherRepos.find((repo) => repo.id === input.replacementPrimaryRepoId);
            if (!replacement) {
              throw { code: "PROJECT_REPO_NOT_FOUND", message: "替代主仓库不存在" } satisfies ProjectRepoNotFoundError;
            }
            if (replacement.accessStatus !== "available") {
              throw { code: "PROJECT_REPO_UNAVAILABLE", message: "替代主仓库当前不可访问" } satisfies ProjectRepoUnavailableError;
            }
            if (input.replacementExpectedVersion === undefined || replacement.version !== input.replacementExpectedVersion) {
              throw { code: "CONCURRENCY_CONFLICT", message: "替代仓库已被其他操作更新，请刷新后重试" } satisfies ConcurrencyConflictError;
            }
            const detachedPrimary = tx.update(projectRepos)
              .set({ detachedAt: now, isPrimary: false, version: sql`${projectRepos.version} + 1` })
              .where(and(eq(projectRepos.id, target.id), eq(projectRepos.version, input.expectedVersion), isNull(projectRepos.detachedAt)))
              .run();
            if (detachedPrimary.changes === 0) {
              throw { code: "CONCURRENCY_CONFLICT", message: "仓库已被其他操作更新，请刷新后重试" } satisfies ConcurrencyConflictError;
            }
            targetDetached = true;
            const promoted = tx.update(projectRepos)
              .set({ isPrimary: true, version: sql`${projectRepos.version} + 1` })
              .where(and(eq(projectRepos.id, replacement.id), eq(projectRepos.version, replacement.version), isNull(projectRepos.detachedAt)))
              .run();
            if (promoted.changes === 0) {
              throw { code: "CONCURRENCY_CONFLICT", message: "替代仓库已被其他操作更新，请刷新后重试" } satisfies ConcurrencyConflictError;
            }
          }
          if (!targetDetached) {
            const detached = tx.update(projectRepos)
              .set({ detachedAt: now, isPrimary: false, version: sql`${projectRepos.version} + 1` })
              .where(and(eq(projectRepos.projectId, input.projectId), eq(projectRepos.id, input.repoId), eq(projectRepos.version, input.expectedVersion), isNull(projectRepos.detachedAt)))
              .run();
            if (detached.changes === 0) {
              throw { code: "CONCURRENCY_CONFLICT", message: "仓库已被其他操作更新，请刷新后重试" } satisfies ConcurrencyConflictError;
            }
          }
        });
        return ok(undefined);
      } catch (cause) {
        if (isProjectStoreBusinessError(cause)) return err(cause);
        const error: DbError = { cause, code: "DB_WRITE_FAILED", message: "移除仓库失败" };
        logFailure("removeRepo", error);
        return err(error);
      }
    },
  };
}
