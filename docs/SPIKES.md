# Core mechanism spikes

Run on 2026-11-13 before product implementation.

## SP3ND public MCP

Claim: Anonymous requests must not receive a usable MCP tool list; the owner OAuth token is required for `tools/list` and quotes.

Verdict: Auth gate CONFIRMED. Authenticated tools/list and quote UNTESTED until the owner completes device sign-in.

Measured: `POST https://mcp.sp3nd.shop/mcp` with a valid MCP `initialize` body and no bearer token returned HTTP 401 with `invalid_token` / `Missing Authorization header`. `GET /mcp` also returned HTTP 401. The public resource metadata identifies `https://happy-dragon-88.authkit.app`, resource `https://mcp.sp3nd.shop/mcp`, scopes `openid profile offline_access`.

Negative case: The unauthenticated initialize request returned 401, not an empty or successful tool list. Reproduce with:

```sh
curl -sS -o /tmp/cart-sp3nd-negative -w 'HTTP %{http_code}\\n' -X POST https://mcp.sp3nd.shop/mcp \\
  -H 'Content-Type: application/json' \\
  -H 'Accept: application/json, text/event-stream' \\
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"cart-spike","version":"0.1.0"}}}'
```

Caveat: No owner credentials or session were used. Authenticated `tools/list`, exact quote/order schemas, and a live `payment_ready` quote cannot be recorded without the owner's OAuth session. No quote or schema is fabricated. Source: https://www.sp3nd.shop/mcp and https://www.sp3nd.shop/partner-api/docs.

Blocks product: Yes for the live SP3ND quote and order calls until the session is available; no for unrelated code.

## NEAR Chain Signatures, Solana Ed25519 derivation

Claim: On NEAR mainnet, `v1.signer.derived_public_key` returns the same 32-byte Ed25519 key for the same account/path/domain on two reads and a different key for a different path.

Verdict: Mainnet derivation and testnet Ed25519 signing CONFIRMED. Owner-account signing on mainnet remains UNTESTED.

Measured: `python3 spikes/chain-signatures/probe.py` made four finalized mainnet reads taking 520.2, 307.3, 290.1, and 678.6 ms through the fallback order `https://rpc.mainnet.near.org`, `https://free.rpc.fastnear.com`. The first endpoint returned HTTP 429 during this run, and the fallback succeeded. `example.near` + `solana-1` + domain 1 returned `ed25519:3T1x6LQ9EtChr7sn83qYsBEUN3JWDEGiRSNb1DBi2U8d` (32 decoded bytes). `solana-2` returned `ed25519:GurGknJTnz3XjMZBDaa66ccTEJHpX9qDv5fP8RW1GBTH`.

Negative case: Domain 99 was rejected by the live contract with `No such domain.` The probe asserts invalid-domain rejection, deterministic repeat output, path separation, and key length.

Signing follow-up: A faucet-funded testnet account `cart-spike-1313-kamal.testnet` called `v1.signer-prod.testnet.sign` for `solana-1`, domain 1. The live call confirmed the JSON shape `{ "request": { "path", "domain_id", "payload_v2": { "Eddsa": "<message hex>" } } }`. It signed payload `01020304`; the returned 64-byte signature verified against the account's live `derived_public_key`, `CjW1ffqMWHMHVtbgscCZWnMJtEaqntWQCEv7n7sctLXh`. Transaction `3C75cxFKcWUgKHQF6vL5uYfuNDkovGjmJtenH1L18EMz` succeeded, burned 9.0 Tgas, and cost 0.0008685693304597 NEAR. The verification output was `signatureValid: true`.

Negative case: Omitting the outer `request` field failed on testnet with `missing field request`; transaction `EzNBcna1mfDm7dMwtTvVFuhy5HKQLemvyS2pu6f3HYfs` cost 0.0002445145416853 NEAR. The Solana unit test also rejects a modified signature before serialization.

Caveat: Mainnet derivation was checked with the public test account `example.near`, not the owner's account. Testnet signing proves the request shape and MPC Ed25519 response, not the owner's mainnet approval or a Solana transaction landing.

Blocks product: No for stable derivation or Ed25519 signing mechanics; yes for claiming an end-to-end mainnet payment until the owner's mainnet account signs a Solana transaction and that transaction is verified on Solana.

Sources: https://docs.near.org/chain-abstraction/chain-signatures, https://github.com/near/mpc/blob/main/crates/contract/src/api/keys.rs, https://github.com/near/mpc/blob/main/crates/contract/README.md, NEAR mainnet RPC `https://rpc.mainnet.near.org` at finalized heights 224383506 and 224383534.
