import test from 'node:test';
import assert from 'node:assert/strict';
import { Keypair, PublicKey, TransactionInstruction } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { readNearSignature, signRequestArgs } from './near-sign.mjs';
import {
  DERIVATION_PATH,
  DOMAIN_ED25519,
  MEMO_PROGRAM_ID,
  assertSp3ndPayable,
  buildSp3ndTransaction,
  attachEd25519Signature,
  assertPreparedPayment,
  prepareSp3ndTransaction,
  toUsdcAtomicUnits,
} from './cart-core.mjs';

test('uses the stable Solana Ed25519 derivation', () => {
  assert.equal(DERIVATION_PATH, 'solana-1');
  assert.equal(DOMAIN_ED25519, 1);
});

test('builds the documented TransferChecked then exact memo bytes', () => {
  const buyer = Keypair.generate().publicKey;
  const recipient = Keypair.generate().publicKey;
  const memo = 'SP3ND Order: ORD-123';
  const tx = buildSp3ndTransaction({ buyerAddress: buyer.toBase58(), recipientAddress: recipient.toBase58(), amount: '10.810001', memo, blockhash: Keypair.generate().publicKey.toBase58() });
  const [transfer, memoInstruction] = tx.instructions;
  assert.equal(transfer.programId.toBase58(), 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  assert.equal(transfer.data.readBigUInt64LE(1), 10810001n);
  assert.equal(transfer.data[0], 12);
  assert.equal(transfer.data[9], 6);
  assert.equal(memoInstruction.programId.toBase58(), MEMO_PROGRAM_ID.toBase58());
  assert.deepEqual(memoInstruction.keys, []);
  assert.deepEqual(memoInstruction.data, Buffer.from(memo, 'utf8'));
});

test('rejects total mismatch before a signature can be attached', () => {
  assert.throws(() => prepareSp3ndTransaction({ order: { payment_ready: true, total_usdc: '10.81', currency: 'USDC', memo: 'SP3ND Order: ORD-1', recipient_address: Keypair.generate().publicKey.toBase58() }, expectedTotal: '10.82', buyerAddress: Keypair.generate().publicKey.toBase58(), blockhash: Keypair.generate().publicKey.toBase58() }), /refusing to sign/);
});

test('refuses payment unless SP3ND sets payment_ready true', () => {
  assert.throws(() => assertSp3ndPayable({ payment_ready: false, total_usdc: '10.81', currency: 'USDC', memo: 'SP3ND Order: ORD-1', recipient_address: Keypair.generate().publicKey.toBase58() }, '10.81'), /not payment ready/);
});

test('converts decimal USDC without floating point', () => {
  assert.equal(toUsdcAtomicUnits('10.810001'), 10810001n);
  assert.throws(() => toUsdcAtomicUnits('10.8100001'), /Invalid USDC/);
});

test('attaches only a valid signature over this exact Solana message', () => {
  const signer = Keypair.generate();
  const tx = buildSp3ndTransaction({ buyerAddress: signer.publicKey.toBase58(), recipientAddress: Keypair.generate().publicKey.toBase58(), amount: '10.81', memo: 'SP3ND Order: ORD-SIGN', blockhash: Keypair.generate().publicKey.toBase58() });
  const message = tx.serializeMessage();
  const signature = nacl.sign.detached(message, signer.secretKey);
  const raw = attachEd25519Signature(tx, signature, signer.publicKey.toBase58());
  assert.ok(raw.length > message.length);

  const other = Keypair.generate().publicKey;
  assert.throws(() => attachEd25519Signature(tx, signature, other.toBase58()), /not the transaction signer/);
  assert.throws(() => attachEd25519Signature(tx, new Uint8Array(64), signer.publicKey.toBase58()), /does not match/);
});

test('builds the request wrapper proven by the live NEAR testnet signer', () => {
  assert.deepEqual(signRequestArgs(Uint8Array.from([1, 2, 3, 4])), {
    request: { path: 'solana-1', domain_id: 1, payload_v2: { Eddsa: '01020304' } },
  });
  assert.throws(() => signRequestArgs(new Uint8Array()), /message is empty/);
});

test('reads and verifies an Ed25519 signature returned by the live NEAR testnet signer', () => {
  const signature = [218,56,41,149,41,229,156,52,208,243,34,50,211,141,34,97,149,123,89,31,57,72,216,225,156,215,85,245,195,121,85,94,34,101,199,213,208,52,167,92,242,101,200,50,29,1,159,204,191,244,224,213,68,11,247,31,188,6,8,71,5,21,175,1];
  const encoded = Buffer.from(JSON.stringify({ scheme: 'Ed25519', signature })).toString('base64');
  const returned = readNearSignature({ receipts_outcome: [{ outcome: { status: { SuccessValue: encoded } } }] });
  assert.equal(returned.length, 64);
  assert.equal(nacl.sign.detached.verify(Uint8Array.from([1,2,3,4]), returned, new PublicKey('CjW1ffqMWHMHVtbgscCZWnMJtEaqntWQCEv7n7sctLXh').toBytes()), true);
});

test('accepts only the exact payment SP3ND quoted and rejects every tampered variant', () => {
  const buyer = Keypair.generate().publicKey;
  const recipient = Keypair.generate().publicKey;
  const prepared = { token_mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', recipient_address: recipient.toBase58(), amount_atomic: '109220000', memo: 'SP3ND Order: ORD-1794595751830' };
  const make = (overrides = {}) => buildSp3ndTransaction({ buyerAddress: buyer.toBase58(), recipientAddress: recipient.toBase58(), amount: '109.22', memo: prepared.memo, blockhash: Keypair.generate().publicKey.toBase58(), ...overrides });

  assert.equal(assertPreparedPayment(make(), prepared, buyer.toBase58()).amountAtomic, 109220000n);
  assert.throws(() => assertPreparedPayment(make({ amount: '109.23' }), prepared, buyer.toBase58()), /amount differs/);
  assert.throws(() => assertPreparedPayment(make({ memo: 'SP3ND Order: ORD-OTHER' }), prepared, buyer.toBase58()), /memo differs/);
  assert.throws(() => assertPreparedPayment(make({ recipientAddress: Keypair.generate().publicKey.toBase58() }), prepared, buyer.toBase58()), /treasury/);
  assert.throws(() => assertPreparedPayment(make(), prepared, Keypair.generate().publicKey.toBase58()), /fee payer/);
  assert.throws(() => assertPreparedPayment(make(), { ...prepared, token_mint: Keypair.generate().publicKey.toBase58() }, buyer.toBase58()), /not in Solana USDC/);
  const extra = make();
  extra.add(new TransactionInstruction({ programId: MEMO_PROGRAM_ID, keys: [], data: Buffer.from('extra') }));
  assert.throws(() => assertPreparedPayment(extra, prepared, buyer.toBase58()), /other than one USDC transfer/);
});

import { parseProduct, fundingPlan } from './cart-core.mjs';

test('parseProduct accepts ASINs and amazon.com product links only', () => {
  assert.equal(parseProduct('b00006ie7j').url, 'https://www.amazon.com/dp/B00006IE7J');
  assert.equal(parseProduct('https://www.amazon.com/BIC-Pen/dp/B00006IE7J/ref=sr_1_1?th=1').asin, 'B00006IE7J');
  assert.equal(parseProduct('amazon.com/gp/product/B00FLYWNYQ').asin, 'B00FLYWNYQ');
  assert.throws(() => parseProduct('https://example.com/dp/B00006IE7J'), /not an amazon.com product page/);
  assert.throws(() => parseProduct('B00006IE7'), /is not an ASIN/);
  assert.throws(() => parseProduct('https://www.amazon.com/s?k=pens'), /not a product page/);
  assert.throws(() => parseProduct(''), /Paste an Amazon/);
  assert.throws(() => parseProduct('javascript:alert(1)'), /not an amazon.com/);
});

test('fundingPlan asks only for what the wallet lacks', () => {
  assert.deepEqual(fundingPlan({ usdc: 6_050_000n, lamports: 5_000_000n, needUsdc: 6_050_000n, solReserve: 5_000_000n }), []);
  assert.deepEqual(fundingPlan({ usdc: 1_000_000n, lamports: 0n, needUsdc: 6_050_000n, solReserve: 5_000_000n }), [
    { asset: 'usdc', amount: 5_050_000n }, { asset: 'sol', amount: 5_000_000n }]);
});

test('sealed tickets round-trip and refuse tampering or another key', async () => {
  const { seal, unseal } = await import('./cart-core.mjs');
  const key = Buffer.alloc(32, 7);
  const token = seal(key, { cart_id: 'c1', total_amount: '12.34' });
  assert.deepEqual(unseal(key, token), { cart_id: 'c1', total_amount: '12.34' });
  const [body, mac] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ cart_id: 'c1', total_amount: '0.01' })).toString('base64url');
  assert.equal(unseal(key, `${forged}.${mac}`), null);
  assert.equal(unseal(Buffer.alloc(32, 8), token), null);
  assert.equal(unseal(key, `${body}.${mac}.x`), null);
  assert.equal(unseal(key, 'garbage'), null);
});
