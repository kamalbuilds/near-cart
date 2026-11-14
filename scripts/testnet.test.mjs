import test from 'node:test';
import assert from 'node:assert/strict';
import { Keypair } from '@solana/web3.js';
import { createTransferCheckedInstruction, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { DEVNET, assertTestnetPayment, buildTestnetPayment, memoFor, serial } from './testnet.mjs';

const payer = Keypair.generate().publicKey.toBase58();
const blockhash = Keypair.generate().publicKey.toBase58();
const memo = memoFor('5bd9a1c2-7777-4444-8888-000000000000', 'b00flywnyq');
const build = (amountAtomic = 12_340_000n, over = {}) => buildTestnetPayment({ payer, amountAtomic, memo, blockhash, ...over });
const check = (tx, over = {}) => assertTestnetPayment(tx, { payer, amountAtomic: 12_340_000n, memo, ...over });

test('memo carries the ASIN and a short hash of the cart id', () => {
  assert.match(memo, /^Cart testnet B00FLYWNYQ [0-9a-f]{8}$/);
  assert.equal(memo, memoFor('5bd9a1c2-7777-4444-8888-000000000000', 'B00FLYWNYQ'));
  assert.notEqual(memo, memoFor('another-cart', 'b00flywnyq'));
});

test('a payment built from the quote passes the pre-signing check', () => {
  const result = check(build());
  assert.equal(result.amountAtomic, 12_340_000n);
});

test('refuses a transfer whose amount differs from the quote', () => {
  assert.throws(() => check(build(12_340_001n)), /amount differs/);
});

test('refuses a transfer to any account other than the merchant', () => {
  assert.throws(() => check(build(12_340_000n, { merchant: Keypair.generate().publicKey })), /merchant/);
});

test('refuses a different memo', () => {
  assert.throws(() => check(build(), { memo: 'Cart testnet OTHER 00000000' }), /Memo differs/);
});

test('refuses a transaction with an extra instruction', () => {
  const tx = build();
  tx.add(createTransferCheckedInstruction(getAssociatedTokenAddressSync(DEVNET.mint, new (tx.feePayer.constructor)(payer), true), DEVNET.mint, getAssociatedTokenAddressSync(DEVNET.mint, Keypair.generate().publicKey), tx.feePayer, 1n, 6));
  assert.throws(() => check(tx), /one account check, one transfer and one memo/);
});

test('refuses zero and over-cap amounts', () => {
  assert.throws(() => build(0n), /Nothing to pay/);
  assert.throws(() => build(DEVNET.maxAtomic + 1n), /cap/);
});

test('signing requests run one at a time', async () => {
  const order = [];
  const slow = serial(async () => { order.push('a start'); await new Promise((r) => setTimeout(r, 30)); order.push('a end'); });
  const fast = serial(async () => { order.push('b start'); order.push('b end'); });
  await Promise.all([slow, fast]);
  assert.deepEqual(order, ['a start', 'a end', 'b start', 'b end']);
});
