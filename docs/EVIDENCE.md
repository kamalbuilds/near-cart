# Evidence

Every row is a transaction or a command anyone can rerun. Testnet only: NEAR testnet and Solana devnet.

| Fact | Evidence |
|---|---|
| A NEAR testnet account pays for an Amazon quote through a Solana wallet it controls, in 9.1 s, from the live page with cleared storage | NEAR [FuLvRaYixAYo36myyeZczp5iPbgfYFkDDXeYCmVyHfoS](https://testnet.nearblocks.io/txns/FuLvRaYixAYo36myyeZczp5iPbgfYFkDDXeYCmVyHfoS), Solana devnet [4DTDZ1Bm...1yyE](https://explorer.solana.com/tx/4DTDZ1BmtLpMsBGo5FNGzfrS9k27esj5htTi8vRDyWVRMyr2mzo1L1N9E5vMBNwCrD2uvMfygAhwJJbUKPgi1yyE?cluster=devnet) |
| Same flow from the command line, 11.2 s, 5.57 USDC read back from the merchant balance | NEAR [Cz4jLpQSAHrAJYDpr5yWvPWDvp1yyXVmdiMttZJm4j1k](https://testnet.nearblocks.io/txns/Cz4jLpQSAHrAJYDpr5yWvPWDvp1yyXVmdiMttZJm4j1k), Solana devnet [4kDQRiE2...KXqYA](https://explorer.solana.com/tx/4kDQRiE2YE88f9vaCyEJoMw6GhCrxF6jSKC1Jo7SQ19hkGac77d4YTHBre9XZMCjeYSdCr45aDWWVQREuWKSXYqA?cluster=devnet); `node scripts/testnet-run.mjs B00006IE7J` |
| A payment whose amount was raised after signing is refused by the pre-signing check, by the client, and by Solana devnet | `node scripts/testnet-tamper.mjs`; the honest message was signed in NEAR [6kGsM4rf2AxFt4cP6EQKrvGEBu2SQPVcoqU5ywh3EvaG](https://testnet.nearblocks.io/txns/6kGsM4rf2AxFt4cP6EQKrvGEBu2SQPVcoqU5ywh3EvaG) and the forged transfer ended `Solana devnet refused the forged transaction: Simulation failed.` |
| The Chain Signatures wallet is one stable Solana address for the NEAR account on testnet and mainnet | `CjW1ffqMWHMHVtbgscCZWnMJtEaqntWQCEv7n7sctLXh`, NEAR testnet signing [3C75cxFKcWUgKHQF6vL5uYfuNDkovGjmJtenH1L18EMz](https://testnet.nearblocks.io/txns/3C75cxFKcWUgKHQF6vL5uYfuNDkovGjmJtenH1L18EMz) |
| SP3ND signs Cart in with that wallet and prices real Amazon items | `bash scripts/quote.sh https://www.amazon.com/dp/B00FLYWNYQ` |
| The payment builder refuses a wrong amount, wrong merchant, wrong memo, extra instruction | `npm test` (19 checks; the amount check goes red when its comparison is removed) |
| Devnet test USDC mint | [DxsNPGU5...Jk8Zi](https://explorer.solana.com/address/DxsNPGU5bUcGA6XoaBuszLLBnGmd8vSvMcXzcCQJk8Zi?cluster=devnet) |
| Mainnet orders settle in Solana USDC through the same signing path, with the NEAR Intents token list as the funding source | `bash scripts/pay-live.sh` after funding the wallet |
