import { sql } from "drizzle-orm";
import { integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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

/** 项目挂载的 GitHub 仓库；每项目最多一个主仓，随项目级联删除。 */
export const projectRepos = sqliteTable(
  "project_repos",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    repo: text("repo").notNull(),
    defaultBranch: text("default_branch"),
    isPrimary: integer("is_primary", { mode: "boolean" }).notNull(),
    accessStatus: text("access_status", { enum: ["available", "unavailable"] }).notNull(),
    lastValidatedAt: integer("last_validated_at", { mode: "timestamp_ms" }).notNull(),
    addedAt: integer("added_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("project_repos_project_repo_unique").on(table.projectId, table.repo),
    uniqueIndex("project_repos_one_primary_unique")
      .on(table.projectId)
      .where(sql`${table.isPrimary} = 1`),
  ],
);

// ---------- IAM（RBAC，docs/architecture-rbac-menu.md §2） ----------

/** 角色：内置角色 built_in=true 不可删；code 如 site:admin / project:owner。 */
export const roles = sqliteTable("roles", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  scope: text("scope", { enum: ["site", "project"] }).notNull(),
  name: text("name").notNull(),
  builtIn: integer("built_in", { mode: "boolean" }).notNull(),
});

/** 权限码：与代码常量表（permissions.ts）对齐，启动时种子同步。 */
export const permissions = sqliteTable("permissions", {
  code: text("code").primaryKey(),
  description: text("description").notNull(),
});

/** 角色-权限映射：随角色/权限级联删除。 */
export const rolePermissions = sqliteTable(
  "role_permissions",
  {
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionCode: text("permission_code")
      .notNull()
      .references(() => permissions.code, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permissionCode] })],
);

/** 用户-整站角色：一人一个整站角色（user_id 主键即唯一约束）。 */
export const userSiteRoles = sqliteTable("user_site_roles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id),
  roleId: text("role_id")
    .notNull()
    .references(() => roles.id),
});

/** 项目成员（含项目角色）：权限判定以此表为准，不看 projects.created_by。 */
export const projectMembers = sqliteTable(
  "project_members",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id),
    addedAt: integer("added_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.userId] })],
);
