CREATE TABLE `deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`status` text DEFAULT 'none' NOT NULL,
	`branch` text NOT NULL,
	`base_sha` text NOT NULL,
	`head_sha` text,
	`github_pr_number` integer,
	`github_pr_node_id` text,
	`github_pr_url` text,
	`merged_sha` text,
	`merged_at` integer,
	`closed_reason` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deliveries_task_id_unique` ON `deliveries` (`task_id`);--> statement-breakpoint
CREATE TABLE `knowledge_generations` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`source_set` text NOT NULL,
	`source_fingerprint` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`trigger` text NOT NULL,
	`error_code` text,
	`error_message` text,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`published_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_project_fingerprint_unique` ON `knowledge_generations` (`project_id`,`source_fingerprint`);--> statement-breakpoint
CREATE TABLE `task_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`attempt` integer NOT NULL,
	`stage` text DEFAULT 'queued' NOT NULL,
	`sandbox_ref` text,
	`agent_session_id` text,
	`error_code` text,
	`error_message` text,
	`heartbeat_at` integer,
	`deadline_at` integer,
	`started_at` integer,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_runs_task_attempt_unique` ON `task_runs` (`task_id`,`attempt`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`project_repo_id` text NOT NULL,
	`title` text NOT NULL,
	`requirement` text NOT NULL,
	`acceptance_criteria` text DEFAULT '[]' NOT NULL,
	`non_goals` text,
	`validation_commands` text DEFAULT '[]' NOT NULL,
	`risk_notes` text,
	`created_by` text NOT NULL,
	`reviewer_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`idempotency_key` text NOT NULL,
	`command_fingerprint` text NOT NULL,
	`provider_repo_id` text,
	`canonical_repo` text NOT NULL,
	`default_branch` text NOT NULL,
	`base_sha` text NOT NULL,
	`validation_version` integer NOT NULL,
	`branch` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_repo_id`) REFERENCES `project_repos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_actor_idempotency_unique` ON `tasks` (`created_by`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_repo_branch_unique` ON `tasks` (`project_repo_id`,`branch`);--> statement-breakpoint
DROP INDEX `project_repos_project_repo_unique`;--> statement-breakpoint
DROP INDEX `project_repos_one_primary_unique`;--> statement-breakpoint
ALTER TABLE `project_repos` ADD `provider_repo_id` text;--> statement-breakpoint
ALTER TABLE `project_repos` ADD `can_push` integer;--> statement-breakpoint
ALTER TABLE `project_repos` ADD `can_create_pr` integer;--> statement-breakpoint
ALTER TABLE `project_repos` ADD `last_execution_validated_at` integer;--> statement-breakpoint
ALTER TABLE `project_repos` ADD `detached_at` integer;--> statement-breakpoint
ALTER TABLE `project_repos` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `project_repos_project_repo_unique` ON `project_repos` (`project_id`,`repo`) WHERE "project_repos"."detached_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX `project_repos_one_primary_unique` ON `project_repos` (`project_id`) WHERE "project_repos"."is_primary" = 1 and "project_repos"."detached_at" is null;--> statement-breakpoint
ALTER TABLE `projects` ADD `problem_statement` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `desired_outcome` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `success_criteria` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `non_goals` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `target_date` integer;--> statement-breakpoint
ALTER TABLE `projects` ADD `lifecycle_status` text DEFAULT 'planned' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `archived_at` integer;--> statement-breakpoint
ALTER TABLE `projects` ADD `version` integer DEFAULT 1 NOT NULL;