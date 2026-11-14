import { createHash } from 'node:crypto';
import { Connection, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { MEMO_PROGRAM_ID, attachEd25519Signature, toUsdcAtomicUnits } from './cart-core.mjs';
import { derivedSolanaAddress, signWithNearAccount } from './chain-sig.mjs';

// Cart test USDC on Solana devnet: 6 decimals, minted to the Chain Signatures wallet,
// so a quote in USDC settles as an exact-amount SPL transfer with the same transaction shape as mainnet.
export const DEVNET = {
  mint: new PublicKey(process.env.CART_DEVNET_MINT ?? 'DxsNPGU5bUcGA6XoaBuszLLBnGmd8vSvMcXzcCQJk8Zi'),
  merchant: new PublicKey(process.env.CART_DEVNET_MERCHANT ?? 'HWteAiMDaMKMjeWhfmKijtD8RkGpJUYKDSCoWA2WVZiN'),
  rpcs: ['https://api.devnet.solana.com', 'https://solana-devnet.api.onfinality.io/public', 'https://solana-devnet-rpc.publicnode.com'],
  maxAtomic: 250_000_000n,
};

const ata = (mint, owner, offCurve = false) => getAssociatedTokenAddressSync(mint, owner, offCurve, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);

export function memoFor(cartId, asin) {
  return `Cart testnet ${String(asin).toUpperCase()} ${createHash('sha256').update(String(cartId)).digest('hex').slice(0, 8)}`;
}

export function buildTestnetPayment({ payer, amountAtomic, memo, blockhash, mint = DEVNET.mint, merchant = DEVNET.merchant }) {
  if (amountAtomic <= 0n) throw new Error('Nothing to pay');
  if (amountAtomic > DEVNET.maxAtomic) throw new Error('Quote is above the testnet payment cap');
  const buyer = new PublicKey(payer);
  const tx = new Transaction({ feePayer: buyer, recentBlockhash: blockhash });
  tx.add(createAssociatedTokenAccountIdempotentInstruction(buyer, ata(mint, merchant), merchant, mint, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID));
  tx.add(createTransferCheckedInstruction(ata(mint, buyer, true), mint, ata(mint, merchant), buyer, amountAtomic, 6, [], TOKEN_PROGRAM_ID));
  tx.add(new TransactionInstruction({ programId: MEMO_PROGRAM_ID, keys: [], data: Buffer.from(memo, 'utf8') }));
  return tx;
}

// Runs on the built transaction, before any signature is requested.
export function assertTestnetPayment(tx, { payer, amountAtomic, memo, mint = DEVNET.mint, merchant = DEVNET.merchant }) {
  const buyer = new PublicKey(payer);
  if (!tx.feePayer?.equals(buyer)) throw new Error('Fee payer is not the Chain Signatures wallet');
  if (tx.instructions.length !== 3) throw new Error('Payment must be one account check, one transfer and one memo');
  const [create, transfer, note] = tx.instructions;
  if (!create.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)) throw new Error('First instruction is not the merchant account check');
  if (!transfer.programId.equals(TOKEN_PROGRAM_ID) || transfer.data[0] !== 12) throw new Error('Second instruction is not a checked token transfer');
  const [from, tokenMint, to, authority] = transfer.keys.map((key) => key.pubkey);
  if (!from.equals(ata(mint, buyer, true)) || !tokenMint.equals(mint) || !to.equals(ata(mint, merchant)) || !authority.equals(buyer)) {
    throw new Error('Transfer does not move test USDC from the wallet to the merchant');
  }
  if (transfer.data.readBigUInt64LE(1) !== amountAtomic) throw new Error('Transfer amount differs from the quote total');
  if (!note.programId.equals(MEMO_PROGRAM_ID) || Buffer.from(note.data).toString('utf8') !== memo) throw new Error('Memo differs from the quote');
  return { amountAtomic, memo, from, to };
}

let chain = Promise.resolve();
// One NEAR account signs for every visitor, so signing requests run one at a time.
export function serial(run) {
  const next = chain.then(run, run);
  chain = next.catch(() => {});
  return next;
}

