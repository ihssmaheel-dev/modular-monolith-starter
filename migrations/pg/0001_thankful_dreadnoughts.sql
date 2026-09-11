ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verification_token_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verification_expires_at" timestamp with time zone;--> statement-breakpoint
UPDATE "users" SET "email_verified_at" = now() WHERE "email_verified_at" IS NULL;--> statement-breakpoint