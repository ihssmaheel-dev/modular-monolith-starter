-- ============================================================================
-- Modular Monolith Starter — Initial Consolidated Migration (0000_initial)
-- ============================================================================
-- Unified baseline schema:
-- 1. PostgreSQL ENUMs & custom types
-- 2. Core tables, constraints & default values
-- 3. Performance, partial, and unique indexes
-- 4. Audit immutability triggers and retention functions
-- 5. Multi-tenant and subject Row-Level Security (RLS) isolation policies
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ENUMS & TYPES
-- ----------------------------------------------------------------------------
CREATE TYPE "public"."audit_action" AS ENUM('CREATE', 'UPDATE', 'DELETE');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED', 'DEAD_LETTER');--> statement-breakpoint
CREATE TYPE "public"."file_parent_type" AS ENUM('note', 'user', 'general');--> statement-breakpoint
CREATE TYPE "public"."file_status" AS ENUM('pending', 'uploading', 'scanning', 'uploaded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."notification_batch_status" AS ENUM('open', 'delivered');--> statement-breakpoint
CREATE TYPE "public"."digest_cadence" AS ENUM('realtime', 'hourly', 'daily');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('inApp', 'email', 'push');--> statement-breakpoint
CREATE TYPE "public"."dsr_status" AS ENUM('REQUESTED', 'READY', 'FULFILLED', 'EXPIRED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."dsr_type" AS ENUM('EXPORT', 'ACCOUNT_ERASURE', 'ORGANIZATION_ERASURE');--> statement-breakpoint
CREATE TYPE "public"."invitation_role" AS ENUM('admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'user');--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 2. CORE TABLES
-- ----------------------------------------------------------------------------
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"collection_name" text NOT NULL,
	"document_id" text NOT NULL,
	"action" "audit_action" NOT NULL,
	"actor_id" text,
	"tenant_id" text,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "outbox_events" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text,
	"topic" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "outbox_status" DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"next_attempt_at" timestamp with time zone,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "files" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text,
	"key" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"file_size" integer NOT NULL,
	"bucket" text NOT NULL,
	"parent_id" text,
	"parent_type" "file_parent_type" DEFAULT 'general' NOT NULL,
	"slot" text,
	"uploaded_by" text NOT NULL,
	"status" "file_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);--> statement-breakpoint

CREATE TABLE "notes" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);--> statement-breakpoint

CREATE TABLE "device_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"provider" text DEFAULT 'expo' NOT NULL,
	"token" text NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_tokens_user_token_unique" UNIQUE("user_id","token")
);--> statement-breakpoint

CREATE TABLE "notification_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"tenant_id" text,
	"type" text NOT NULL,
	"grouping_key" text NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "notification_batch_status" DEFAULT 'open' NOT NULL,
	"window_ends_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "notification_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"category" text NOT NULL,
	"in_app" boolean DEFAULT true NOT NULL,
	"email" boolean DEFAULT true NOT NULL,
	"push" boolean DEFAULT true NOT NULL,
	"digest_cadence" "digest_cadence" DEFAULT 'realtime' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_user_category_unique" UNIQUE("user_id","category")
);--> statement-breakpoint

CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"tenant_id" text,
	"type" text NOT NULL,
	"category" text NOT NULL,
	"title_key" text NOT NULL,
	"title_params" jsonb,
	"data" jsonb,
	"channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"delivered_channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "dsr_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"type" "dsr_type" NOT NULL,
	"status" "dsr_status" DEFAULT 'REQUESTED' NOT NULL,
	"subject_user_id" text NOT NULL,
	"tenant_id" text,
	"payload" jsonb,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"email" text NOT NULL,
	"role" "invitation_role" NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" text NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_by" text,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"user_email" text NOT NULL,
	"user_name" text NOT NULL,
	"role" "membership_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);--> statement-breakpoint

CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"password_reset_token_hash" text,
	"password_reset_expires_at" timestamp with time zone,
	"email_verified_at" timestamp with time zone,
	"email_verification_token_hash" text,
	"email_verification_expires_at" timestamp with time zone,
	"pending_email" text,
	"email_change_token_hash" text,
	"email_change_expires_at" timestamp with time zone,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"avatar_file_id" text,
	"auth_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 3. INDEXES & CONSTRAINTS
