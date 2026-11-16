import { createHmac, timingSafeEqual } from 'node:crypto';
import nacl from 'tweetnacl';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';

export const DERIVATION_PATH = 'solana-1';
export const DOMAIN_ED25519 = 1;
export const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
export const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

export function toUsdcAtomicUnits(amount) {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,6}))?$/.exec(String(amount));
  if (!match) throw new Error('Invalid USDC amount from SP3ND');
  return BigInt(match[1]) * 1_000_000n + BigInt((match[2] ?? '').padEnd(6, '0'));
}

export function assertSp3ndPayable(order, expectedTotal) {
  if (order?.payment_ready !== true) throw new Error('SP3ND quote is not payment ready');
  if (toUsdcAtomicUnits(order.total_usdc) !== toUsdcAtomicUnits(expectedTotal)) {
    throw new Error('SP3ND total changed; refusing to sign');
  }
  if (order.currency !== 'USDC') throw new Error('SP3ND payment currency is not USDC');
  if (!order.memo || !order.recipient_address) throw new Error('SP3ND payment instructions are incomplete');
}

export function buildSp3ndTransaction({ buyerAddress, recipientAddress, amount, memo, blockhash, createBuyerAta = false }) {
  const buyer = new PublicKey(buyerAddress);
  const recipient = new PublicKey(recipientAddress);
  const buyerAta = getAssociatedTokenAddressSync(USDC_MINT, buyer, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const recipientAta = getAssociatedTokenAddressSync(USDC_MINT, recipient, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const tx = new Transaction({ feePayer: buyer, recentBlockhash: blockhash });

  if (createBuyerAta) {
    tx.add(createAssociatedTokenAccountInstruction(buyer, buyerAta, buyer, USDC_MINT, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID));
  }
  tx.add(
    createTransferCheckedInstruction(
      buyerAta,
      USDC_MINT,
      recipientAta,
      buyer,
      toUsdcAtomicUnits(amount),
      6,
      [],
      TOKEN_PROGRAM_ID,
    ),
    new TransactionInstruction({ programId: MEMO_PROGRAM_ID, keys: [], data: Buffer.from(memo, 'utf8') }),
  );
  return tx;
}

export function prepareSp3ndTransaction({ order, expectedTotal, ...transaction }) {
  assertSp3ndPayable(order, expectedTotal);
  return buildSp3ndTransaction({
    buyerAddress: transaction.buyerAddress,
    recipientAddress: order.recipient_address,
    amount: order.total_usdc,
    memo: order.memo,
    blockhash: transaction.blockhash,
    createBuyerAta: transaction.createBuyerAta,
  });
}

export function attachEd25519Signature(tx, signature, expectedPublicKey) {
  const signer = new PublicKey(expectedPublicKey);
  const required = tx.signatures.find((entry) => entry.publicKey.equals(signer));
  if (!required) throw new Error('Derived Solana address is not the transaction signer');
  const sig = Buffer.from(signature);
  if (sig.length !== 64) throw new Error('Chain Signatures returned an invalid Ed25519 signature');
  const message = tx.serializeMessage();
  if (!nacl.sign.detached.verify(message, sig, signer.toBytes())) throw new Error('Chain Signatures signature does not match the Solana message');
  required.signature = sig;
  return tx.serialize({ requireAllSignatures: true, verifySignatures: false });
}

export function assertPreparedPayment(tx, prepared, buyerAddress) {
  const buyer = new PublicKey(buyerAddress);
  if (!tx.feePayer?.equals(buyer)) throw new Error('Prepared transaction fee payer is not the Chain Signatures wallet');
  if (prepared.token_mint !== USDC_MINT.toBase58()) throw new Error('Prepared payment is not in Solana USDC');
  const recipientAta = getAssociatedTokenAddressSync(USDC_MINT, new PublicKey(prepared.recipient_address), false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const buyerAta = getAssociatedTokenAddressSync(USDC_MINT, buyer, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const transfers = tx.instructions.filter((ix) => ix.programId.equals(TOKEN_PROGRAM_ID));
  const memos = tx.instructions.filter((ix) => ix.programId.equals(MEMO_PROGRAM_ID));
  if (tx.instructions.length !== transfers.length + memos.length || transfers.length !== 1 || memos.length !== 1) {
    throw new Error('Prepared transaction carries instructions other than one USDC transfer and one memo');
  }
  const [transfer] = transfers;
  const [first, mint, destination, authority] = transfer.keys.map((key) => key.pubkey);
  if (transfer.data[0] !== 12 || !first.equals(buyerAta) || !mint.equals(USDC_MINT) || !destination.equals(recipientAta) || !authority.equals(buyer)) {
    throw new Error('Prepared USDC transfer does not move funds from the wallet to the SP3ND treasury');
  }
  if (transfer.data.readBigUInt64LE(1) !== BigInt(prepared.amount_atomic)) throw new Error('Prepared transfer amount differs from the quoted amount');
  if (Buffer.from(memos[0].data).toString('utf8') !== prepared.memo) throw new Error('Prepared memo differs from the SP3ND order memo');
  return { amountAtomic: BigInt(prepared.amount_atomic), memo: prepared.memo, buyerAta, recipientAta };
}

const ASIN = /^[A-Z0-9]{10}$/i;
const AMAZON_US = /^(?:www\.|smile\.)?amazon\.com$/i;

export function parseProduct(input) {
  const raw = String(input ?? '').trim();
  if (!raw) throw new Error('Paste an Amazon product link or a 10-character ASIN.');
  if (ASIN.test(raw)) return { asin: raw.toUpperCase(), url: `https://www.amazon.com/dp/${raw.toUpperCase()}` };
  if (!/[./:]/.test(raw)) throw new Error(`"${raw.slice(0, 40)}" is not an ASIN. An ASIN is 10 letters and digits, like B00006IE7J.`);
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new Error(`"${raw.slice(0, 40)}" is not a product link or an ASIN. An ASIN is 10 letters and digits, like B00006IE7J.`);
  }
  if (!['http:', 'https:'].includes(url.protocol) || !AMAZON_US.test(url.hostname)) {
    throw new Error(`${url.hostname || 'That link'} is not an amazon.com product page. Cart shops amazon.com links and ASINs.`);
  }
  const asin = /\/(?:dp|gp\/product|gp\/aw\/d|exec\/obidos\/ASIN)\/([A-Z0-9]{10})(?:[/?#]|$)/i.exec(url.pathname)?.[1];
  if (!asin) throw new Error('That amazon.com link is not a product page. Open the product and paste its /dp/ link.');
  return { asin: asin.toUpperCase(), url: `https://www.amazon.com/dp/${asin.toUpperCase()}` };
}

export const MIN_LAMPORTS = 10_000n;

export function fundingPlan({ usdc, lamports, needUsdc, solReserve }) {
  const plan = [];
  if (usdc < needUsdc) plan.push({ asset: 'usdc', amount: needUsdc - usdc });
  if (lamports < MIN_LAMPORTS) plan.push({ asset: 'sol', amount: solReserve });
  return plan;
}

// Sealed values let any stateless API instance trust what an earlier instance handed the browser.
export function seal(secret, value) {
  const body = Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}

export function unseal(secret, token) {
  const [body, mac, extra] = String(token ?? '').split('.');
  if (!body || !mac || extra !== undefined) return null;
  const expected = createHmac('sha256', secret).update(body).digest();
  const given = Buffer.from(mac, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
}
