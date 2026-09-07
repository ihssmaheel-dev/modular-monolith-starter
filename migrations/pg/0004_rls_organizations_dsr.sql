ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;--> statement-breakpoint
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
ALTER TABLE dsr_requests ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE dsr_requests FORCE ROW LEVEL SECURITY;--> statement-breakpoint
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
  );