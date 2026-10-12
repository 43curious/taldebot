CREATE TABLE `class_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`class_id` integer NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`division` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`national_id` text,
	`tutor` text,
	`town` text,
	`academic_status` text,
	`erasmus` text,
	`dual` text,
	`notes` text,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `classes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`year` integer NOT NULL,
	`capacity` integer DEFAULT 50 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`degree_id` integer,
	FOREIGN KEY (`degree_id`) REFERENCES `degrees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `classes_degree_name_unique` ON `classes` (`degree_id`,`name`);--> statement-breakpoint
CREATE TABLE `degrees` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `degrees_name_unique` ON `degrees` (`name`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`num_teams` integer,
	`target_team_size` integer,
	`project_type` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`status` text DEFAULT 'setup',
	`admin_email` text,
	`access_code` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_access_code_unique` ON `projects` (`access_code`);--> statement-breakpoint
CREATE TABLE `responses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`student_id` integer,
	`project_id` integer,
	`skills_narrative` text NOT NULL,
	`skills_technical` text NOT NULL,
	`skills_management` text NOT NULL,
	`skills_soft` text NOT NULL,
	`prefer_with` text NOT NULL,
	`prefer_avoid` text NOT NULL,
	`comfort` text NOT NULL,
	`completed_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `students` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer,
	`name` text NOT NULL,
	`email` text,
	`has_completed` integer DEFAULT false,
	`is_excluded` integer DEFAULT false,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `team_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer,
	`student1_id` integer NOT NULL,
	`student2_id` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer,
	`team_number` integer NOT NULL,
	`member_ids` text NOT NULL,
	`justification` text NOT NULL,
	`algorithm_version` text DEFAULT 'v2',
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`hashed_password` text NOT NULL,
	`role` text DEFAULT 'admin' NOT NULL,
	`full_name` text,
	`email` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);