-- ----------------------------------------------------------------------------
CREATE INDEX "audit_tenant_created_idx" ON "audit_logs" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_collection_created_idx" ON "audit_logs" USING btree ("collection_name","created_at");--> statement-breakpoint
CREATE INDEX "audit_document_id_idx" ON "audit_logs" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "outbox_status_next_attempt_idx" ON "outbox_events" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "outbox_status_locked_idx" ON "outbox_events" USING btree ("status","locked_at");--> statement-breakpoint
CREATE INDEX "outbox_status_updated_idx" ON "outbox_events" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "outbox_tenant_id_idx" ON "outbox_events" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "outbox_topic_idx" ON "outbox_events" USING btree ("topic");--> statement-breakpoint
CREATE INDEX "files_tenant_parent_idx" ON "files" USING btree ("tenant_id","parent_type","parent_id");--> statement-breakpoint
CREATE INDEX "files_parent_slot_idx" ON "files" USING btree ("parent_type","parent_id","slot");--> statement-breakpoint
CREATE INDEX "files_uploaded_by_idx" ON "files" USING btree ("uploaded_by");--> statement-breakpoint
CREATE INDEX "files_status_created_idx" ON "files" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "files_uploader_active_idx" ON "files" USING btree ("uploaded_by") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "files_key_idx" ON "files" USING btree ("key");--> statement-breakpoint
CREATE INDEX "files_deleted_at_idx" ON "files" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "notes_tenant_id_idx" ON "notes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "notes_created_by_idx" ON "notes" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "notes_deleted_at_idx" ON "notes" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "notes_tenant_deleted_idx" ON "notes" USING btree ("tenant_id","deleted_at");--> statement-breakpoint
CREATE INDEX "device_tokens_user_idx" ON "device_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "device_tokens_token_idx" ON "device_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "notification_batches_open_idx" ON "notification_batches" USING btree ("status","window_ends_at");--> statement-breakpoint
CREATE INDEX "notification_batches_user_idx" ON "notification_batches" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notification_batches_user_grouping_status_idx" ON "notification_batches" USING btree ("user_id","grouping_key","status");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_batches_open_grouping_unique" ON "notification_batches" USING btree ("user_id","grouping_key") WHERE "status" = 'open';--> statement-breakpoint
CREATE INDEX "notification_preferences_user_idx" ON "notification_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_read_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_digest_batch_idx" ON "notifications" USING btree ((("data" ->> 'batchId'))) WHERE (("data" ->> 'batchId')) IS NOT NULL;--> statement-breakpoint
CREATE INDEX "notifications_tenant_idx" ON "notifications" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "notifications_type_idx" ON "notifications" USING btree ("type");--> statement-breakpoint
CREATE INDEX "dsr_subject_idx" ON "dsr_requests" USING btree ("subject_user_id");--> statement-breakpoint
CREATE INDEX "dsr_status_expires_idx" ON "dsr_requests" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "dsr_tenant_idx" ON "dsr_requests" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "invitations_tenant_email_status_idx" ON "invitations" USING btree ("tenant_id","email","status");--> statement-breakpoint
CREATE INDEX "invitations_token_hash_idx" ON "invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "invitations_expires_at_idx" ON "invitations" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_tenant_user_unique" ON "memberships" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "memberships_tenant_id_idx" ON "memberships" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "memberships_user_id_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_unique" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_avatar_file_id_idx" ON "users" USING btree ("avatar_file_id");--> statement-breakpoint
CREATE INDEX "users_deleted_at_idx" ON "users" USING btree ("deleted_at");--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 4. HARDENING FUNCTIONS & IMMUTABILITY TRIGGERS
-- ----------------------------------------------------------------------------
-- Revoke direct UPDATE / DELETE on audit logs from public
REVOKE UPDATE, DELETE ON audit_logs FROM PUBLIC;--> statement-breakpoint

