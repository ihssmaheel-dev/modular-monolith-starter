#!/bin/sh
# Generates PgBouncer config from the environment, then runs it in the foreground.
# Mirrors docker/nginx-entrypoint.sh: generate-then-exec, fail fast on bad input.
# Only POSIX sh is used (no bashisms): this runs on the image's default shell.
set -e

: "${PGBOUNCER_DB_HOST:?set PGBOUNCER_DB_HOST (database hostname for the pooler)}"
: "${PGBOUNCER_DB_USER:?set PGBOUNCER_DB_USER}"
: "${PGBOUNCER_DB_PASSWORD:?set PGBOUNCER_DB_PASSWORD (avoid double-quote and backslash characters)}"
: "${PGBOUNCER_DB_NAME:?set PGBOUNCER_DB_NAME}"

CLIENT_TLS_MODE="${PGBOUNCER_CLIENT_TLS_MODE:-disable}"
SERVER_TLS_MODE="${PGBOUNCER_SERVER_TLS_MODE:-disable}"
case "$CLIENT_TLS_MODE" in disable | allow | prefer | require | verify-ca | verify-full) ;; *)
  echo "pgbouncer-entrypoint: invalid PGBOUNCER_CLIENT_TLS_MODE" >&2
  exit 1
  ;;
esac
case "$SERVER_TLS_MODE" in disable | allow | prefer | require | verify-ca | verify-full) ;; *)
  echo "pgbouncer-entrypoint: invalid PGBOUNCER_SERVER_TLS_MODE" >&2
  exit 1
  ;;
esac

require_file() {
  variable_name="$1"
  file_path="$2"
  if [ -z "$file_path" ] || [ ! -r "$file_path" ]; then
    echo "pgbouncer-entrypoint: $variable_name must point to a readable file" >&2
    exit 1
  fi
}

if [ "$CLIENT_TLS_MODE" != "disable" ]; then
  require_file PGBOUNCER_CLIENT_TLS_CERT_FILE "${PGBOUNCER_CLIENT_TLS_CERT_FILE:-}"
  require_file PGBOUNCER_CLIENT_TLS_KEY_FILE "${PGBOUNCER_CLIENT_TLS_KEY_FILE:-}"
fi
if [ "$CLIENT_TLS_MODE" = "verify-ca" ] || [ "$CLIENT_TLS_MODE" = "verify-full" ]; then
  require_file PGBOUNCER_CLIENT_TLS_CA_FILE "${PGBOUNCER_CLIENT_TLS_CA_FILE:-}"
fi
if [ "$SERVER_TLS_MODE" = "verify-ca" ] || [ "$SERVER_TLS_MODE" = "verify-full" ]; then
  require_file PGBOUNCER_SERVER_TLS_CA_FILE "${PGBOUNCER_SERVER_TLS_CA_FILE:-}"
fi

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
auth_file = ${CONFIG_DIR}/userlist.txt
pool_mode = transaction
max_client_conn = ${PGBOUNCER_MAX_CLIENT_CONN:-200}
default_pool_size = ${PGBOUNCER_POOL_SIZE:-25}
reserve_pool_size = ${PGBOUNCER_RESERVE_POOL:-5}
reserve_pool_timeout = 3
max_prepared_statements = ${PGBOUNCER_MAX_PREPARED_STATEMENTS:-100}
server_idle_timeout = 30
ignore_startup_parameters = extra_float_digits,application_name
client_tls_sslmode = ${CLIENT_TLS_MODE}
server_tls_sslmode = ${SERVER_TLS_MODE}
EOF

if [ "$CLIENT_TLS_MODE" != "disable" ]; then
  {
    echo "client_tls_cert_file = ${PGBOUNCER_CLIENT_TLS_CERT_FILE}"
    echo "client_tls_key_file = ${PGBOUNCER_CLIENT_TLS_KEY_FILE}"
  } >> "${CONFIG_DIR}/pgbouncer.ini"
fi
if [ -n "${PGBOUNCER_CLIENT_TLS_CA_FILE:-}" ]; then
  echo "client_tls_ca_file = ${PGBOUNCER_CLIENT_TLS_CA_FILE}" >> "${CONFIG_DIR}/pgbouncer.ini"
fi
if [ -n "${PGBOUNCER_SERVER_TLS_CA_FILE:-}" ]; then
  echo "server_tls_ca_file = ${PGBOUNCER_SERVER_TLS_CA_FILE}" >> "${CONFIG_DIR}/pgbouncer.ini"
fi
if [ -n "${PGBOUNCER_SERVER_TLS_CERT_FILE:-}" ]; then
  require_file PGBOUNCER_SERVER_TLS_CERT_FILE "${PGBOUNCER_SERVER_TLS_CERT_FILE}"
  echo "server_tls_cert_file = ${PGBOUNCER_SERVER_TLS_CERT_FILE}" >> "${CONFIG_DIR}/pgbouncer.ini"
fi
if [ -n "${PGBOUNCER_SERVER_TLS_KEY_FILE:-}" ]; then
  require_file PGBOUNCER_SERVER_TLS_KEY_FILE "${PGBOUNCER_SERVER_TLS_KEY_FILE}"
  echo "server_tls_key_file = ${PGBOUNCER_SERVER_TLS_KEY_FILE}" >> "${CONFIG_DIR}/pgbouncer.ini"
fi

printf '"%s" "%s"\n' "$PGBOUNCER_DB_USER" "$PGBOUNCER_DB_PASSWORD" > "${CONFIG_DIR}/userlist.txt"
chmod 600 "${CONFIG_DIR}/userlist.txt"

echo "pgbouncer-entrypoint: pool_mode=transaction client_tls=${CLIENT_TLS_MODE} server_tls=${SERVER_TLS_MODE} host=${PGBOUNCER_DB_HOST} db=${PGBOUNCER_DB_NAME}"
exec pgbouncer "${CONFIG_DIR}/pgbouncer.ini"
