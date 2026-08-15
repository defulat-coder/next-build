import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
