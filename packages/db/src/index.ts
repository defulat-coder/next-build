/**
 * 数据层窄接口（见 PRODUCT.md「仓库 Wiki / Ask AI」）。
 * 本地实现为 better-sqlite3 + FTS5；远程实现本期不设计。
 */

/** Wiki 文档（OpenWiki 生成的 Markdown 页面）。 */
export interface WikiDocument {
  id: string;
  workspaceId: string;
  /** 文档在工作区内的相对路径，如 openwiki/architecture.md */
  path: string;
  title: string;
  content: string;
}

/** 源文件只读镜像（GitHub 仓库仍是真相源，重新生成时整体覆盖）。 */
export interface SourceFile {
  id: string;
  workspaceId: string;
  /** 来源仓库，格式 owner/repo */
  repo: string;
  path: string;
  content: string;
  language?: string;
}

export interface SearchHit {
  kind: "wiki" | "source";
  id: string;
  path: string;
  title?: string;
  snippet: string;
  rank: number;
}

export interface DocStore {
  /** 覆盖式写入一个工作区的 Wiki 文档（先清后写）。 */
  putWikiDocuments(workspaceId: string, docs: WikiDocument[]): Promise<void>;
  /** 覆盖式写入一个工作区的源文件镜像（先清后写）。 */
  putSourceFiles(workspaceId: string, files: SourceFile[]): Promise<void>;
  listWikiDocuments(workspaceId: string): Promise<WikiDocument[]>;
  getSourceFile(workspaceId: string, repo: string, path: string): Promise<SourceFile | null>;
  /** FTS5 全文检索（unicode61 + trigram 双索引合并排序）。 */
  search(workspaceId: string, query: string, limit?: number): Promise<SearchHit[]>;
}

export { createAuthStore } from "./auth-store";
export type { AuthStore, AuthUser, DbError, FeishuUserProfile } from "./auth-store";
export { createDb } from "./client";
export type { Db } from "./client";
export type { Logger } from "./logger";
export { createProjectStore } from "./project-store";
export type { Project, ProjectRepo, ProjectRepoExistsError, ProjectStore, ProjectSummary } from "./project-store";
