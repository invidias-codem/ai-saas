CREATE TABLE `api_key` (
	`uuid` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`user` text,
	`name` text DEFAULT 'default',
	`is_active` integer DEFAULT true NOT NULL,
	`created_by` integer DEFAULT -1,
	`credits` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	`expires_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_key_key_unique` ON `api_key` (`key`);--> statement-breakpoint
CREATE TABLE `request_log` (
	`uuid` text PRIMARY KEY NOT NULL,
	`api_key_id` text,
	`path` text NOT NULL,
	`method` text NOT NULL,
	`status_code` integer NOT NULL,
	`processing_time_ms` real NOT NULL,
	`credits_used` integer DEFAULT 0 NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`request_payload` text,
	`request_header` text,
	`response_body` text,
	`response_header` text,
	`success` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`api_key_id`) REFERENCES `api_key`(`uuid`) ON UPDATE no action ON DELETE no action
);
