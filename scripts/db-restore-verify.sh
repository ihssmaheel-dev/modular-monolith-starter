#!/usr/bin/env bash
set -euo pipefail

: "${RESTORE_VERIFY_DATABASE_URL:?set RESTORE_VERIFY_DATABASE_URL to a disposable database}"
FILE=${1:?usage: db-restore-verify.sh <backup.sql.gz>}

if [[ "${RESTORE_VERIFY_ALLOW_RESET:-}" != "true" ]]; then
  echo "Refusing restore verification: set RESTORE_VERIFY_ALLOW_RESET=true for a disposable database."
  exit 1
fi
if [[ ! -f "$FILE" ]]; then
  echo "Backup file does not exist: $FILE"
  exit 1
fi
gzip -t "$FILE"

TARGET_DATABASE=$(psql "$RESTORE_VERIFY_DATABASE_URL" -Atqc "SELECT current_database()")
case "$TARGET_DATABASE" in
  *restore*|*scratch*|*test*) ;;
  *)
    echo "Refusing restore verification: target database must contain restore, scratch, or test."
    exit 1
    ;;
esac

echo "Resetting disposable restore target: $TARGET_DATABASE"
psql "$RESTORE_VERIFY_DATABASE_URL" -v ON_ERROR_STOP=1 -c \
  "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

echo "Restoring and verifying: $FILE"
gunzip -c "$FILE" | psql "$RESTORE_VERIFY_DATABASE_URL" --set ON_ERROR_STOP=1 --single-transaction
psql "$RESTORE_VERIFY_DATABASE_URL" --set ON_ERROR_STOP=1 -Atqc "SELECT 1" >/dev/null

echo "Applying the matching release's forward migrations"
DATABASE_URL="$RESTORE_VERIFY_DATABASE_URL" \
DB_DIRECT_URL="$RESTORE_VERIFY_DATABASE_URL" \
pnpm db:migrate

TABLE_COUNT=$(psql "$RESTORE_VERIFY_DATABASE_URL" -Atqc \
  "SELECT count(*) FROM pg_catalog.pg_class WHERE relkind IN ('r', 'p') AND relnamespace = 'public'::regnamespace")
if [[ "$TABLE_COUNT" -lt 1 ]]; then
  echo "Restore verification failed: no public tables were restored."
  exit 1
fi

REQUIRED_TABLES=(users organizations memberships audit_logs outbox_events dsr_requests operation_receipts)
for TABLE in "${REQUIRED_TABLES[@]}"; do
  PRESENT=$(psql "$RESTORE_VERIFY_DATABASE_URL" -Atqc "SELECT to_regclass('public.$TABLE') IS NOT NULL")
  if [[ "$PRESENT" != "t" ]]; then
    echo "Restore verification failed: required table $TABLE is missing."
    exit 1
  fi
done

RLS_MISSING=$(psql "$RESTORE_VERIFY_DATABASE_URL" -Atqc \
  "SELECT count(*) FROM pg_class
   WHERE relnamespace = 'public'::regnamespace
     AND relname IN ('audit_logs','outbox_events','notes','files','memberships','invitations',
       'organizations','dsr_requests','notifications','notification_preferences','device_tokens',
       'notification_batches','notification_delivery_intents','operation_receipts')
     AND (NOT relrowsecurity OR NOT relforcerowsecurity)")
if [[ "$RLS_MISSING" -ne 0 ]]; then
  echo "Restore verification failed: $RLS_MISSING protected tables lack forced RLS."
  exit 1
fi

POLICY_COUNT=$(psql "$RESTORE_VERIFY_DATABASE_URL" -Atqc \
  "SELECT count(*) FROM pg_policies WHERE schemaname = 'public'")
if [[ "$POLICY_COUNT" -lt 14 ]]; then
  echo "Restore verification failed: expected RLS policies are missing."
  exit 1
fi

AUDIT_TRIGGER=$(psql "$RESTORE_VERIFY_DATABASE_URL" -Atqc \
  "SELECT count(*) FROM pg_trigger WHERE tgname = 'audit_logs_immutable' AND NOT tgisinternal")
if [[ "$AUDIT_TRIGGER" -ne 1 ]]; then
  echo "Restore verification failed: immutable audit trigger is missing."
  exit 1
fi

MIGRATION_COUNT=$(psql "$RESTORE_VERIFY_DATABASE_URL" -Atqc \
  "SELECT count(*) FROM drizzle.__drizzle_migrations")
if [[ "$MIGRATION_COUNT" -lt 1 ]]; then
  echo "Restore verification failed: migration journal is empty."
  exit 1
fi

echo "Restore verification passed: database=$TARGET_DATABASE public_tables=$TABLE_COUNT migrations=$MIGRATION_COUNT policies=$POLICY_COUNT"
