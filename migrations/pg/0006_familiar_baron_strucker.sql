CREATE TYPE "public"."notification_batch_status" AS ENUM('open', 'delivered');--> statement-breakpoint
CREATE TYPE "public"."digest_cadence" AS ENUM('realtime', 'hourly', 'daily');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('inApp', 'email', 'push');--> statement-breakpoint
CREATE TABLE "device_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"provider" text DEFAULT 'expo' NOT NULL,
	"token" text NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"tenant_id" text,
	"type" text NOT NULL,
	"grouping_key" text NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "notification_batch_status" DEFAULT 'open' NOT NULL,
	"window_ends_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"category" text NOT NULL,
	"in_app" boolean DEFAULT true NOT NULL,
	"email" boolean DEFAULT true NOT NULL,
	"push" boolean DEFAULT true NOT NULL,
	"digest_cadence" "digest_cadence" DEFAULT 'realtime' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"tenant_id" text,
	"type" text NOT NULL,
	"category" text NOT NULL,
	"title_key" text NOT NULL,
	"title_params" jsonb,
	"data" jsonb,
	"channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "device_tokens_user_idx" ON "device_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "device_tokens_token_idx" ON "device_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "notification_batches_open_idx" ON "notification_batches" USING btree ("status","window_ends_at");--> statement-breakpoint
CREATE INDEX "notification_batches_user_idx" ON "notification_batches" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notification_preferences_user_idx" ON "notification_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_read_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "notifications_tenant_idx" ON "notifications" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "notifications_type_idx" ON "notifications" USING btree ("type");