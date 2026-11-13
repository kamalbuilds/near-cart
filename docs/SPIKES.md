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

Verdict: CONFIRMED for public key derivation. Signing is UNTESTED because it requires an authorized NEAR transaction and attached deposit.

Measured: `python3 spikes/chain-signatures/probe.py` made four finalized mainnet reads taking 3343.8, 3300.0, 3386.4, and 3286.4 ms. `example.near` + `solana-1` + domain 1 returned `ed25519:3T1x6LQ9EtChr7sn83qYsBEUN3JWDEGiRSNb1DBi2U8d` (32 decoded bytes). `solana-2` returned `ed25519:GurGknJTnz3XjMZBDaa66ccTEJHpX9qDv5fP8RW1GBTH`.

Negative case: Domain 99 was rejected by the live contract with `No such domain.` The probe asserts invalid-domain rejection, deterministic repeat output, path separation, and key length.

Caveat: Derivation was checked with the public test account `example.near`, not the owner's account. This does not prove a Solana transaction signature. The contract's `sign` call and signature verification require an owner-approved mainnet transaction and remain untested.

Blocks product: No for stable address derivation; yes for claiming an end-to-end payment until the owner's signature request is exercised and verified on Solana.

Sources: https://docs.near.org/chain-abstraction/chain-signatures, https://github.com/near/mpc/blob/main/crates/contract/src/api/keys.rs, https://github.com/near/mpc/blob/main/crates/contract/README.md, NEAR mainnet RPC `https://rpc.mainnet.near.org` at finalized heights 224383506 and 224383534.
