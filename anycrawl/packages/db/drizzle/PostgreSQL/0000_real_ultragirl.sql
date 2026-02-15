CREATE TABLE "api_key" (
	"uuid" uuid PRIMARY KEY NOT NULL,
	"user" uuid,
	"key" text NOT NULL,
	"name" text DEFAULT 'default',
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer DEFAULT -1,
	"credits" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp NOT NULL,
	"last_used_at" timestamp,
	"expires_at" timestamp,
	CONSTRAINT "api_key_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "request_log" (
	"uuid" uuid PRIMARY KEY NOT NULL,
	"api_key_id" uuid,
	"path" text NOT NULL,
	"method" text NOT NULL,
	"status_code" integer NOT NULL,
	"processing_time_ms" real NOT NULL,
	"credits_used" integer DEFAULT 0 NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"request_payload" jsonb,
	"request_header" jsonb,
	"response_body" jsonb,
	"response_header" jsonb,
	"success" boolean DEFAULT true NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "request_log" ADD CONSTRAINT "request_log_api_key_id_api_key_uuid_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_key"("uuid") ON DELETE no action ON UPDATE no action;