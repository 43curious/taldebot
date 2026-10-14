ALTER TABLE `student_records` ADD `term_time_town` text;--> statement-breakpoint
ALTER TABLE `student_records` ADD `term_time_town_source` text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE `student_records` ADD `term_time_town_updated_at` text;