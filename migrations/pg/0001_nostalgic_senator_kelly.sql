CREATE TYPE "public"."dsr_status" AS ENUM('REQUESTED', 'READY', 'FULFILLED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."dsr_type" AS ENUM('EXPORT', 'ACCOUNT_ERASURE', 'ORGANIZATION_ERASURE');--> statement-breakpoint
CREATE TABLE "dsr_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"type" "dsr_type" NOT NULL,
	"status" "dsr_status" DEFAULT 'REQUESTED' NOT NULL,
	"subject_user_id" text NOT NULL,
	"tenant_id" text,
	"payload" jsonb,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "dsr_subject_idx" ON "dsr_requests" USING btree ("subject_user_id");--> statement-breakpoint
CREATE INDEX "dsr_status_expires_idx" ON "dsr_requests" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "dsr_tenant_idx" ON "dsr_requests" USING btree ("tenant_id");