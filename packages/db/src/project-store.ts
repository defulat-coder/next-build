import { randomUUID } from "node:crypto";

import { err, ok, type Result } from "@next-build/result";
import { eq, sql } from "drizzle-orm";

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
  defaultBranch: string;
  addedAt: Date;
}

/** 列表项：项目 + 仓库数。 */
export interface ProjectSummary extends Project {
  repoCount: number;
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
  getProject(id: string): Promise<Result<{ project: Project; repos: ProjectRepo[] } | null, DbError>>;
  createProject(input: { name: string; description?: string; createdBy: string }): Promise<Result<Project, DbError>>;
  /** 删除项目；仓库经外键级联删除。 */
  deleteProject(id: string): Promise<Result<void, DbError>>;
  /** 挂载仓库；同项目重复添加返回业务错误 PROJECT_REPO_EXISTS。 */
  addRepo(input: {
    projectId: string;
    repo: string;
    defaultBranch: string;
  }): Promise<Result<ProjectRepo, DbError | ProjectRepoExistsError>>;
  removeRepo(repoId: string): Promise<Result<void, DbError>>;
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
        const rows = db
          .select({ project: projects, repoCount: sql<number>`count(${projectRepos.id})` })
          .from(projects)
          .leftJoin(projectRepos, eq(projectRepos.projectId, projects.id))
          .groupBy(projects.id)
          .orderBy(sql`${projects.createdAt} desc`)
          .all();
        return ok(rows.map((row) => ({ ...row.project, repoCount: row.repoCount })));
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
        return ok({ project: found[0], repos });
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
        const repo: ProjectRepo = {
          addedAt: new Date(),
          defaultBranch: input.defaultBranch,
          id: randomUUID(),
          projectId: input.projectId,
          repo: input.repo,
        };
        db.insert(projectRepos).values(repo).run();
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

    async removeRepo(repoId) {
      try {
        db.delete(projectRepos).where(eq(projectRepos.id, repoId)).run();
        return ok(undefined);
      } catch (cause) {
        const error: DbError = { cause, code: "DB_WRITE_FAILED", message: "移除仓库失败" };
        logFailure("removeRepo", error);
        return err(error);
      }
    },
  };
}