-- Allow only controlled retention function to remove expired audit rows
CREATE OR REPLACE FUNCTION prevent_audit_update() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND current_setting('app.system_scope', true) = 'true'
     AND current_setting('app.audit_retention_purge', true) = 'true' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit_logs is immutable: updates and deletes are forbidden';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

DROP TRIGGER IF EXISTS audit_logs_immutable ON audit_logs;--> statement-breakpoint
CREATE TRIGGER audit_logs_immutable BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION prevent_audit_update();--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.purge_audit_logs_older_than(days_to_keep INT) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INT;
BEGIN
  IF days_to_keep < 30 THEN
    RAISE EXCEPTION 'Retention period cannot be less than 30 days';
  END IF;

  PERFORM set_config('app.system_scope', 'true', true);
  PERFORM set_config('app.audit_retention_purge', 'true', true);
  DELETE FROM public.audit_logs
  WHERE created_at < NOW() - make_interval(days => days_to_keep);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.purge_audit_logs_older_than(INT) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.purge_audit_logs_older_than(INT) TO CURRENT_USER;--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 5. ROW-LEVEL SECURITY (RLS) & ISOLATION POLICIES
-- ----------------------------------------------------------------------------
-- Enable and force RLS on all tenant-owned and subject-isolated tables
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE outbox_events FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE notes FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE files ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE files FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE dsr_requests ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE dsr_requests FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE notification_preferences FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE device_tokens FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE notification_batches ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE notification_batches FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- RLS Policies
DROP POLICY IF EXISTS audit_system_scope ON audit_logs;--> statement-breakpoint
CREATE POLICY audit_system_scope ON audit_logs
  FOR ALL
  USING (
    current_setting('app.system_scope', true) = 'true'
    OR (current_setting('app.tenancy_mode', true) = 'single' AND tenant_id IS NULL)
    OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')
  )
  WITH CHECK (
    current_setting('app.system_scope', true) = 'true'
    OR (current_setting('app.tenancy_mode', true) = 'single' AND tenant_id IS NULL)
    OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')
  );--> statement-breakpoint

DROP POLICY IF EXISTS outbox_system_scope ON outbox_events;--> statement-breakpoint
CREATE POLICY outbox_system_scope ON outbox_events
  FOR ALL
  USING (
    current_setting('app.system_scope', true) = 'true'
    OR (current_setting('app.tenancy_mode', true) = 'single' AND tenant_id IS NULL)
    OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')
  )
  WITH CHECK (
    current_setting('app.system_scope', true) = 'true'
    OR (current_setting('app.tenancy_mode', true) = 'single' AND tenant_id IS NULL)
    OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')
  );--> statement-breakpoint

DROP POLICY IF EXISTS tenant_isolation_notes ON notes;--> statement-breakpoint
CREATE POLICY tenant_isolation_notes ON notes
  FOR ALL
  USING (
    current_setting('app.system_scope', true) = 'true'
    OR (current_setting('app.tenancy_mode', true) = 'single' AND tenant_id IS NULL)
    OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')
  )
  WITH CHECK (
    current_setting('app.system_scope', true) = 'true'
    OR (current_setting('app.tenancy_mode', true) = 'single' AND tenant_id IS NULL)
    OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')
  );--> statement-breakpoint

DROP POLICY IF EXISTS tenant_isolation_files ON files;--> statement-breakpoint
CREATE POLICY tenant_isolation_files ON files
  FOR ALL
  USING (
    current_setting('app.system_scope', true) = 'true'
    OR (current_setting('app.tenancy_mode', true) = 'single' AND tenant_id IS NULL)
    OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')
  )
  WITH CHECK (
    current_setting('app.system_scope', true) = 'true'
    OR (current_setting('app.tenancy_mode', true) = 'single' AND tenant_id IS NULL)
    OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')
  );--> statement-breakpoint