async function onDevnet(run, rounds = 3) {
  let lastError;
  for (let round = 0; round < rounds; round += 1) {
    for (const url of DEVNET.rpcs) {
      try { return await run(new Connection(url, 'confirmed')); } catch (error) { lastError = error; }
    }
    await new Promise((resolve) => setTimeout(resolve, 1200 * (round + 1)));
  }
  throw lastError;
}

export async function devnetBalances(address) {
  return onDevnet(async (connection) => {
    const owner = new PublicKey(address);
    const lamports = BigInt(await connection.getBalance(owner));
    const accounts = await connection.getParsedTokenAccountsByOwner(owner, { mint: DEVNET.mint });
    const usdc = accounts.value.reduce((sum, row) => sum + BigInt(row.account.data.parsed.info.tokenAmount.amount), 0n);
    return { lamports, usdc };
  });
}

// What only a landed payment can show: the merchant's token balance rose by exactly the quote, with the memo in the logs.
export async function readBackPayment(signature, { amountAtomic, memo, merchant = DEVNET.merchant, mint = DEVNET.mint }) {
  const deadline = Date.now() + 45_000;
  for (;;) {
    const parsed = await onDevnet((connection) => connection.getParsedTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 }));
    if (parsed) {
      if (parsed.meta?.err) throw new Error(`Devnet rejected the payment: ${JSON.stringify(parsed.meta.err)}`);
      const sum = (rows) => (rows ?? []).filter((row) => row.owner === merchant.toBase58() && row.mint === mint.toBase58()).reduce((acc, row) => acc + BigInt(row.uiTokenAmount.amount), 0n);
      const delta = sum(parsed.meta.postTokenBalances) - sum(parsed.meta.preTokenBalances);
      if (delta !== amountAtomic) throw new Error(`Merchant received ${delta} instead of ${amountAtomic}`);
      if (!(parsed.meta.logMessages ?? []).some((line) => line.includes(memo))) throw new Error('Memo is missing from the devnet logs');
      return { slot: parsed.slot, blockTime: parsed.blockTime, delta: delta.toString() };
    }
    if (Date.now() > deadline) throw new Error('Devnet did not confirm the payment in time');
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

export async function payOnTestnet({ network, account, total, cartId, asin, onStep = () => {} }) {
  const amountAtomic = toUsdcAtomicUnits(total);
  const payer = await derivedSolanaAddress(network, account);
  const memo = memoFor(cartId, asin);
  onStep('built', { state: 'active', detail: `${total} USDC from ${payer.slice(0, 4)}…${payer.slice(-4)}` });
  const { blockhash, lastValidBlockHeight } = await onDevnet((connection) => connection.getLatestBlockhash('confirmed'));
  const tx = buildTestnetPayment({ payer, amountAtomic, memo, blockhash });
  assertTestnetPayment(tx, { payer, amountAtomic, memo });
  const held = await devnetBalances(payer);
  if (held.usdc < amountAtomic) throw new Error('The testnet wallet is out of test USDC');
  if (held.lamports < 20_000n) throw new Error('The testnet wallet is out of devnet SOL for fees');
  onStep('built', { state: 'done', detail: `Transfer, memo and amount match the quote (${memo})` });

  onStep('signed', { state: 'active', detail: `${account} asks the testnet MPC signer to sign` });
  const { signature, txHash } = await signWithNearAccount({ network, accountId: account, message: tx.serializeMessage() });
  const raw = attachEd25519Signature(tx, signature, payer);
  onStep('signed', { state: 'done', detail: 'Signature verified against the derived key', link: `https://testnet.nearblocks.io/txns/${txHash}`, ref: txHash });

  onStep('paid', { state: 'active', detail: 'Submitting to Solana devnet' });
  const sig = await onDevnet((connection) => connection.sendRawTransaction(raw, { skipPreflight: false, maxRetries: 3 }));
  await onDevnet((connection) => connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed'));
  onStep('paid', { state: 'done', detail: 'Landed on Solana devnet', link: `https://explorer.solana.com/tx/${sig}?cluster=devnet`, ref: sig });

  onStep('verified', { state: 'active', detail: 'Reading the merchant balance back from devnet' });
  const read = await readBackPayment(sig, { amountAtomic, memo });
  onStep('verified', { state: 'done', detail: `Merchant balance rose by exactly ${total} USDC` });
  return { payer, memo, nearTx: txHash, solanaTx: sig, ...read };
}
