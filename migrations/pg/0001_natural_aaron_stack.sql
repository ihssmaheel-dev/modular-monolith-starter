CREATE TYPE "public"."notification_delivery_status" AS ENUM('pending', 'processing', 'delivered', 'dead');--> statement-breakpoint
CREATE TABLE "notification_delivery_intents" (
	"id" text PRIMARY KEY NOT NULL,
	"notification_id" text NOT NULL,
	"user_id" text NOT NULL,
	"tenant_id" text,
	"channel" "notification_channel" NOT NULL,
	"status" "notification_delivery_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"locked_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_delivery_channel_unique" UNIQUE("notification_id","channel")
);
--> statement-breakpoint
ALTER TABLE "notification_delivery_intents" ADD CONSTRAINT "notification_delivery_intents_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_delivery_pending_idx" ON "notification_delivery_intents" USING btree ("status","next_attempt_at","created_at");--> statement-breakpoint
CREATE INDEX "notification_delivery_user_idx" ON "notification_delivery_intents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notification_delivery_tenant_idx" ON "notification_delivery_intents" USING btree ("tenant_id");
--> statement-breakpoint
ALTER TABLE notification_delivery_intents ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notification_delivery_intents FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY subject_isolation_notification_delivery ON notification_delivery_intents
  FOR ALL
  USING (
    current_setting('app.system_scope', true) = 'true'
    OR user_id = NULLIF(current_setting('app.current_user', true), '')
  )
  WITH CHECK (
    current_setting('app.system_scope', true) = 'true'
    OR user_id = NULLIF(current_setting('app.current_user', true), '')
  );
