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
