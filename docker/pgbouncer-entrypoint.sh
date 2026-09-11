#!/bin/sh
# Generates PgBouncer config from the environment, then runs it in the foreground.
# Mirrors docker/nginx-entrypoint.sh: generate-then-exec, fail fast on bad input.
# Only POSIX sh is used (no bashisms): this runs on the image's default shell.
set -e

: "${PGBOUNCER_DB_HOST:?set PGBOUNCER_DB_HOST (database hostname for the pooler)}"
: "${PGBOUNCER_DB_USER:?set PGBOUNCER_DB_USER}"
: "${PGBOUNCER_DB_PASSWORD:?set PGBOUNCER_DB_PASSWORD (avoid double-quote and backslash characters)}"
: "${PGBOUNCER_DB_NAME:?set PGBOUNCER_DB_NAME}"

case "$PGBOUNCER_DB_PASSWORD" in
*\"* | *\\*)
  echo "pgbouncer-entrypoint: password must not contain double-quote or backslash characters" >&2
  exit 1
  ;;
esac

if ! mkdir -p "${PGBOUNCER_CONFIG_DIR:-/etc/pgbouncer}" 2>/dev/null || [ ! -w "${PGBOUNCER_CONFIG_DIR:-/etc/pgbouncer}" ]; then
  echo "pgbouncer-entrypoint: ${PGBOUNCER_CONFIG_DIR:-/etc/pgbouncer} is not writable" >&2
  exit 1
fi

CONFIG_DIR="${PGBOUNCER_CONFIG_DIR:-/etc/pgbouncer}"
cat > "${CONFIG_DIR}/pgbouncer.ini" <<EOF
[databases]
* = host=${PGBOUNCER_DB_HOST} port=${PGBOUNCER_DB_PORT:-5432} dbname=${PGBOUNCER_DB_NAME}

[pgbouncer]
listen_addr = *
listen_port = 6432
auth_type = scram-sha-256
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction
max_client_conn = ${PGBOUNCER_MAX_CLIENT_CONN:-200}
default_pool_size = ${PGBOUNCER_POOL_SIZE:-25}
reserve_pool_size = ${PGBOUNCER_RESERVE_POOL:-5}
reserve_pool_timeout = 3
max_prepared_statements = ${PGBOUNCER_MAX_PREPARED_STATEMENTS:-100}
server_idle_timeout = 30
ignore_startup_parameters = extra_float_digits,application_name
EOF

printf '"%s" "%s"\n' "$PGBOUNCER_DB_USER" "$PGBOUNCER_DB_PASSWORD" > "${CONFIG_DIR}/userlist.txt"
chmod 600 "${CONFIG_DIR}/userlist.txt"

echo "pgbouncer-entrypoint: pool_mode=transaction host=${PGBOUNCER_DB_HOST} db=${PGBOUNCER_DB_NAME}"
exec pgbouncer "${CONFIG_DIR}/pgbouncer.ini"
