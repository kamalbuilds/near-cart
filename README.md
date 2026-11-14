# Cart

[![judge](https://github.com/CryptoInnovators/near-cart/actions/workflows/judge.yml/badge.svg)](https://github.com/CryptoInnovators/near-cart/actions/workflows/judge.yml)

Shop any amazon.com item and pay from a NEAR account. A NEAR key controls a Solana USDC wallet through Chain Signatures, SP3ND prices and places the real Amazon order, and NEAR Intents funds the wallet from 231 assets on 40 chains.

Live: https://near-cart.nearbuild.workers.dev

## Do this, see that

1. Open the live URL. The receipt prints a live SP3ND quote for a real Amazon item within seconds.
2. Pick any asset under Pay from any chain (ETH is preselected) and watch it turn into the exact USDC total with a live 1Click route. Press **Pay ... USDC on testnet** (the button carries the quote total). The receipt prints line by line as each chain answers, and about 9 seconds later it is stamped Paid with two links: the NEAR testnet transaction where Chain Signatures signed, and the Solana devnet transaction that paid. The merchant balance is read back from devnet and equals the quote to the micro-USDC. **Post result on X** opens a prefilled post carrying both transaction links.
3. Paste any amazon.com link or ASIN, or press Instant Pot, and pay again. Each run is a fresh pair of transactions.
4. Switch to **Mainnet** for the funded flow: US shipping form, a 1Click asset picker with a dry route quote, and the SP3ND order paid in Solana USDC.

`npm run judge` checks the live page, the live API, the unit checks and both evidence transactions. See `docs/EVIDENCE.md` and `COMPANY.md`.

## What it does

- **Live quote.** SP3ND verifies the price against Amazon. Cart prints item, shipping, tax and total in USDC with a 30 minute clock.
- **Pay on testnet with nothing installed.** A server-side NEAR testnet account requests the signature from `v1.signer-prod.testnet`. Cart checks the transfer, memo and amount before asking, verifies the Ed25519 signature against the derived key, broadcasts to Solana devnet and reads the merchant balance back.
- **Refuses forgeries.** A payment whose amount changes after signing is refused by the pre-signing check, by the client and by Solana devnet (`node scripts/testnet-tamper.mjs`).
- **Pay from any chain on mainnet.** The asset picker reads the 1Click token list. Each pick shows a dry quote for the exact USDC the order needs.
- **Order status.** Created, funded, prepared and checked, signed, paid with the transaction link, confirmed by SP3ND, each polled to a terminal state.

## Run

```sh
npm install
npm run api        # API on 127.0.0.1:4174, serves dist/ when built (CART_API_PORT to change)
npm run dev        # Vite on 127.0.0.1:5174, proxies /api to the API
npm test           # payment and signing checks
npm run judge      # live site and evidence checks
```

Mainnet payments are armed with `CART_ALLOW_PAY=1` and need `confirm: true` plus the exact order total.

## Host

```sh
bash scripts/serve-hosted.sh
```

Starts the API, opens a Cloudflare tunnel to it and deploys the Worker that serves `dist/` and forwards `/api/*`.
