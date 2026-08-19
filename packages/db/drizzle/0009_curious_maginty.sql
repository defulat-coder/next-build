ALTER TABLE `task_runs` ADD `worker_id` text;--> statement-breakpoint
ALTER TABLE `task_runs` ADD `lease_expires_at` integer;--> statement-breakpoint
ALTER TABLE `task_runs` ADD `checkpoint` text;