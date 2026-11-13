import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Transaction } from '@solana/web3.js';
import { openMcp } from './sp3nd.mjs';
import { ensureSession, NETWORK, ACCOUNT } from './sp3nd-login.mjs';
import { quoteWithRetry, createOrder, checkoutTicket, preparePayment, submitPayment, waitPaid } from './shop.mjs';
import { assertPreparedPayment, attachEd25519Signature } from './cart-core.mjs';
import { signWithNearAccount } from './chain-sig.mjs';
import { solanaBalances } from './solana.mjs';

const args = process.argv.slice(2);
const flags = new Set(args.filter((arg) => arg.startsWith('--')));
const [productUrl] = args.filter((arg) => !arg.startsWith('--'));
if (!productUrl) {
  console.error('usage: pay.mjs <amazon-or-ebay-url> [--prepare-only]');
  process.exit(2);
}

const shipFile = process.env.CART_SHIP_FILE ?? join(homedir(), '.config', 'cart', 'ship.json');
const { email, shipping_address: shippingAddress } = JSON.parse(readFileSync(shipFile, 'utf8'));
const country = shippingAddress.countryCode ?? shippingAddress.country;

const session = await ensureSession();
const mcp = await openMcp(session);
const cart = await quoteWithRetry(mcp, { productUrl, country, postal: shippingAddress.postalCode });
if (cart.payment_ready !== true) throw new Error('SP3ND quote is not payment ready');
const order = await createOrder(mcp, { cart, email, shippingAddress });
console.log(`ORDER ${order.order_number} total ${order.total_amount} ${order.currency}`);

const ticket = await checkoutTicket(mcp, order.order_id);
const prepared = await preparePayment(ticket);
if (prepared.status === 'already_paid') {
  console.log(`PAID ${prepared.order_number} (already settled)`);
  process.exit(0);
}
if (prepared.network !== 'solana-mainnet' || prepared.payer_address !== session.wallet_address) throw new Error('Prepared payment is not for this wallet on Solana mainnet');
if (Number(prepared.amount) !== Number(order.total_amount)) throw new Error('Prepared amount differs from the order total');

const tx = Transaction.from(Buffer.from(prepared.unsigned_transaction_base64, 'base64'));
const checked = assertPreparedPayment(tx, prepared, session.wallet_address);
console.log(`PREPARED ${checked.amountAtomic} atomic USDC to ${prepared.recipient_address} memo "${checked.memo}"`);

const { signature, txHash } = await signWithNearAccount({ network: NETWORK, accountId: ACCOUNT, message: tx.serializeMessage() });
const signed = attachEd25519Signature(tx, signature, session.wallet_address);
console.log(`SIGNED by ${ACCOUNT} via Chain Signatures, NEAR tx ${txHash}`);
if (flags.has('--prepare-only')) {
  console.log('PREPARE_ONLY nothing submitted');
  process.exit(0);
}

const { lamports, usdc } = await solanaBalances(session.wallet_address);
if (usdc < checked.amountAtomic || lamports < 10_000n) {
  console.log(`FUNDS_NEEDED wallet ${session.wallet_address} holds ${usdc} atomic USDC and ${lamports} lamports; needs ${checked.amountAtomic} USDC and SOL for fees`);
  process.exit(3);
}

const submitted = await submitPayment(prepared.approval_ticket, Buffer.from(signed).toString('base64'));
console.log(`SUBMITTED ${submitted.transaction_signature ?? ''}`);
const paid = await waitPaid(mcp, order.order_id);
console.log(`PAID ${paid.order_number} status ${paid.status} solana ${paid.transaction_signature ?? submitted.transaction_signature}`);
