DO $$
BEGIN
  IF EXISTS (
    SELECT lower(btrim(email))
    FROM users
    GROUP BY lower(btrim(email))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot normalize users.email: case-insensitive duplicates exist';
  END IF;
  IF EXISTS (
    SELECT lower(btrim(pending_email))
    FROM users
    WHERE pending_email IS NOT NULL
    GROUP BY lower(btrim(pending_email))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot normalize users.pending_email: case-insensitive duplicates exist';
  END IF;
END $$;--> statement-breakpoint
UPDATE "users"
SET "email" = lower(btrim("email")),
    "pending_email" = CASE
      WHEN "pending_email" IS NULL THEN NULL
      ELSE lower(btrim("pending_email"))
    END
WHERE "email" <> lower(btrim("email"))
   OR ("pending_email" IS NOT NULL AND "pending_email" <> lower(btrim("pending_email")));--> statement-breakpoint
UPDATE "users" AS pending_user
SET "pending_email" = NULL,
    "email_change_token_hash" = NULL,
    "email_change_expires_at" = NULL
WHERE "pending_email" IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM "users" AS existing_user
    WHERE existing_user."id" <> pending_user."id"
      AND existing_user."email" = pending_user."pending_email"
  );--> statement-breakpoint
DROP INDEX "users_email_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "users_pending_email_unique" ON "users" USING btree (lower("pending_email")) WHERE "users"."pending_email" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email"));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_normalized" CHECK ("users"."email" = lower(btrim("users"."email")));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_pending_email_normalized" CHECK ("users"."pending_email" IS NULL OR "users"."pending_email" = lower(btrim("users"."pending_email")));