DROP POLICY IF EXISTS tenant_isolation_memberships ON memberships;--> statement-breakpoint
CREATE POLICY tenant_isolation_memberships ON memberships
  FOR ALL
  USING (
    current_setting('app.system_scope', true) = 'true'
    OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')
    OR user_id = NULLIF(current_setting('app.current_user', true), '')
  )
  WITH CHECK (
    current_setting('app.system_scope', true) = 'true'
    OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')
  );--> statement-breakpoint

DROP POLICY IF EXISTS tenant_isolation_invitations ON invitations;--> statement-breakpoint
CREATE POLICY tenant_isolation_invitations ON invitations
  FOR ALL
  USING (
    current_setting('app.system_scope', true) = 'true'
    OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')
    OR lower(email) = lower(NULLIF(current_setting('app.current_user_email', true), ''))
  )
  WITH CHECK (
    current_setting('app.system_scope', true) = 'true'
    OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')
  );--> statement-breakpoint

DROP POLICY IF EXISTS tenant_isolation_organizations ON organizations;--> statement-breakpoint
CREATE POLICY tenant_isolation_organizations ON organizations
  FOR ALL
  USING (
    current_setting('app.system_scope', true) = 'true'
    OR id = NULLIF(current_setting('app.current_tenant', true), '')
    OR EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.tenant_id = organizations.id
        AND m.user_id = NULLIF(current_setting('app.current_user', true), '')
    )
  )
  WITH CHECK (
    current_setting('app.system_scope', true) = 'true'
    OR NULLIF(current_setting('app.current_user', true), '') IS NOT NULL
  );--> statement-breakpoint

DROP POLICY IF EXISTS subject_isolation_dsr_requests ON dsr_requests;--> statement-breakpoint
CREATE POLICY subject_isolation_dsr_requests ON dsr_requests
  FOR ALL
  USING (
    current_setting('app.system_scope', true) = 'true'
    OR subject_user_id = NULLIF(current_setting('app.current_user', true), '')
  )
  WITH CHECK (
    current_setting('app.system_scope', true) = 'true'
    OR subject_user_id = NULLIF(current_setting('app.current_user', true), '')
  );--> statement-breakpoint

DROP POLICY IF EXISTS subject_isolation_notifications ON notifications;--> statement-breakpoint
CREATE POLICY subject_isolation_notifications ON notifications
  FOR ALL
  USING (
    current_setting('app.system_scope', true) = 'true'
    OR user_id = NULLIF(current_setting('app.current_user', true), '')
  )
  WITH CHECK (
    current_setting('app.system_scope', true) = 'true'
    OR user_id = NULLIF(current_setting('app.current_user', true), '')
  );--> statement-breakpoint

DROP POLICY IF EXISTS subject_isolation_notification_preferences ON notification_preferences;--> statement-breakpoint
CREATE POLICY subject_isolation_notification_preferences ON notification_preferences
  FOR ALL
  USING (
    current_setting('app.system_scope', true) = 'true'
    OR user_id = NULLIF(current_setting('app.current_user', true), '')
  )
  WITH CHECK (
    current_setting('app.system_scope', true) = 'true'
    OR user_id = NULLIF(current_setting('app.current_user', true), '')
  );--> statement-breakpoint

DROP POLICY IF EXISTS subject_isolation_device_tokens ON device_tokens;--> statement-breakpoint
CREATE POLICY subject_isolation_device_tokens ON device_tokens
  FOR ALL
  USING (
    current_setting('app.system_scope', true) = 'true'
    OR user_id = NULLIF(current_setting('app.current_user', true), '')
  )
  WITH CHECK (
    current_setting('app.system_scope', true) = 'true'
    OR user_id = NULLIF(current_setting('app.current_user', true), '')
  );--> statement-breakpoint

DROP POLICY IF EXISTS subject_isolation_notification_batches ON notification_batches;--> statement-breakpoint
CREATE POLICY subject_isolation_notification_batches ON notification_batches
  FOR ALL
  USING (
    current_setting('app.system_scope', true) = 'true'
    OR user_id = NULLIF(current_setting('app.current_user', true), '')
  )
  WITH CHECK (
    current_setting('app.system_scope', true) = 'true'
    OR user_id = NULLIF(current_setting('app.current_user', true), '')
  );
