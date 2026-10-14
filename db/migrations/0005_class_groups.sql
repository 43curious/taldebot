CREATE TABLE `class_group_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`group_id` integer NOT NULL,
	`student_id` integer NOT NULL,
	`joined_at` text NOT NULL,
	`left_at` text,
	`added_by` integer NOT NULL,
	`source` text NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `class_groups`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`student_id`) REFERENCES `student_records`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`added_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `active_group_membership` ON `class_group_members` (`group_id`,`student_id`) WHERE "class_group_members"."left_at" IS NULL;--> statement-breakpoint
CREATE TABLE `class_groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`class_id` integer,
	`class_name` text NOT NULL,
	`name` text NOT NULL,
	`module_name` text NOT NULL,
	`source_assignment_id` integer,
	`created_by` integer NOT NULL,
	`created_at` text NOT NULL,
	`archived_at` text,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`source_assignment_id`) REFERENCES `confirmed_assignments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `active_class_group_name` ON `class_groups` (`class_id`,`module_name`,`name`) WHERE "class_groups"."archived_at" IS NULL;--> statement-breakpoint
ALTER TABLE `deleted_project_sources` ADD `audience_snapshot` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `audience_snapshot` text;