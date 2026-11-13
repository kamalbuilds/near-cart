#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
exec node scripts/pay.mjs "${CART_PAY_URL:-https://www.amazon.com/dp/B00FLYWNYQ}" "$@"
