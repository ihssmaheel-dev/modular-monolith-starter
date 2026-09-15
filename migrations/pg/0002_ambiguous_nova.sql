CREATE TYPE "public"."operation_receipt_status" AS ENUM('PROCESSING', 'COMPLETED');--> statement-breakpoint
ALTER TYPE "public"."dsr_status" ADD VALUE 'PROCESSING' BEFORE 'READY';--> statement-breakpoint
ALTER TYPE "public"."dsr_status" ADD VALUE 'PARTIAL' BEFORE 'FULFILLED';--> statement-breakpoint
CREATE TABLE "operation_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"operation_id" text NOT NULL,
	"operation_type" text NOT NULL,
	"scope_id" text NOT NULL,
	"actor_id" text,
	"tenant_id" text,
	"request_hash" text NOT NULL,
	"status" "operation_receipt_status" DEFAULT 'PROCESSING' NOT NULL,
	"result" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "operation_receipt_identity_unique" UNIQUE("operation_type","scope_id","operation_id")
);
--> statement-breakpoint
ALTER TABLE "dsr_requests" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "dsr_requests" ADD COLUMN "locked_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "operation_receipt_expiry_idx" ON "operation_receipts" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "operation_receipt_actor_idx" ON "operation_receipts" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "operation_receipt_tenant_idx" ON "operation_receipts" USING btree ("tenant_id","created_at");--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dsr_export_work_idx" ON "dsr_requests" USING btree ("type","status","locked_at","created_at");
--> statement-breakpoint
ALTER TABLE operation_receipts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE operation_receipts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY operation_receipt_scope ON operation_receipts
  FOR ALL
  USING (
    current_setting('app.system_scope', true) = 'true'
    OR (
      actor_id = NULLIF(current_setting('app.current_user', true), '')
      AND (
        (current_setting('app.tenancy_mode', true) = 'single' AND tenant_id IS NULL)
        OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')
      )
    )
  )
  WITH CHECK (
    current_setting('app.system_scope', true) = 'true'
    OR (
      actor_id = NULLIF(current_setting('app.current_user', true), '')
      AND (
        (current_setting('app.tenancy_mode', true) = 'single' AND tenant_id IS NULL)
        OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')
      )
    )
  );
