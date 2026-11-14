#!/usr/bin/env bash
# Keeps the hosted demo alive: if the live API stops answering, restart the API and tunnel and redeploy the Worker.
cd "$(dirname "$0")/.."
LIVE="${CART_LIVE_URL:-https://near-cart.earn-shield-alerts.workers.dev}"
while true; do
  if ! curl -fsS -m 20 "$LIVE/api/health" >/dev/null 2>&1; then
    echo "$(date -u +%FT%TZ) live API down, restarting" >&2
    bash scripts/serve-hosted.sh >>/tmp/cart-watch.log 2>&1 || true
  fi
  sleep 60
done
