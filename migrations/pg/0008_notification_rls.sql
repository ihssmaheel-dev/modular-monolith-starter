ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;--> statement-breakpoint
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
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE notification_preferences FORCE ROW LEVEL SECURITY;--> statement-breakpoint
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
ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE device_tokens FORCE ROW LEVEL SECURITY;--> statement-breakpoint
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
ALTER TABLE notification_batches ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE notification_batches FORCE ROW LEVEL SECURITY;--> statement-breakpoint
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