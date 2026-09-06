ALTER TABLE "files" ADD COLUMN "slot" text;--> statement-breakpoint
CREATE INDEX "files_parent_slot_idx" ON "files" USING btree ("parent_type","parent_id","slot");