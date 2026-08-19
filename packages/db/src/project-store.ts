import { randomUUID } from "node:crypto";

import { err, ok, type Result } from "@next-build/result";
import { and, eq, sql } from "drizzle-orm";

import type { Db } from "./client";
import type { Logger } from "./logger";
import { projectRepos, projects } from "./schema";
import type { DbError } from "./auth-store";

export interface Project {
  id: string;
  name: string;
  description: string | null;
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
  addedAt: Date;
}

export type RepoAccessStatus = "available" | "unavailable";

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

export interface ProjectStore {
  /** 全部项目（含各项目仓库数），按创建时间倒序。 */
  listProjects(): Promise<Result<ProjectSummary[], DbError>>;
  /** 项目详情（含仓库列表）；不存在返回 null。 */
  getProject(id: string): Promise<Result<ProjectDetail | null, DbError>>;
  createProject(input: { name: string; description?: string; createdBy: string }): Promise<Result<Project, DbError>>;
  /** 更新名称/描述；不存在返回 null。 */
  updateProject(
    id: string,
    input: { name: string; description?: string | null },
  ): Promise<Result<Project | null, DbError>>;
  /** 删除项目；仓库经外键级联删除。 */
  deleteProject(id: string): Promise<Result<void, DbError>>;
  /** 挂载仓库；同项目重复添加返回业务错误 PROJECT_REPO_EXISTS。 */
  addRepo(input: {
    projectId: string;
    repo: string;
    defaultBranch: string | null;
    accessStatus: RepoAccessStatus;
  }): Promise<Result<ProjectRepo, DbError | ProjectRepoExistsError>>;
  /** 主仓切换在单一事务内完成。 */
  setPrimaryRepo(projectId: string, repoId: string): Promise<Result<void, DbError>>;
  /** 更新一次确定性校验结果；规范仓库名冲突仍按重复仓库返回。 */
  updateRepoValidation(
    repoId: string,
    input: {
      repo: string;
      defaultBranch: string | null;
      accessStatus: RepoAccessStatus;
      lastValidatedAt: Date;
    },
  ): Promise<Result<ProjectRepo | null, DbError | ProjectRepoExistsError>>;
  /** 删除主仓时可显式传替代主仓；切换与删除在同一事务内完成。 */
  removeRepo(input: {
    projectId: string;
    repoId: string;
    replacementPrimaryRepoId?: string;
  }): Promise<Result<void, DbError>>;
}

function isUniqueViolation(cause: unknown): boolean {
  return (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    (cause as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE"
  );
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
              ...project,
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
          .where(eq(projectRepos.projectId, id))
          .orderBy(sql`${projectRepos.addedAt} asc`)
          .all();
        return ok({ project: found[0], repos, primaryRepo: repos.find((repo) => repo.isPrimary) ?? null });
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
          createdAt: now,
          createdBy: input.createdBy,
          description: input.description ?? null,
          id: randomUUID(),
          name: input.name,
          updatedAt: now,
        };
        db.insert(projects).values(project).run();
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
          .set({ description: input.description ?? null, name: input.name, updatedAt: new Date() })
          .where(eq(projects.id, id))
          .returning()
          .all();
        return ok(rows[0] ?? null);
      } catch (cause) {
        const error: DbError = { cause, code: "DB_WRITE_FAILED", message: "更新项目失败" };
        logFailure("updateProject", error);
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
              .where(eq(projectRepos.projectId, input.projectId))
              .limit(1)
              .all().length === 0;
          const next: ProjectRepo = {
            accessStatus: input.accessStatus,
            addedAt: now,
            defaultBranch: input.defaultBranch,
            id: randomUUID(),
            isPrimary,
            lastValidatedAt: now,
            projectId: input.projectId,
            repo: input.repo,
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

    async setPrimaryRepo(projectId, repoId) {
      try {
        db.transaction((tx) => {
          tx.update(projectRepos)
            .set({ isPrimary: false })
            .where(eq(projectRepos.projectId, projectId))
            .run();
          tx.update(projectRepos)
            .set({ isPrimary: true })
            .where(
              and(
                eq(projectRepos.projectId, projectId),
                eq(projectRepos.id, repoId),
                eq(projectRepos.accessStatus, "available"),
              ),
            )
            .run();
          const selected = tx
            .select({ id: projectRepos.id })
            .from(projectRepos)
            .where(
              and(
                eq(projectRepos.projectId, projectId),
                eq(projectRepos.id, repoId),
                eq(projectRepos.isPrimary, true),
              ),
            )
            .limit(1)
            .all();
          if (selected.length === 0) throw new Error("目标主仓库不存在或不可用");
        });
        return ok(undefined);
      } catch (cause) {
        const error: DbError = { cause, code: "DB_WRITE_FAILED", message: "设置主仓库失败" };
        logFailure("setPrimaryRepo", error);
        return err(error);
      }
    },

    async updateRepoValidation(repoId, input) {
      try {
        const rows = db
          .update(projectRepos)
          .set(input)
          .where(eq(projectRepos.id, repoId))
          .returning()
          .all();
        return ok(rows[0] ?? null);
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
        db.transaction((tx) => {
          const target = tx
            .select({ isPrimary: projectRepos.isPrimary })
            .from(projectRepos)
            .where(and(eq(projectRepos.projectId, input.projectId), eq(projectRepos.id, input.repoId)))
            .limit(1)
            .all()[0];
          const hasOtherRepo =
            tx.select({ id: projectRepos.id })
              .from(projectRepos)
              .where(and(eq(projectRepos.projectId, input.projectId), sql`${projectRepos.id} <> ${input.repoId}`))
              .limit(1)
              .all().length > 0;
          if (!target) throw new Error("待移除仓库不存在");
          if (target.isPrimary && hasOtherRepo && !input.replacementPrimaryRepoId) {
            throw new Error("移除主仓库时缺少替代主仓库");
          }
          if (target.isPrimary && hasOtherRepo && input.replacementPrimaryRepoId === input.repoId) {
            throw new Error("替代主仓库不能是待移除仓库");
          }
          if (input.replacementPrimaryRepoId) {
            tx.update(projectRepos)
              .set({ isPrimary: false })
              .where(eq(projectRepos.projectId, input.projectId))
              .run();
            tx.update(projectRepos)
              .set({ isPrimary: true })
              .where(
                and(
                  eq(projectRepos.projectId, input.projectId),
                  eq(projectRepos.id, input.replacementPrimaryRepoId),
                  eq(projectRepos.accessStatus, "available"),
                ),
              )
              .run();
            const selected = tx
              .select({ id: projectRepos.id })
              .from(projectRepos)
              .where(
                and(
                  eq(projectRepos.projectId, input.projectId),
                  eq(projectRepos.id, input.replacementPrimaryRepoId),
                  eq(projectRepos.isPrimary, true),
                ),
              )
              .limit(1)
              .all();
            if (selected.length === 0) throw new Error("替代主仓库不存在或不可用");
          }
          const deleted = tx.delete(projectRepos)
            .where(and(eq(projectRepos.projectId, input.projectId), eq(projectRepos.id, input.repoId)))
            .run();
          if (deleted.changes === 0) throw new Error("待移除仓库不存在");
        });
        return ok(undefined);
      } catch (cause) {
        const error: DbError = { cause, code: "DB_WRITE_FAILED", message: "移除仓库失败" };
        logFailure("removeRepo", error);
        return err(error);
      }
    },
  };
}
