CREATE TABLE `task_acceptances` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`criteria_results` text DEFAULT '[]' NOT NULL,
	`environment` text,
	`evidence` text DEFAULT '[]' NOT NULL,
	`notes` text,
	`decided_by` text,
	`decided_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`decided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_acceptances_task_id_unique` ON `task_acceptances` (`task_id`);
--> statement-breakpoint
INSERT INTO `task_acceptances` (`id`, `task_id`, `status`, `criteria_results`, `evidence`, `created_at`, `updated_at`, `version`)
SELECT 'acceptance-' || `id`, `id`, 'pending', '[]', '[]', `created_at`, `updated_at`, 1 FROM `tasks`;
--> statement-breakpoint
UPDATE `tasks` SET `status` = 'acceptance_pending' WHERE `status` = 'merged';
