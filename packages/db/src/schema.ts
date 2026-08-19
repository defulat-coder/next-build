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
  problemStatement: text("problem_statement"),
  desiredOutcome: text("desired_outcome"),
  successCriteria: text("success_criteria").notNull().default("[]"),
  nonGoals: text("non_goals"),
  targetDate: integer("target_date", { mode: "timestamp_ms" }),
  lifecycleStatus: text("lifecycle_status", {
    enum: ["planned", "active", "blocked", "completed", "archived"],
  })
    .notNull()
    .default("planned"),
  archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  completionSummary: text("completion_summary"),
  completionCriteriaResults: text("completion_criteria_results").notNull().default("[]"),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  completedBy: text("completed_by").references(() => users.id),
  version: integer("version").notNull().default(1),
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
    providerRepoId: text("provider_repo_id"),
    canPush: integer("can_push", { mode: "boolean" }),
    canCreatePr: integer("can_create_pr", { mode: "boolean" }),
    lastExecutionValidatedAt: integer("last_execution_validated_at", { mode: "timestamp_ms" }),
    detachedAt: integer("detached_at", { mode: "timestamp_ms" }),
    version: integer("version").notNull().default(1),
    addedAt: integer("added_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("project_repos_project_repo_unique")
      .on(table.projectId, table.repo)
      .where(sql`${table.detachedAt} is null`),
    uniqueIndex("project_repos_one_primary_unique")
      .on(table.projectId)
      .where(sql`${table.isPrimary} = 1 and ${table.detachedAt} is null`),
  ],
);

/** Task 核心记录：保存需求/验收、冻结执行目标和稳定身份，不保存代码 diff。 */
export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    projectRepoId: text("project_repo_id")
      .notNull()
      .references(() => projectRepos.id),
    title: text("title").notNull(),
    requirement: text("requirement").notNull(),
    acceptanceCriteria: text("acceptance_criteria").notNull().default("[]"),
    nonGoals: text("non_goals"),
    validationCommands: text("validation_commands").notNull().default("[]"),
    riskNotes: text("risk_notes"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    reviewerId: text("reviewer_id").references(() => users.id),
    status: text("status", {
      enum: ["draft", "queued", "running", "review", "acceptance_pending", "accepted", "rejected", "closed", "failed", "cancelled"],
    })
      .notNull()
      .default("draft"),
    idempotencyKey: text("idempotency_key").notNull(),
    commandFingerprint: text("command_fingerprint").notNull(),
    providerRepoId: text("provider_repo_id"),
    canonicalRepo: text("canonical_repo").notNull(),
    defaultBranch: text("default_branch").notNull(),
    baseSha: text("base_sha").notNull(),
    validationVersion: integer("validation_version").notNull(),
    branch: text("branch").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    uniqueIndex("tasks_actor_idempotency_unique").on(table.createdBy, table.idempotencyKey),
    uniqueIndex("tasks_repo_branch_unique").on(table.projectRepoId, table.branch),
  ],
);

