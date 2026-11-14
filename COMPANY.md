# Cart

Shop any amazon.com item and pay from a NEAR account. A NEAR key controls a Solana USDC wallet through Chain Signatures, SP3ND prices and places the real Amazon order, and NEAR Intents funds the wallet from 231 assets on 40 chains.

## Who uses it

Anyone who holds crypto on NEAR, or on any chain NEAR Intents reaches, and wants a real Amazon order without a card, an exchange withdrawal or a Solana wallet.

## How it works

1. Paste an amazon.com link or an ASIN. SP3ND returns a live quote: item, shipping, tax and total in USDC, held for 30 minutes.
2. Press pay. In the Testnet network the NEAR testnet account `cart-spike-1313-kamal.testnet` asks `v1.signer-prod.testnet` to sign a Solana devnet USDC transfer for exactly the quote total. Cart checks the transfer, memo and amount before the signature request, verifies the returned Ed25519 signature against the derived key, broadcasts to devnet, then reads the merchant balance back from the chain.
3. In the Mainnet network the same signing path pays SP3ND's USDC address, and NEAR Intents swaps any supported asset into the exact USDC the order needs.

## Evidence

| Fact | Evidence |
|---|---|
| A cold visitor pays a live Amazon quote on two chains in 9.1 s with nothing installed | NEAR [FuLvRaYix...HfoS](https://testnet.nearblocks.io/txns/FuLvRaYixAYo36myyeZczp5iPbgfYFkDDXeYCmVyHfoS), Solana devnet [4DTDZ1Bm...1yyE](https://explorer.solana.com/tx/4DTDZ1BmtLpMsBGo5FNGzfrS9k27esj5htTi8vRDyWVRMyr2mzo1L1N9E5vMBNwCrD2uvMfygAhwJJbUKPgi1yyE?cluster=devnet) |
| The merchant balance rises by exactly the quote total | `node scripts/testnet-run.mjs B00006IE7J` prints `Merchant balance rose by exactly 5.57 USDC` |
| A forged amount is refused before signing, by the client and by Solana | `node scripts/testnet-tamper.mjs`, NEAR [6kGsM4rf...EvaG](https://testnet.nearblocks.io/txns/6kGsM4rf2AxFt4cP6EQKrvGEBu2SQPVcoqU5ywh3EvaG) |
| One NEAR account owns one Solana address on testnet and mainnet | `CjW1ffqMWHMHVtbgscCZWnMJtEaqntWQCEv7n7sctLXh`, signing [3C75cxFK...H1L18EMz](https://testnet.nearblocks.io/txns/3C75cxFKcWUgKHQF6vL5uYfuNDkovGjmJtenH1L18EMz) |
| An AI judge can verify everything in one command | `npm run judge` checks the live page, the live API and both evidence transactions |

## Try it in 60 seconds

Open https://near-cart.earn-shield-alerts.workers.dev, wait for the receipt to print, press **Pay 5.57 USDC from NEAR testnet**, then open the two transaction links.

## Why NEAR

Chain Signatures lets one NEAR account hold and spend a Solana address, so the buyer needs no Solana key. NEAR Intents funds the wallet from whatever the buyer already holds.

## Team and build window

`kamalbuilds`, commits from 2026-11-13 to 2026-11-14 (`git log --reverse --format='%ad %an' --date=short`).
