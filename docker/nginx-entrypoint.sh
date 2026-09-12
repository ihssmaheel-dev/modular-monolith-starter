#!/bin/sh
set -e
TEMPLATE="/etc/nginx/templates/default.conf.template"
CONF="/etc/nginx/conf.d/default.conf"
CERT="/etc/nginx/ssl/cert.pem"
KEY="/etc/nginx/ssl/key.pem"

SOURCE="${TEMPLATE}"
if [ ! -f "$SOURCE" ]; then
  SOURCE="$CONF"
fi

if [ ! -f "$CERT" ] || [ ! -f "$KEY" ]; then
  echo "TLS certs not found at $CERT / $KEY - starting plain HTTP only."
  if grep -q "# HTTPS server" "$SOURCE"; then
    awk '/# HTTPS server/{exit} {print}' "$SOURCE" > "$CONF"
  elif [ "$SOURCE" != "$CONF" ]; then
    cp "$SOURCE" "$CONF"
  fi
else
  echo "TLS certs found - enabling HTTPS."
  if [ "$SOURCE" != "$CONF" ]; then
    cp "$SOURCE" "$CONF"
  fi
fi

nginx -t
exec nginx -g "daemon off;"
