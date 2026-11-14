#!/usr/bin/env bash
# Starts the Cart API, opens a Cloudflare quick tunnel to it, and deploys the Worker pointing at the tunnel.
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${CART_API_PORT:-4391}"
export CART_API_PORT="$PORT"
npm run build >/dev/null
lsof -tiTCP:"$PORT" -sTCP:LISTEN | xargs -r kill 2>/dev/null || true
nohup node server/index.mjs >/tmp/cart-api-"$PORT".log 2>&1 &
nohup cloudflared tunnel --url "http://127.0.0.1:$PORT" --no-autoupdate >/tmp/cart-tunnel.log 2>&1 &
for _ in $(seq 1 40); do
  ORIGIN=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' /tmp/cart-tunnel.log | head -1 || true)
  [ -n "$ORIGIN" ] && break
  sleep 1
done
: "${ORIGIN:?tunnel did not start}"
CART_API_ORIGIN="$ORIGIN" bash scripts/deploy-worker.sh
