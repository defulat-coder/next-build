ALTER TABLE `projects` ADD `completion_summary` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `completion_criteria_results` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `completed_at` integer;--> statement-breakpoint
ALTER TABLE `projects` ADD `completed_by` text REFERENCES users(id);