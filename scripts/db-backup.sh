#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?set DATABASE_URL}"
BACKUP_DIR=${1:-./backups}
RETENTION_COUNT=${BACKUP_RETENTION_COUNT:-7}
if [[ ! "$RETENTION_COUNT" =~ ^[1-9][0-9]{0,4}$ ]]; then
  echo "BACKUP_RETENTION_COUNT must be an integer between 1 and 99999." >&2
  exit 1
fi
umask 077
TIMESTAMP=$(date +%Y%m%d%H%M%S)
mkdir -p "$BACKUP_DIR"
TEMP_FILE=$(mktemp "$BACKUP_DIR/pg_backup_${TIMESTAMP}_XXXXXX.sql.gz.part")
FILE=${TEMP_FILE%.part}
trap 'rm -f -- "$TEMP_FILE"' EXIT
echo "Backing up Postgres to $FILE..."
pg_dump "$DATABASE_URL" | gzip > "$TEMP_FILE"
gzip -t "$TEMP_FILE"
test -s "$TEMP_FILE"
# Only complete, verified archives participate in restore selection and retention.
mv -- "$TEMP_FILE" "$FILE"
echo "Backup complete: $FILE"
ls -lh "$FILE"
# Preserve literal paths (including spaces) and prune only archives in this directory.
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'pg_backup_*.sql.gz' -printf '%T@ %p\0' |
  sort -zrn |
  tail -z -n +$((RETENTION_COUNT + 1)) |
  cut -z -d ' ' -f 2- |
  while IFS= read -r -d '' expired; do
    rm -f -- "$expired"
  done
echo "Retention: kept newest $RETENTION_COUNT backups in $BACKUP_DIR"
