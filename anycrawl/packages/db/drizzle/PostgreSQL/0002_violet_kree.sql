CREATE TABLE "template_executions" (
	"uuid" uuid PRIMARY KEY NOT NULL,
	"template_uuid" uuid NOT NULL,
	"api_key_id" uuid,
	"job_uuid" uuid,
	"processing_time_ms" real NOT NULL,
	"credits_charged" integer DEFAULT 0 NOT NULL,
	"success" boolean NOT NULL,
	"error_message" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"uuid" uuid PRIMARY KEY NOT NULL,
	"template_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"tags" jsonb NOT NULL,
	"version" text DEFAULT '1.0.0' NOT NULL,
	"template_type" text DEFAULT 'scrape' NOT NULL,
	"pricing" jsonb NOT NULL,
	"req_options" jsonb NOT NULL,
	"custom_handlers" jsonb,
	"metadata" jsonb NOT NULL,
	"variables" jsonb,
	"created_by" text NOT NULL,
	"published_by" text,
	"reviewed_by" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"review_status" text DEFAULT 'pending' NOT NULL,
	"review_notes" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"published_at" timestamp,
	"reviewed_at" timestamp,
	"archived_at" timestamp,
	CONSTRAINT "templates_template_id_unique" UNIQUE("template_id")
);
--> statement-breakpoint
ALTER TABLE "template_executions" ADD CONSTRAINT "template_executions_template_uuid_templates_uuid_fk" FOREIGN KEY ("template_uuid") REFERENCES "public"."templates"("uuid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_executions" ADD CONSTRAINT "template_executions_api_key_id_api_key_uuid_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_key"("uuid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_executions" ADD CONSTRAINT "template_executions_job_uuid_jobs_uuid_fk" FOREIGN KEY ("job_uuid") REFERENCES "public"."jobs"("uuid") ON DELETE no action ON UPDATE no action;