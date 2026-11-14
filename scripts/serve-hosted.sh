#!/usr/bin/env bash
# Starts the Cart API, opens a public tunnel to it, and deploys the Worker pointing at the tunnel.
# cloudflared when this network reaches the Cloudflare tunnel edge (port 7844), ngrok over 443 when it does not.
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${CART_API_PORT:-4391}"
export CART_API_PORT="$PORT"
npm run build >/dev/null
lsof -tiTCP:"$PORT" -sTCP:LISTEN | xargs -r kill 2>/dev/null || true
pkill -f "cloudflared tunnel --url http://127.0.0.1:$PORT" 2>/dev/null || true
pkill -f "ngrok http $PORT" 2>/dev/null || true
nohup node server/index.mjs >/tmp/cart-api-"$PORT".log 2>&1 &
if nc -z -G 4 region1.v2.argotunnel.com 7844 2>/dev/null; then
  nohup cloudflared tunnel --url "http://127.0.0.1:$PORT" --no-autoupdate >/tmp/cart-tunnel.log 2>&1 &
  FIND='grep -o "https://[a-z0-9-]*\.trycloudflare\.com" /tmp/cart-tunnel.log'
else
  nohup ngrok http "$PORT" --log=stdout >/tmp/cart-tunnel.log 2>&1 &
  FIND='curl -s -m 3 http://127.0.0.1:4040/api/tunnels | grep -o "https://[a-z0-9.-]*\.ngrok-free\.app"'
fi
for _ in $(seq 1 40); do
  ORIGIN=$(eval "$FIND" | head -1 || true)
  [ -n "$ORIGIN" ] && break
  sleep 1
done
: "${ORIGIN:?tunnel did not start}"
CART_API_ORIGIN="$ORIGIN" bash scripts/deploy-worker.sh