/** 一次可恢复的 Task 执行尝试。 */
export const taskRuns = sqliteTable(
  "task_runs",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    attempt: integer("attempt").notNull(),
    stage: text("stage", {
      enum: ["queued", "provisioning", "running", "publishing", "succeeded", "failed", "cancelled", "manual_repair"],
    })
      .notNull()
      .default("queued"),
    sandboxRef: text("sandbox_ref"),
    agentSessionId: text("agent_session_id"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    heartbeatAt: integer("heartbeat_at", { mode: "timestamp_ms" }),
    deadlineAt: integer("deadline_at", { mode: "timestamp_ms" }),
    workerId: text("worker_id"),
    leaseExpiresAt: integer("lease_expires_at", { mode: "timestamp_ms" }),
    checkpoint: text("checkpoint"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    version: integer("version").notNull().default(1),
  },
  (table) => [uniqueIndex("task_runs_task_attempt_unique").on(table.taskId, table.attempt)],
);

/** GitHub 交付状态，本地保存映射，代码与 PR 事实仍以 GitHub 为准。 */
export const deliveries = sqliteTable("deliveries", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .unique()
    .references(() => tasks.id, { onDelete: "cascade" }),
  status: text("status", {
    enum: ["none", "branch_pushed", "draft_pr_open", "ready_for_review", "merged", "closed_unmerged"],
  })
    .notNull()
    .default("none"),
  branch: text("branch").notNull(),
  baseSha: text("base_sha").notNull(),
  headSha: text("head_sha"),
  githubPrNumber: integer("github_pr_number"),
  githubPrNodeId: text("github_pr_node_id"),
  githubPrUrl: text("github_pr_url"),
  mergedSha: text("merged_sha"),
  mergedAt: integer("merged_at", { mode: "timestamp_ms" }),
  closedReason: text("closed_reason"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  version: integer("version").notNull().default(1),
});

/** 业务验收与代码合并分离：逐条结论和证据由指定 reviewer 或管理员确认。 */
export const taskAcceptances = sqliteTable("task_acceptances", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .unique()
    .references(() => tasks.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["pending", "accepted", "rejected"] }).notNull().default("pending"),
  criteriaResults: text("criteria_results").notNull().default("[]"),
  environment: text("environment"),
  evidence: text("evidence").notNull().default("[]"),
  notes: text("notes"),
  decidedBy: text("decided_by").references(() => users.id),
  decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  version: integer("version").notNull().default(1),
});

/** 项目知识的一次版本化生成；只有 published generation 可被 Wiki/Ask 读取。 */
export const knowledgeGenerations = sqliteTable(
  "knowledge_generations",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    sourceSet: text("source_set").notNull(),
    sourceFingerprint: text("source_fingerprint").notNull(),
    status: text("status", { enum: ["queued", "generating", "published", "failed"] })
      .notNull()
      .default("queued"),
    trigger: text("trigger", { enum: ["manual", "delivery_merged", "initial"] }).notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }),
    version: integer("version").notNull().default(1),
  },
  (table) => [uniqueIndex("knowledge_project_fingerprint_unique").on(table.projectId, table.sourceFingerprint)],
);

export const wikiDocuments = sqliteTable(
  "wiki_documents",
  {
    id: text("id").primaryKey(),
    generationId: text("generation_id").notNull().references(() => knowledgeGenerations.id, { onDelete: "cascade" }),
    projectId: text("project_id").notNull().references(() => projects.id),
    repo: text("repo").notNull(),
    path: text("path").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
  },
  (table) => [uniqueIndex("wiki_documents_generation_path_unique").on(table.generationId, table.repo, table.path)],
);

export const sourceFiles = sqliteTable(
  "source_files",
  {
    id: text("id").primaryKey(),
    generationId: text("generation_id").notNull().references(() => knowledgeGenerations.id, { onDelete: "cascade" }),
    projectId: text("project_id").notNull().references(() => projects.id),
    repo: text("repo").notNull(),
    path: text("path").notNull(),
    content: text("content").notNull(),
    language: text("language"),
    truncated: integer("truncated", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [uniqueIndex("source_files_generation_path_unique").on(table.generationId, table.repo, table.path)],
);

/** 外部 webhook 去重；GitHub delivery id 至少一次投递时只推进一次状态。 */
export const webhookInbox = sqliteTable("webhook_inbox", {
  id: text("id").primaryKey(),
  eventName: text("event_name").notNull(),
  receivedAt: integer("received_at", { mode: "timestamp_ms" }).notNull(),
});

/** 跨上下文可靠事实；业务状态与 outbox 同事务提交，消费者幂等处理。 */
export const outboxEvents = sqliteTable("outbox_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  aggregateId: text("aggregate_id").notNull(),
  payload: text("payload").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  processedAt: integer("processed_at", { mode: "timestamp_ms" }),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
});

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
