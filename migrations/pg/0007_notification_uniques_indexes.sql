ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_category_unique" UNIQUE ("user_id", "category");--> statement-breakpoint
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_user_token_unique" UNIQUE ("user_id", "token");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notification_batches_open_grouping_unique" ON "notification_batches" USING btree ("user_id", "grouping_key") WHERE "status" = 'open';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user_created_idx" ON "notifications" USING btree ("user_id", "created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_digest_batch_idx" ON "notifications" USING btree ((("data" ->> 'batchId'))) WHERE ("data" ->> 'batchId') IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_batches_user_grouping_status_idx" ON "notification_batches" USING btree ("user_id", "grouping_key", "status");