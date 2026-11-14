// Must-fail run. The NEAR signer signs a 5.57 USDC payment, then the amount is raised to 9.99 before broadcast.
// Solana devnet must refuse it: the Chain Signatures signature covers the original message only.
import { Connection } from '@solana/web3.js';
import { attachEd25519Signature } from './cart-core.mjs';
import { derivedSolanaAddress, signWithNearAccount } from './chain-sig.mjs';
import { DEVNET, assertTestnetPayment, buildTestnetPayment, memoFor } from './testnet.mjs';
import { NETWORK, ACCOUNT } from './sp3nd-login.mjs';

const connection = new Connection(DEVNET.rpcs[0], 'confirmed');
const payer = await derivedSolanaAddress(NETWORK, ACCOUNT);
const { blockhash } = await connection.getLatestBlockhash('confirmed');
const memo = memoFor('tamper-demo', 'B00006IE7J');
const honest = buildTestnetPayment({ payer, amountAtomic: 5_570_000n, memo, blockhash });
assertTestnetPayment(honest, { payer, amountAtomic: 5_570_000n, memo });

const forged = buildTestnetPayment({ payer, amountAtomic: 9_990_000n, memo, blockhash });
try { assertTestnetPayment(forged, { payer, amountAtomic: 5_570_000n, memo }); console.log('FAIL: pre-sign check accepted a forged amount'); process.exit(1); }
catch (error) { console.log(`pre-sign check refused the forged payment: ${error.message}`); }

const { signature, txHash } = await signWithNearAccount({ network: NETWORK, accountId: ACCOUNT, message: honest.serializeMessage() });
console.log(`NEAR testnet signed the honest message: https://testnet.nearblocks.io/txns/${txHash}`);
try { attachEd25519Signature(forged, signature, payer); console.log('FAIL: forged transaction accepted the signature'); process.exit(1); }
catch (error) { console.log(`client refused to attach it: ${error.message}`); }

forged.serializeMessage();
forged.signatures.find((entry) => entry.publicKey.toBase58() === payer).signature = Buffer.from(signature);
try {
  const sig = await connection.sendRawTransaction(forged.serialize({ requireAllSignatures: true, verifySignatures: false }), { skipPreflight: false });
  console.log(`FAIL: devnet accepted the forged transaction ${sig}`); process.exit(1);
} catch (error) {
  console.log(`Solana devnet refused the forged transaction: ${String(error.message).split('\n')[0].slice(0, 200)}`);
}
