# X demo post drafts

The human edits and posts these. Attach the demo video. X counts any link as 23 characters, and the counts below assume that.

## A (257 characters)

```
Paying for Amazon with crypto usually starts with selling tokens.

Built at #NEARHackathon: Cart. A NEAR key signs a Solana USDC payment through Chain Signatures and SP3ND places the real Amazon order. About 9 seconds.

https://near-cart.earn-shield-alerts.workers.dev @NEARProtocol
```

## B (259 characters)

```
Paste an amazon.com link. Cart prints a live SP3ND quote, then pays it from a NEAR testnet account through Chain Signatures. The receipt links the NEAR tx that signed and the Solana tx that paid.

Built at #NEARHackathon. https://near-cart.earn-shield-alerts.workers.dev @NEARProtocol
```

## C (273 characters)

```
Raise the amount after Cart signs and the payment is refused by the pre-signing check, by the client and by Solana devnet.

Built at #NEARHackathon: shop Amazon from a NEAR account, funded from 231 assets on 40 chains via NEAR Intents. https://near-cart.earn-shield-alerts.workers.dev @NEARProtocol
```

## Long form

```
Shopping on Amazon from a crypto balance usually means selling tokens, moving them to an exchange and paying by card.

We built Cart at #NEARHackathon so a NEAR account pays directly. Open the page and the receipt prints a live SP3ND quote for a real Amazon item: item, shipping, tax and total in USDC. Press Pay from NEAR testnet. A NEAR key asks the Chain Signatures MPC signer for an Ed25519 signature over a Solana USDC transfer. Cart checks the transfer, memo and amount before asking, verifies the signature against the derived key, broadcasts to Solana devnet and reads the merchant balance back. About 9 seconds later the receipt is stamped Paid with the NEAR transaction that signed and the Solana transaction that paid.

Raise the amount after signing and the payment is refused by the pre-signing check, by the client and by Solana devnet. On mainnet, NEAR Intents funds the wallet from 231 assets on 40 chains.

Try it: https://near-cart.earn-shield-alerts.workers.dev

@NEARProtocol @NearBuilders
```
