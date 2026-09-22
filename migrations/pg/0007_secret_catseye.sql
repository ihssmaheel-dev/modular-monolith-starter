ALTER TABLE "files" ADD COLUMN "active_key" text;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "scan_claim_token" text;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "scan_lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "scan_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "scan_next_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "scan_failure_code" text;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "scan_source_etag" text;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "scan_source_version_id" text;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "scan_candidate_keys" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX "files_scan_due_idx" ON "files" USING btree ("status","scan_next_attempt_at","scan_lease_expires_at");