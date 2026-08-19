PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_project_repos` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`repo` text NOT NULL,
	`default_branch` text,
	`is_primary` integer NOT NULL,
	`access_status` text NOT NULL,
	`last_validated_at` integer NOT NULL,
	`added_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_project_repos`(
	"id",
	"project_id",
	"repo",
	"default_branch",
	"is_primary",
	"access_status",
	"last_validated_at",
	"added_at"
)
SELECT
	current_repo."id",
	current_repo."project_id",
	current_repo."repo",
	current_repo."default_branch",
	CASE WHEN current_repo."id" = (
		SELECT earliest_repo."id"
		FROM `project_repos` AS earliest_repo
		WHERE earliest_repo."project_id" = current_repo."project_id"
		ORDER BY earliest_repo."added_at" ASC, earliest_repo."id" ASC
		LIMIT 1
	) THEN 1 ELSE 0 END,
	'available',
	current_repo."added_at",
	current_repo."added_at"
FROM `project_repos` AS current_repo;--> statement-breakpoint
DROP TABLE `project_repos`;--> statement-breakpoint
ALTER TABLE `__new_project_repos` RENAME TO `project_repos`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `project_repos_project_repo_unique` ON `project_repos` (`project_id`,`repo`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_repos_one_primary_unique` ON `project_repos` (`project_id`) WHERE "project_repos"."is_primary" = 1;
