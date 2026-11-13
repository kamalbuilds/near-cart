import test from 'node:test';
import assert from 'node:assert/strict';
import { Keypair } from '@solana/web3.js';
import {
  DERIVATION_PATH,
  DOMAIN_ED25519,
  MEMO_PROGRAM_ID,
  assertSp3ndPayable,
  buildSp3ndTransaction,
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
  assert.throws(() => assertSp3ndPayable({ payment_ready: true, total_usdc: '10.81', currency: 'USDC', memo: 'SP3ND Order: ORD-1', recipient_address: Keypair.generate().publicKey.toBase58() }, '10.82'), /refusing to sign/);
});

test('refuses payment unless SP3ND sets payment_ready true', () => {
  assert.throws(() => assertSp3ndPayable({ payment_ready: false, total_usdc: '10.81', currency: 'USDC', memo: 'SP3ND Order: ORD-1', recipient_address: Keypair.generate().publicKey.toBase58() }, '10.81'), /not payment ready/);
});

test('converts decimal USDC without floating point', () => {
  assert.equal(toUsdcAtomicUnits('10.810001'), 10810001n);
  assert.throws(() => toUsdcAtomicUnits('10.8100001'), /Invalid USDC/);
});
