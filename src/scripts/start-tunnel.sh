#!/usr/bin/env bash
# Run cloudflared, wait for the URL, update .env's ACTIVITY_PUBLIC_BASE_URL,
# and print the host to paste into the Discord developer portal URL Mapping.
set -euo pipefail

if ! command -v cloudflared >/dev/null 2>&1; then
    echo "cloudflared not installed. https://developers.cloudflare.com/cloudflared/install/" >&2
    exit 1
fi

# shellcheck disable=SC1091
[ -f .env ] && set -a && . ./.env && set +a
PORT="${WEB_SERVER_PORT:-5858}"

LOG="$(mktemp -t kmq-tunnel-XXXXXX.log)"
trap 'rm -f "$LOG"' EXIT

echo "Starting cloudflared on port $PORT..." >&2
cloudflared tunnel --url "http://localhost:$PORT" >"$LOG" 2>&1 &
TUNNEL_PID=$!
trap 'kill $TUNNEL_PID 2>/dev/null || true; rm -f "$LOG"' EXIT INT TERM

URL=""
for _ in $(seq 1 60); do
    URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | head -1 || true)"
    if [ -n "$URL" ]; then break; fi
    sleep 1
done

if [ -z "$URL" ]; then
    echo "Failed to obtain tunnel URL within 60s. Log:" >&2
    cat "$LOG" >&2
    exit 1
fi

HOST="${URL#https://}"

if [ -f .env ]; then
    if grep -q '^ACTIVITY_PUBLIC_BASE_URL=' .env; then
        # GNU/BSD sed compatibility
        sed -i.bak "s|^ACTIVITY_PUBLIC_BASE_URL=.*|ACTIVITY_PUBLIC_BASE_URL=$URL|" .env && rm -f .env.bak
    else
        printf '\nACTIVITY_PUBLIC_BASE_URL=%s\n' "$URL" >> .env
    fi
fi

cat >&2 <<EOF
============================================================
KMQ tunnel ready.

  Tunnel URL : $URL
  .env       : ACTIVITY_PUBLIC_BASE_URL updated

Paste this into Discord developer portal → Activities → URL Mappings:
  Prefix : /
  Target : $HOST

Then OAuth2 → Redirects: $URL

Leave this terminal running. Ctrl+C to stop the tunnel.
============================================================
EOF

wait "$TUNNEL_PID"
