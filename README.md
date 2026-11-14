# Cart

Shop any amazon.com item and pay from any chain NEAR Intents supports. A NEAR account's Chain Signatures wallet settles the order in Solana USDC through SP3ND.

## What it does

- **Live quote.** Paste an amazon.com link or an ASIN. SP3ND verifies the price against Amazon and Cart prints it as a receipt: item, shipping, tax, total in USDC, a 30 minute expiry clock and the store's verified badge.
- **Pay from any chain.** The asset picker reads the 1Click token list (231 assets across 40 chains). Each pick shows a dry 1Click quote for the exact USDC the order needs, with the route NEAR Intents, Solana USDC, SP3ND order.
- **US shipping form.** The store delivers within the United States. Tax and the final total come from the address.
- **Order status.** Created, funded, payment prepared and checked, signed by Chain Signatures, paid on Solana with the transaction link, confirmed by SP3ND. Every step is driven by the real functions and polled to a terminal state.
- **Orders.** Every order created in the browser session is read back from SP3ND.

The SP3ND session, NEAR keys and Solana signing stay on the server. The browser only sees quotes, orders and public addresses.

## Run

```sh
npm install
npm run api        # API on 127.0.0.1:4174, serves dist/ when built
npm run dev        # Vite on 127.0.0.1:5174, proxies /api to the API
npm test           # core payment checks
npm run build
```

Payments are armed with `CART_ALLOW_PAY=1` on the API process. `/api/pay` also needs `confirm: true` and the exact order total in the request.

## Public demo

```sh
CART_API_ORIGIN=https://<tunnel-host> bash scripts/deploy-worker.sh
```

The Cloudflare Worker serves `dist/` and forwards `/api/*` to the tunnel that points at `127.0.0.1:4174`.

## CLI

`bash scripts/quote.sh <amazon-url>` prints a live quote. `scripts/pay.mjs` runs the same order to payment from the command line.
