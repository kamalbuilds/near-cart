#!/usr/bin/env bash
# CART_API_ORIGIN=https://<tunnel-host> bash scripts/deploy-worker.sh
set -euo pipefail
cd "$(dirname "$0")/.."
: "${CART_API_ORIGIN:?set CART_API_ORIGIN to the https origin that tunnels to 127.0.0.1:4174}"
npm run build
cd worker
npx -y wrangler@latest deploy --var "CART_API_ORIGIN:${CART_API_ORIGIN}"
