CREATE TABLE
	`job_results` (
		`uuid` text PRIMARY KEY NOT NULL,
		`job_uuid` text NOT NULL,
		`url` text NOT NULL,
		`data` text,
		`status` text NOT NULL,
		`created_at` integer NOT NULL,
		`updated_at` integer NOT NULL,
		FOREIGN KEY (`job_uuid`) REFERENCES `jobs` (`uuid`) ON UPDATE no action ON DELETE no action
	);

--> statement-breakpoint
CREATE TABLE
	`jobs` (
		`uuid` text PRIMARY KEY NOT NULL,
		`job_id` text NOT NULL,
		`job_type` text NOT NULL,
		`job_queue_name` text NOT NULL,
		`job_expire_at` integer NOT NULL,
		`url` text NOT NULL,
		`payload` text,
		`api_key_id` text,
		`total` integer DEFAULT 0 NOT NULL,
		`completed` integer DEFAULT 0 NOT NULL,
		`failed` integer DEFAULT 0 NOT NULL,
		`credits_used` integer DEFAULT 0 NOT NULL,
		`origin` text NOT NULL,
		`status` text NOT NULL,
		`is_success` integer DEFAULT false NOT NULL,
		`error_message` text,
		`created_at` integer NOT NULL,
		`updated_at` integer NOT NULL,
		FOREIGN KEY (`api_key_id`) REFERENCES `api_key` (`uuid`) ON UPDATE no action ON DELETE no action
	);