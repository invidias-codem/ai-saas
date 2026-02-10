CREATE TABLE `template_executions` (
	`uuid` text PRIMARY KEY NOT NULL,
	`template_uuid` text NOT NULL,
	`api_key_id` text,
	`job_uuid` text,
	`processing_time_ms` real NOT NULL,
	`credits_charged` integer DEFAULT 0 NOT NULL,
	`success` integer NOT NULL,
	`error_message` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`template_uuid`) REFERENCES `templates`(`uuid`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`api_key_id`) REFERENCES `api_key`(`uuid`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_uuid`) REFERENCES `jobs`(`uuid`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `templates` (
	`uuid` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`tags` text NOT NULL,
	`version` text DEFAULT '1.0.0' NOT NULL,
	`template_type` text DEFAULT 'scrape' NOT NULL,
	`pricing` text NOT NULL,
	`req_options` text NOT NULL,
	`custom_handlers` text,
	`metadata` text NOT NULL,
	`variables` text,
	`created_by` text NOT NULL,
	`published_by` text,
	`reviewed_by` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`review_status` text DEFAULT 'pending' NOT NULL,
	`review_notes` text,
	`trusted` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`published_at` integer,
	`reviewed_at` integer,
	`archived_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `templates_template_id_unique` ON `templates` (`template_id`);