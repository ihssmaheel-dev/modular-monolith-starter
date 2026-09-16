CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."intelligence_document_status" AS ENUM('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."intelligence_run_status" AS ENUM('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'DEAD_LETTER');--> statement-breakpoint
CREATE TABLE "intelligence_document_chunks" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"document_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"content_ciphertext" text NOT NULL,
	"content_hash" text NOT NULL,
	"embedding" vector(1536),
	"embedding_model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intelligence_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"file_id" text NOT NULL,
	"source_object_key" text NOT NULL,
	"content_hash" text,
	"parser_version" text DEFAULT 'text-v1' NOT NULL,
	"status" "intelligence_document_status" DEFAULT 'QUEUED' NOT NULL,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intelligence_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"requested_by" text NOT NULL,
	"status" "intelligence_run_status" DEFAULT 'QUEUED' NOT NULL,
	"prompt_ciphertext" text NOT NULL,
	"output_schema" jsonb,
	"max_output_tokens" integer DEFAULT 2048 NOT NULL,
	"model" text,
	"result_ciphertext" text,
	"error_code" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"estimated_cost_usd" numeric(14, 8) DEFAULT '0' NOT NULL,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "intelligence_chunks_tenant_document_idx" ON "intelligence_document_chunks" USING btree ("tenant_id","document_id");--> statement-breakpoint
CREATE INDEX "intelligence_chunks_embedding_idx" ON "intelligence_document_chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "intelligence_documents_tenant_status_idx" ON "intelligence_documents" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "intelligence_documents_file_unique_idx" ON "intelligence_documents" USING btree ("tenant_id","file_id");--> statement-breakpoint
CREATE INDEX "intelligence_runs_tenant_created_idx" ON "intelligence_runs" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "intelligence_runs_status_idx" ON "intelligence_runs" USING btree ("status","updated_at");
--> statement-breakpoint
ALTER TABLE "intelligence_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "intelligence_runs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "intelligence_documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "intelligence_documents" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "intelligence_document_chunks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "intelligence_document_chunks" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY intelligence_runs_isolation ON "intelligence_runs"
  FOR ALL
  USING (
    current_setting('app.system_scope', true) = 'true'
    OR (
      requested_by = NULLIF(current_setting('app.current_user', true), '')
      AND (
        (current_setting('app.tenancy_mode', true) = 'single' AND tenant_id = 'single-tenant')
        OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')
      )
    )
  )
  WITH CHECK (
    current_setting('app.system_scope', true) = 'true'
    OR (
      requested_by = NULLIF(current_setting('app.current_user', true), '')
      AND (
        (current_setting('app.tenancy_mode', true) = 'single' AND tenant_id = 'single-tenant')
        OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')
      )
    )
  );--> statement-breakpoint
CREATE POLICY intelligence_documents_isolation ON "intelligence_documents"
  FOR ALL
  USING (
    current_setting('app.system_scope', true) = 'true'
    OR (current_setting('app.tenancy_mode', true) = 'single' AND tenant_id = 'single-tenant')
    OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')
  )
  WITH CHECK (
    current_setting('app.system_scope', true) = 'true'
    OR (current_setting('app.tenancy_mode', true) = 'single' AND tenant_id = 'single-tenant')
    OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')
  );--> statement-breakpoint
CREATE POLICY intelligence_chunks_isolation ON "intelligence_document_chunks"
  FOR ALL
  USING (
    current_setting('app.system_scope', true) = 'true'
    OR (current_setting('app.tenancy_mode', true) = 'single' AND tenant_id = 'single-tenant')
    OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')
  )
  WITH CHECK (
    current_setting('app.system_scope', true) = 'true'
    OR (current_setting('app.tenancy_mode', true) = 'single' AND tenant_id = 'single-tenant')
    OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')
  );
