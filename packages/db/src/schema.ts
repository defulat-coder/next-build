import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/** 飞书 OAuth 登录的用户，每人一条记录。 */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  feishuOpenId: text("feishu_open_id").notNull().unique(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  lastLoginAt: integer("last_login_at", { mode: "timestamp_ms" }).notNull(),
});

/** 会话表：只存 token 的 sha256，原值只出现在用户浏览器的 cookie 里。 */
export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

/** 项目：可挂多个 GitHub 仓库的组，任务与 Wiki 的归属单位。 */
export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/** 项目挂载的 GitHub 仓库（owner/repo + 默认分支），随项目级联删除。 */
export const projectRepos = sqliteTable(
  "project_repos",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    repo: text("repo").notNull(),
    defaultBranch: text("default_branch").notNull(),
    addedAt: integer("added_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [uniqueIndex("project_repos_project_repo_unique").on(table.projectId, table.repo)],
);
