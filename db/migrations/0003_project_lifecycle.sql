CREATE TABLE `deleted_project_sources` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`project_type` text NOT NULL,
	`academic_period` text,
	`collection_year` integer,
	`created_at` text,
	`deleted_at` text NOT NULL,
	`deleted_by` integer NOT NULL,
	`retained_records` text NOT NULL,
	FOREIGN KEY (`deleted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
ALTER TABLE `projects` ADD `status_before_archive` text;
--> statement-breakpoint
UPDATE projects
SET status_before_archive = CASE WHEN status IN ('setup', 'active', 'completed') THEN status ELSE NULL END,
    status = 'archived'
WHERE status = 'archived' OR archived_at IS NOT NULL;
--> statement-breakpoint
UPDATE update_requests SET revoked_at = CURRENT_TIMESTAMP
WHERE project_id IN (SELECT id FROM projects WHERE status = 'archived')
    AND revoked_at IS NULL AND consumed_at IS NULL;
