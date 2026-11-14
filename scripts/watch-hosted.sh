#!/usr/bin/env bash
# Keeps the hosted demo alive: restarts the API, tunnel and Worker only when the local API or the tunnel stops answering.
# A 429 from the edge is the platform request cap, not a dead API: restarting then would drop running payments and the quote cache.
cd "$(dirname "$0")/.."
LIVE="${CART_LIVE_URL:-https://near-cart.nearbuild.workers.dev}"
PORT="${CART_API_PORT:-4391}"
while true; do
  local_ok=0; curl -fsS -m 10 "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && local_ok=1
  code=$(curl -s -m 20 -o /dev/null -w '%{http_code}' "$LIVE/api/health" 2>/dev/null || echo 000)
  if [ "$local_ok" = 0 ] || { [ "$code" != 200 ] && [ "$code" != 429 ]; }; then
    echo "$(date -u +%FT%TZ) local=$local_ok live=$code, restarting" >&2
    bash scripts/serve-hosted.sh >>/tmp/cart-watch.log 2>&1 || true
  fi
  sleep 60
done
