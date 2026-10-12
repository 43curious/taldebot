CREATE TABLE `assessments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`student_id` integer NOT NULL,
	`data` text NOT NULL,
	`questionnaire_version` text DEFAULT 'skills-v1' NOT NULL,
	`source` text NOT NULL,
	`project_id` integer,
	`project_name` text,
	`academic_period` text NOT NULL,
	`request_id` integer,
	`legacy_response_id` integer,
	`legacy_participant_id` integer,
	`raw_legacy_data` text,
	`submitted_at` text,
	`withdrawn_at` text,
	FOREIGN KEY (`student_id`) REFERENCES `student_records`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`request_id`) REFERENCES `update_requests`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assessments_legacy_response_id_unique` ON `assessments` (`legacy_response_id`);--> statement-breakpoint
CREATE INDEX `assessment_student_date` ON `assessments` (`student_id`,`submitted_at`);--> statement-breakpoint
CREATE TABLE `assignment_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`assignment_id` integer NOT NULL,
	`student_id` integer NOT NULL,
	`team_number` integer NOT NULL,
	FOREIGN KEY (`assignment_id`) REFERENCES `confirmed_assignments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `student_records`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assignment_student_unique` ON `assignment_members` (`assignment_id`,`student_id`);--> statement-breakpoint
CREATE TABLE `confirmed_assignments` (
	`origin_project_id` integer NOT NULL,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer,
	`project_name` text NOT NULL,
	`revision` integer NOT NULL,
	`draft_id` integer,
	`algorithm_version` text NOT NULL,
	`allocation` text NOT NULL,
	`input_snapshot` text,
	`confirmed_by` integer,
	`confirmed_at` text NOT NULL,
	`superseded_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`draft_id`) REFERENCES `team_drafts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`confirmed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assignment_project_revision_unique` ON `confirmed_assignments` (`project_id`,`revision`);--> statement-breakpoint
CREATE TABLE `enrollments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`student_id` integer NOT NULL,
	`class_id` integer,
	`class_name` text NOT NULL,
	`degree_name` text,
	`year` integer NOT NULL,
	`academic_period` text NOT NULL,
	`started_at` text,
	`ended_at` text,
	`source` text NOT NULL,
	`roster_snapshot` text,
	FOREIGN KEY (`student_id`) REFERENCES `student_records`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `enrollment_student_current` ON `enrollments` (`student_id`,`ended_at`);--> statement-breakpoint
CREATE INDEX `enrollment_class_current` ON `enrollments` (`class_id`,`ended_at`);--> statement-breakpoint
CREATE TABLE `identity_reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_type` text NOT NULL,
	`source_id` integer NOT NULL,
	`provisional_student_id` integer,
	`reason` text NOT NULL,
	`candidates` text NOT NULL,
	`raw_source` text,
	`resolved_student_id` integer,
	`resolved_by` integer,
	`resolved_at` text,
	FOREIGN KEY (`provisional_student_id`) REFERENCES `student_records`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`resolved_student_id`) REFERENCES `student_records`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`resolved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `identity_review_source_unique` ON `identity_reviews` (`source_type`,`source_id`);--> statement-breakpoint
CREATE TABLE `pairing_restrictions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`student1_id` integer NOT NULL,
	`student2_id` integer NOT NULL,
	`created_by` integer,
	`scope` text NOT NULL,
	`project_id` integer,
	`academic_period` text NOT NULL,
	`reason` text,
	`created_at` text NOT NULL,
	`review_at` text NOT NULL,
	`withdrawn_at` text,
	FOREIGN KEY (`student1_id`) REFERENCES `student_records`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`student2_id`) REFERENCES `student_records`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `preference_choices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`submission_id` integer NOT NULL,
	`target_student_id` integer NOT NULL,
	`kind` text NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `preference_submissions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_student_id`) REFERENCES `student_records`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `preference_choice_unique` ON `preference_choices` (`submission_id`,`target_student_id`,`kind`);--> statement-breakpoint
CREATE TABLE `preference_submissions` (
	`complete` integer DEFAULT true NOT NULL,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`student_id` integer NOT NULL,
	`scope` text NOT NULL,
	`academic_period` text NOT NULL,
	`project_id` integer,
	`project_name` text,
	`source` text NOT NULL,
	`request_id` integer,
	`legacy_response_id` integer,
	`legacy_participant_id` integer,
	`raw_legacy_data` text,
	`unresolved_targets` text DEFAULT '[]' NOT NULL,
	`submitted_at` text,
	`withdrawn_at` text,
	FOREIGN KEY (`student_id`) REFERENCES `student_records`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`request_id`) REFERENCES `update_requests`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `preference_submissions_legacy_response_id_unique` ON `preference_submissions` (`legacy_response_id`);--> statement-breakpoint
CREATE INDEX `preferences_student_scope_date` ON `preference_submissions` (`student_id`,`scope`,`submitted_at`);--> statement-breakpoint
CREATE TABLE `student_emails` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`student_id` integer NOT NULL,
	`email` text NOT NULL,
	`source` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`student_id`) REFERENCES `student_records`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `student_email_lookup` ON `student_emails` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `student_email_alias_unique` ON `student_emails` (`student_id`,`email`);--> statement-breakpoint
CREATE TABLE `student_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`created_by` integer,
	`needs_review` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `teacher_responsibilities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`degree_id` integer,
	`class_id` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`degree_id`) REFERENCES `degrees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "one_responsibility_scope" CHECK(("teacher_responsibilities"."degree_id" IS NULL) <> ("teacher_responsibilities"."class_id" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `teacher_degree_unique` ON `teacher_responsibilities` (`user_id`,`degree_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `teacher_class_unique` ON `teacher_responsibilities` (`user_id`,`class_id`);--> statement-breakpoint
CREATE TABLE `team_drafts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer,
	`project_name` text NOT NULL,
	`algorithm_version` text NOT NULL,
	`allocation` text NOT NULL,
	`input_snapshot` text,
	`source` text NOT NULL,
	`created_by` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `update_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`student_id` integer NOT NULL,
	`issued_by` integer,
	`project_id` integer,
	`participant_id` integer,
	`class_id` integer,
	`scope` text NOT NULL,
	`academic_period` text NOT NULL,
	`assessment_asked` integer NOT NULL,
	`preferences_asked` integer NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`revoked_at` text,
	FOREIGN KEY (`student_id`) REFERENCES `student_records`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`issued_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`participant_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `update_requests_token_hash_unique` ON `update_requests` (`token_hash`);--> statement-breakpoint
ALTER TABLE `class_members` ADD `student_record_id` integer REFERENCES student_records(id);--> statement-breakpoint
ALTER TABLE `class_members` ADD `notes_author_id` integer REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `projects` ADD `owner_id` integer REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `projects` ADD `academic_period` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `history_mode` text DEFAULT 'balanced' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `archived_at` text;--> statement-breakpoint
ALTER TABLE `students` ADD `student_record_id` integer REFERENCES student_records(id);--> statement-breakpoint
ALTER TABLE `teams` ADD `draft_id` integer REFERENCES team_drafts(id);