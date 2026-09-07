CREATE INDEX IF NOT EXISTS "outbox_status_locked_idx" ON "outbox_events" USING btree ("status","locked_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbox_status_updated_idx" ON "outbox_events" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "files_status_created_idx" ON "files" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "files_uploader_active_idx" ON "files" USING btree ("uploaded_by") WHERE "deleted_at" IS NULL;