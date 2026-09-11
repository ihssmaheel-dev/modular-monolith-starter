ALTER TABLE "users" ADD COLUMN "pending_email" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_change_token_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_change_expires_at" timestamp with time zone;