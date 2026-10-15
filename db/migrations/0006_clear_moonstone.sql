CREATE TABLE `collaboration_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`respondent_id` integer NOT NULL,
	`peer_id` integer NOT NULL,
	`answer` text NOT NULL,
	`response_id` integer NOT NULL,
	`survey_id` integer NOT NULL,
	`survey_name` text NOT NULL,
	`project_id` integer,
	`academic_period` text NOT NULL,
	`questionnaire_version` text NOT NULL,
	`submitted_at` text NOT NULL,
	FOREIGN KEY (`respondent_id`) REFERENCES `student_records`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`peer_id`) REFERENCES `student_records`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`response_id`) REFERENCES `survey_responses`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`survey_id`) REFERENCES `survey_collections`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `collaboration_respondent_date` ON `collaboration_reports` (`respondent_id`,`submitted_at`);--> statement-breakpoint
CREATE INDEX `collaboration_peer_date` ON `collaboration_reports` (`peer_id`,`submitted_at`);--> statement-breakpoint
CREATE TABLE `questionnaire_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`questionnaire_id` integer NOT NULL,
	`version` integer NOT NULL,
	`questions` text NOT NULL,
	`created_at` text NOT NULL,
	`created_by` integer,
	FOREIGN KEY (`questionnaire_id`) REFERENCES `questionnaires`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `questionnaire_version_unique` ON `questionnaire_versions` (`questionnaire_id`,`version`);--> statement-breakpoint
CREATE TABLE `questionnaires` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`created_by` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `survey_collections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`version_id` integer NOT NULL,
	`class_id` integer,
	`class_name` text NOT NULL,
	`collection_year` integer NOT NULL,
	`group_ids` text NOT NULL,
	`division` text,
	`project_id` integer,
	`project_name` text,
	`origin_project_id` integer,
	`academic_period` text NOT NULL,
	`created_by` integer,
	`launched_at` text NOT NULL,
	`closed_at` text,
	FOREIGN KEY (`version_id`) REFERENCES `questionnaire_versions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `survey_participants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`survey_id` integer NOT NULL,
	`student_id` integer NOT NULL,
	`student_name` text NOT NULL,
	`snapshot` text NOT NULL,
	`added_at` text NOT NULL,
	`added_by` integer,
	FOREIGN KEY (`survey_id`) REFERENCES `survey_collections`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`student_id`) REFERENCES `student_records`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`added_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `survey_student_unique` ON `survey_participants` (`survey_id`,`student_id`);--> statement-breakpoint
CREATE TABLE `survey_responses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`survey_id` integer NOT NULL,
	`student_id` integer NOT NULL,
	`version_id` integer NOT NULL,
	`request_id` integer,
	`answers` text NOT NULL,
	`submitted_at` text NOT NULL,
	FOREIGN KEY (`survey_id`) REFERENCES `survey_collections`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`student_id`) REFERENCES `student_records`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`version_id`) REFERENCES `questionnaire_versions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`request_id`) REFERENCES `update_requests`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `survey_response_student_unique` ON `survey_responses` (`survey_id`,`student_id`);--> statement-breakpoint
ALTER TABLE `assessments` ADD `survey_id` integer REFERENCES survey_collections(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `preference_submissions` ADD `survey_id` integer REFERENCES survey_collections(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `preference_submissions` ADD `questionnaire_version` text DEFAULT 'skills-v1' NOT NULL;--> statement-breakpoint
ALTER TABLE `preference_submissions` ADD `asked_kinds` text DEFAULT '["comfort","preferWith","preferAvoid"]' NOT NULL;--> statement-breakpoint
ALTER TABLE `update_requests` ADD `survey_id` integer REFERENCES survey_collections(id) ON DELETE SET NULL;