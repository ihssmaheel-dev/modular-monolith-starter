#!/bin/sh
set -e
TEMPLATE="/etc/nginx/templates/default.conf.template"
INSECURE_TEMPLATE="/etc/nginx/templates/insecure.conf.template"
CONF="/etc/nginx/conf.d/default.conf"
CERT="/etc/nginx/ssl/cert.pem"
KEY="/etc/nginx/ssl/key.pem"

SOURCE="${TEMPLATE}"
if [ ! -f "$SOURCE" ]; then
  SOURCE="$CONF"
fi

if [ ! -f "$CERT" ] || [ ! -f "$KEY" ]; then
  if [ "${ALLOW_INSECURE_HTTP:-false}" != "true" ]; then
    echo "TLS certs not found at $CERT / $KEY; refusing insecure production ingress." >&2
    echo "Mount certificates or explicitly set ALLOW_INSECURE_HTTP=true behind a trusted TLS terminator." >&2
    exit 1
  fi
  if [ ! -f "$INSECURE_TEMPLATE" ]; then
    echo "Missing explicit upstream-TLS configuration at $INSECURE_TEMPLATE." >&2
    exit 1
  fi
  echo "TLS certs not found - explicit upstream TLS termination mode enabled."
  cp "$INSECURE_TEMPLATE" "$CONF"
else
  echo "TLS certs found - enabling HTTPS."
  if [ "$SOURCE" != "$CONF" ]; then
    cp "$SOURCE" "$CONF"
  fi
fi

nginx -t
exec nginx -g "daemon off;"
