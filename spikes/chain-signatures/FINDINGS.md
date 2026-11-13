Claim: On NEAR mainnet, `v1.signer.derived_public_key` returns the same 32-byte Ed25519 key for the same account/path/domain on 2 consecutive reads, and a different key for a different path.
Verdict: CONFIRMED for public key derivation; signing is UNTESTED because it requires an authorized NEAR transaction and attached deposit.
Measured: Four finalized read calls took 3,341.6 ms, 3,308.7 ms, 3,509.5 ms, and 3,293.7 ms. For the public test vector `example.near` + `solana-1` + domain 1, the returned key was `ed25519:3T1x6LQ9EtChr7sn83qYsBEUN3JWDEGiRSNb1DBi2U8d` (32 decoded bytes). `solana-2` returned `ed25519:GurGknJTnz3XjMZBDaa66ccTEJHpX9qDv5fP8RW1GBTH`. Command: `python3 spikes/chain-signatures/probe.py`.
Negative case: domain 99 failed with `No such domain.` from the live contract. The probe asserts rejection, deterministic repeat output, path separation, and 32-byte key size.
Caveat: This proves public Ed25519 derivation only, using `example.near`, not the owner's NEAR account and not a Solana signature. The official contract interface identifies domain 1 as Ed25519; the docs say signing is an on-chain `sign` call that waits for MPC, and the contract source documents a 1 yoctoNEAR deposit and at least 10 Tgas. Live signing and signature verification remain unproven here.
Blocks product: no for deterministic address derivation; yes for completing the payment path until an owner-authorized mainnet sign request is exercised and the Solana signature is verified.

Sources:
- Official docs: https://docs.near.org/chain-abstraction/chain-signatures
- Contract source: https://github.com/near/mpc/blob/main/crates/contract/src/api/keys.rs (`derived_public_key` accepts path, optional predecessor, optional domain id; Ed25519 uses the Ed25519 domain key)
- Contract interface/deposit notes: https://github.com/near/mpc/blob/main/crates/contract/README.md
- Mainnet RPC: `https://rpc.mainnet.near.org`, account `v1.signer`, method `derived_public_key`, finalized reads at heights 224383506 and 224383534.
