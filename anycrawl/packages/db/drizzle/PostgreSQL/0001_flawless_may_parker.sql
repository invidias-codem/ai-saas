CREATE TABLE "job_results" (
	"uuid" uuid PRIMARY KEY NOT NULL,
	"job_uuid" uuid,
	"url" text NOT NULL,
	"data" jsonb,
	"status" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"uuid" uuid PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"job_type" text NOT NULL,
	"job_queue_name" text NOT NULL,
	"job_expire_at" timestamp NOT NULL,
	"url" text NOT NULL,
	"payload" jsonb,
	"api_key_id" uuid,
	"total" integer DEFAULT 0 NOT NULL,
	"completed" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"credits_used" integer DEFAULT 0 NOT NULL,
	"origin" text NOT NULL,
	"status" text NOT NULL,
	"is_success" boolean DEFAULT false NOT NULL,
	"error_message" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_results" ADD CONSTRAINT "job_results_job_uuid_jobs_uuid_fk" FOREIGN KEY ("job_uuid") REFERENCES "public"."jobs"("uuid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_api_key_id_api_key_uuid_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_key"("uuid") ON DELETE no action ON UPDATE no action;