Claim: On NEAR mainnet, `v1.signer.derived_public_key` returns the same 32-byte Ed25519 key for the same account/path/domain on 2 consecutive reads, and a different key for a different path.
Verdict: Mainnet derivation and testnet Ed25519 signing CONFIRMED. Owner-account signing on mainnet remains UNTESTED.
Measured: Four finalized read calls took 3,341.6 ms, 3,308.7 ms, 3,509.5 ms, and 3,293.7 ms. For the public test vector `example.near` + `solana-1` + domain 1, the returned key was `ed25519:3T1x6LQ9EtChr7sn83qYsBEUN3JWDEGiRSNb1DBi2U8d` (32 decoded bytes). `solana-2` returned `ed25519:GurGknJTnz3XjMZBDaa66ccTEJHpX9qDv5fP8RW1GBTH`. Command: `python3 spikes/chain-signatures/probe.py`.
Negative case: domain 99 failed with `No such domain.` from the live contract. The probe asserts rejection, deterministic repeat output, path separation, and 32-byte key size.
Caveat: The mainnet derivation used `example.near`, not the owner's account. A testnet account, `cart-spike-1313-kamal.testnet`, called `v1.signer-prod.testnet.sign` with `{request:{path:"solana-1",domain_id:1,payload_v2:{Eddsa:"01020304"}}}`. Transaction `3C75cxFKcWUgKHQF6vL5uYfuNDkovGjmJtenH1L18EMz` returned a 64-byte signature that verified against live testnet derived key `CjW1ffqMWHMHVtbgscCZWnMJtEaqntWQCEv7n7sctLXh`. It used 9.0 Tgas and cost 0.0008685693304597 NEAR. A call without the `request` wrapper failed with `missing field request` in transaction `EzNBcna1mfDm7dMwtTvVFuhy5HKQLemvyS2pu6f3HYfs` and cost 0.0002445145416853 NEAR. This verifies the request shape and MPC Ed25519 response on testnet, not mainnet owner approval or a Solana transaction landing.
Blocks product: no for deterministic derivation and the testnet signing call; yes for claiming an end-to-end mainnet payment until the owner's mainnet account signs a Solana transaction and it is verified on Solana.

Sources:
- Official docs: https://docs.near.org/chain-abstraction/chain-signatures
- Contract source: https://github.com/near/mpc/blob/main/crates/contract/src/api/keys.rs (`derived_public_key` accepts path, optional predecessor, optional domain id; Ed25519 uses the Ed25519 domain key)
- Contract interface/deposit notes: https://github.com/near/mpc/blob/main/crates/contract/README.md
- Mainnet RPC: `https://rpc.mainnet.near.org`, account `v1.signer`, method `derived_public_key`, finalized reads at heights 224383506 and 224383534.
