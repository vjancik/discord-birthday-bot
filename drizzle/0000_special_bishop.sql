CREATE TABLE `birthdays` (
	`user_id` text PRIMARY KEY NOT NULL,
	`day` integer NOT NULL,
	`month` integer NOT NULL,
	`year` integer,
	`timezone` text NOT NULL,
	`next_trigger_at_utc` integer NOT NULL,
	`last_posted_at_utc` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_birthdays_next_trigger` ON `birthdays` (`next_trigger_at_utc`);