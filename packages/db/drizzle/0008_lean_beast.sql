CREATE TABLE `source_files` (
	`id` text PRIMARY KEY NOT NULL,
	`generation_id` text NOT NULL,
	`project_id` text NOT NULL,
	`repo` text NOT NULL,
	`path` text NOT NULL,
	`content` text NOT NULL,
	`language` text,
	`truncated` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`generation_id`) REFERENCES `knowledge_generations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_files_generation_path_unique` ON `source_files` (`generation_id`,`repo`,`path`);--> statement-breakpoint
CREATE TABLE `wiki_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`generation_id` text NOT NULL,
	`project_id` text NOT NULL,
	`repo` text NOT NULL,
	`path` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	FOREIGN KEY (`generation_id`) REFERENCES `knowledge_generations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wiki_documents_generation_path_unique` ON `wiki_documents` (`generation_id`,`repo`,`path`);