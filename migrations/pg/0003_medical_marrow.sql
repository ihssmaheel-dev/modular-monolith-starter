ALTER TABLE "users" ADD COLUMN "avatar_file_id" text;--> statement-breakpoint
CREATE INDEX "users_avatar_file_id_idx" ON "users" USING btree ("avatar_file_id");