CREATE INDEX IF NOT EXISTS "files_tenant_active_idx" ON "files" USING btree ("tenant_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.purge_audit_logs_older_than(days_to_keep INT) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_deleted INT := 0;
  batch_deleted INT := 0;
  batch_limit INT := 1000;
  max_batches INT := 10;
  i INT := 0;
BEGIN
  IF days_to_keep < 30 THEN
    RAISE EXCEPTION 'Retention period cannot be less than 30 days';
  END IF;

  PERFORM set_config('app.system_scope', 'true', true);
  PERFORM set_config('app.audit_retention_purge', 'true', true);

  WHILE i < max_batches LOOP
    DELETE FROM public.audit_logs
    WHERE id IN (
      SELECT id FROM public.audit_logs
      WHERE created_at < NOW() - make_interval(days => days_to_keep)
      ORDER BY created_at ASC
      LIMIT batch_limit
    );
    GET DIAGNOSTICS batch_deleted = ROW_COUNT;
    total_deleted := total_deleted + batch_deleted;
    IF batch_deleted < batch_limit THEN
      EXIT;
    END IF;
    i := i + 1;
  END LOOP;

  RETURN total_deleted;
END;
$$;