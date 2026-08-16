-- 一次性数据迁移（docs/architecture-rbac-menu.md §2/§7）：既有 site:member 用户全部提升为 site:admin。
-- 一次性由 drizzle 迁移日志（__drizzle_migrations）保证：只执行一次，之后管理员在管理页的降级不会被重放。
-- 迁移先于种子执行，roles 表可能尚无数据：此处按需补 site:admin 角色（id 取 code 本身，种子按 code upsert 时保留该 id）。
INSERT OR IGNORE INTO `roles` (`id`, `code`, `scope`, `name`, `built_in`)
VALUES ('site:admin', 'site:admin', 'site', '管理员', 1);
--> statement-breakpoint
UPDATE `user_site_roles`
SET `role_id` = (SELECT `id` FROM `roles` WHERE `code` = 'site:admin')
WHERE `role_id` IN (SELECT `id` FROM `roles` WHERE `code` = 'site:member');
