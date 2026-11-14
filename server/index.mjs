import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, statSync, createReadStream } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Transaction } from '@solana/web3.js';
import { openMcp } from '../scripts/sp3nd.mjs';
import { ensureSession, NETWORK, ACCOUNT } from '../scripts/sp3nd-login.mjs';
import { quoteWithRetry, createOrder, getOrder, checkoutTicket, preparePayment, submitPayment, waitPaid } from '../scripts/shop.mjs';
import { assertPreparedPayment, attachEd25519Signature, fundingPlan, parseProduct, toUsdcAtomicUnits } from '../scripts/cart-core.mjs';
import { getSupportedTokens, quoteExactOutput, SOLANA_USDC_ASSET_ID, SOL_ASSET_ID, SOL_FEE_RESERVE, waitForSwap } from '../scripts/oneclick.mjs';
import { signWithNearAccount } from '../scripts/chain-sig.mjs';
import { solanaBalances } from '../scripts/solana.mjs';
import { DEVNET, devnetBalances, payOnTestnet, serial } from '../scripts/testnet.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const ORDERS_FILE = join(ROOT, '.cart-orders.json');
const PORT = Number(process.env.CART_API_PORT ?? 4174);
const PAY_ENABLED = process.env.CART_ALLOW_PAY === '1';
const PAID = ['paid', 'ordered', 'shipped', 'delivered'];

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (message) => new HttpError(400, message);

// ---- SP3ND session, opened once and reopened when the hosted MCP drops it.
let mcpPromise;
let walletAddress;
async function withMcp(run) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      mcpPromise ??= ensureSession().then(async (session) => { walletAddress = session.wallet_address; return { session, mcp: await openMcp(session) }; });
      const { session, mcp } = await mcpPromise;
      return await run(mcp, session);
    } catch (error) {
      mcpPromise = undefined;
      if (attempt > 0 || !/HTTP 40\d|session/i.test(error.message)) throw error;
    }
  }
}

// ---- helpers
const cents = (value) => Number(value ?? 0);
const cleanBrand = (brand) => (brand ? String(brand).replace(/^Visit the (.+) Store$/i, '$1').replace(/^Brand: ?/i, '').trim() || null : null);
const normItem = (item) => ({
  asin: item.product_id, title: item.product_title, image: item.image_url ?? null, brand: cleanBrand(item.brand),
  store: item.store ?? 'Amazon', price: cents(item.price), quantity: item.quantity ?? 1,
  verified: item.server_verified === true && item.pricing_status === 'verified', url: item.product_url,
});
const normMoney = (o) => ({
  subtotal: cents(o.subtotal), shipping: cents(o.shipping_amount), tax: cents(o.tax_amount),
  fee: cents(o.platform_fee), total: cents(o.total_amount), currency: o.currency ?? 'USDC',
});
const normCart = (cart) => ({
  cartId: cart.cart_id, paymentReady: cart.payment_ready === true, expiresAt: cart.expires_at,
  items: (cart.items ?? []).map(normItem), ...normMoney(cart),
});
const normOrder = (order) => ({
  orderId: order.order_id, orderNumber: order.order_number, status: order.status, paymentReady: order.payment_ready === true,
  txSignature: order.transaction_signature ?? null, createdAt: order.created_at, paidAt: order.payment_confirmed_at ?? null,
  items: (order.items ?? []).map(normItem), ...normMoney(order),
});

const quotes = new Map();
const publicJob = ({ sessionId, ...job }) => ({ ...job, elapsed: job.status === 'running' && job.startedAt ? Number(((Date.now() - Date.parse(job.startedAt)) / 1000).toFixed(1)) : job.seconds });
const readOrders = () => (existsSync(ORDERS_FILE) ? JSON.parse(readFileSync(ORDERS_FILE, 'utf8')) : []);
const saveOrder = (entry) => {
  const all = readOrders().filter((row) => row.orderId !== entry.orderId);
  all.unshift(entry);
  writeFileSync(ORDERS_FILE, JSON.stringify(all.slice(0, 200), null, 2), { mode: 0o600 });
};
const ownedOrder = (sessionId, orderId) => {
  const row = readOrders().find((entry) => entry.orderId === orderId && entry.sessionId === sessionId);
  if (!row) throw new HttpError(404, 'No order with that id in this browser session.');
  return row;
};

let tokenCache = { at: 0, list: [] };
async function tokens() {
  if (Date.now() - tokenCache.at > 60_000) tokenCache = { at: Date.now(), list: await getSupportedTokens() };
  return tokenCache.list;
}
const formatUnits = (atomic, decimals) => {
  const text = BigInt(atomic).toString().padStart(decimals + 1, '0');
  const whole = text.slice(0, -decimals) || '0';
  return decimals ? `${whole}.${text.slice(-decimals)}`.replace(/\.?0+$/, '') : whole;
};

// ---- payment preparation (no signing, no funds move)
async function prepareChecked(mcp, session, order) {
  const prepared = await preparePayment(await checkoutTicket(mcp, order.order_id ?? order.orderId));
  if (prepared.status === 'already_paid') return { alreadyPaid: true };
  if (prepared.network !== 'solana-mainnet' || prepared.payer_address !== session.wallet_address) throw new Error('Prepared payment is not for the Cart wallet on Solana mainnet');
  const total = order.total_amount ?? order.total;
  if (toUsdcAtomicUnits(prepared.amount) !== toUsdcAtomicUnits(total)) throw new Error('Prepared amount differs from the order total; refusing to continue');
  const tx = Transaction.from(Buffer.from(prepared.unsigned_transaction_base64, 'base64'));
  const checked = assertPreparedPayment(tx, prepared, session.wallet_address);
  return { prepared, tx, checked };
}

// ---- pay jobs
const jobs = new Map();
const STEPS = [
  ['created', 'Order created at SP3ND'],
  ['funded', 'Cart wallet funded'],
  ['prepared', 'Payment prepared and checked'],
  ['signed', 'Signed by Chain Signatures'],
  ['paid', 'Paid on Solana'],
  ['confirmed', 'SP3ND confirmed'],
];
const newJob = (orderId) => ({
  orderId, status: 'running', startedAt: new Date().toISOString(), error: null, funding: [],
  steps: STEPS.map(([id, label]) => ({ id, label, state: 'pending', detail: null, link: null })),
});
const step = (job, id, patch) => Object.assign(job.steps.find((entry) => entry.id === id), patch);

async function fundWallet(job, plan, sourceAssetId, wallet) {
  const targets = { usdc: SOLANA_USDC_ASSET_ID, sol: SOL_ASSET_ID };
  const list = await tokens();
  const watch = [];
  for (const item of plan) {
    const destinationAsset = targets[item.asset];
    const row = { asset: item.asset, amountAtomic: item.amount.toString(), state: 'awaiting_deposit' };
    if (!sourceAssetId || sourceAssetId === destinationAsset) {
      Object.assign(row, { direct: true, depositAddress: wallet, chain: 'sol' });
    } else {
      const result = await quoteExactOutput({ originAsset: sourceAssetId, destinationAsset, amount: item.amount.toString(), recipient: wallet, refundTo: ACCOUNT });
      const origin = list.find((token) => token.assetId === sourceAssetId);
      Object.assign(row, {
        depositAddress: result.quote.depositAddress, depositMemo: result.quote.depositMemo ?? null, symbol: origin.symbol, chain: origin.blockchain,
        amountIn: result.quote.amountInFormatted, deadline: result.quote.deadline ?? result.quoteRequest?.deadline,
      });
      const swap = waitForSwap(result.quote.depositAddress, result.quote.depositMemo).then(() => { row.state = 'swapped'; });
      swap.catch(() => {});
      watch.push(swap);
    }
    job.funding.push(row);
  }
  step(job, 'funded', { state: 'active', detail: 'Waiting for deposits to reach the Cart wallet' });
  await Promise.all(watch);
  return plan;
}

async function runPay(job, sourceAssetId) {
  try {
    await withMcp(async (mcp, session) => {
      const order = await getOrder(mcp, job.orderId);
      const needUsdc = toUsdcAtomicUnits(order.total_amount);
      const wallet = session.wallet_address;
      step(job, 'created', { state: 'done', detail: order.order_number });
      if (PAID.includes(String(order.status).toLowerCase())) {
        for (const id of ['funded', 'prepared', 'signed', 'paid', 'confirmed']) step(job, id, { state: 'done', detail: `Already ${order.status}` });
        return;
      }

      let balances = await solanaBalances(wallet);
      const plan = fundingPlan({ usdc: balances.usdc, lamports: balances.lamports, needUsdc, solReserve: BigInt(SOL_FEE_RESERVE) });
      if (plan.length) {
        step(job, 'funded', { state: 'active', detail: `Wallet holds ${formatUnits(balances.usdc, 6)} USDC, needs ${formatUnits(needUsdc, 6)}` });
        await fundWallet(job, plan, sourceAssetId, wallet);
        const deadline = Date.now() + 20 * 60_000;
        for (balances = await solanaBalances(wallet); fundingPlan({ usdc: balances.usdc, lamports: balances.lamports, needUsdc, solReserve: BigInt(SOL_FEE_RESERVE) }).length; balances = await solanaBalances(wallet)) {
          if (Date.now() > deadline) throw new Error('The Cart wallet was not funded within 20 minutes. Funds sent to a 1Click deposit address are refunded by 1Click.');
          await new Promise((resolve) => setTimeout(resolve, 6_000));
        }
      }
      step(job, 'funded', { state: 'done', detail: `${formatUnits(balances.usdc, 6)} USDC on Solana` });

      step(job, 'prepared', { state: 'active' });
      const ready = await prepareChecked(mcp, session, order);
      if (ready.alreadyPaid) {
        for (const id of ['prepared', 'signed', 'paid']) step(job, id, { state: 'done', detail: 'Already settled' });
      } else {
        const { prepared, tx, checked } = ready;
        step(job, 'prepared', { state: 'done', detail: `${formatUnits(checked.amountAtomic, 6)} USDC, memo ${checked.memo}` });
        step(job, 'signed', { state: 'active', detail: `${ACCOUNT} requests a Chain Signatures signature` });
        const { signature, txHash } = await signWithNearAccount({ network: NETWORK, accountId: ACCOUNT, message: tx.serializeMessage() });
        const signed = attachEd25519Signature(tx, signature, wallet);
        step(job, 'signed', { state: 'done', detail: `NEAR tx ${txHash}`, link: `https://${NETWORK === 'mainnet' ? '' : 'testnet.'}nearblocks.io/txns/${txHash}` });
        step(job, 'paid', { state: 'active', detail: 'Submitting the signed USDC transfer' });
        const submitted = await submitPayment(prepared.approval_ticket, Buffer.from(signed).toString('base64'));
        const sig = submitted.transaction_signature;
        step(job, 'paid', { state: 'done', detail: sig ?? 'Submitted', link: sig ? `https://solscan.io/tx/${sig}` : null });
      }
      step(job, 'confirmed', { state: 'active', detail: 'Waiting for SP3ND to confirm receipt' });
      const paid = await waitPaid(mcp, job.orderId);
      step(job, 'confirmed', { state: 'done', detail: `Status ${paid.status}` });
    });
    job.status = 'done';
  } catch (error) {
    const active = job.steps.find((entry) => entry.state === 'active') ?? job.steps.find((entry) => entry.state === 'pending');
    if (active) active.state = 'failed';
    job.status = 'failed';
    job.error = error.message;
  }
}

// ---- testnet payment jobs: NEAR testnet MPC signature, Solana devnet transfer, balance read-back
const TESTNET_STEPS = [
  ['built', 'Payment built and checked against the quote'],
  ['signed', 'Signed on NEAR testnet by Chain Signatures'],
  ['paid', 'Landed on Solana devnet'],
  ['verified', 'Merchant balance read back from devnet'],
];
const testnetJobs = new Map();
const testnetLedger = { day: '', count: 0, bySession: new Map() };
const TESTNET_DAILY_CAP = Number(process.env.CART_TESTNET_DAILY_CAP ?? 400);
const TESTNET_SESSION_CAP = Number(process.env.CART_TESTNET_SESSION_CAP ?? 12);

function admitTestnet(sessionId) {
  const day = new Date().toISOString().slice(0, 10);
  if (testnetLedger.day !== day) Object.assign(testnetLedger, { day, count: 0, bySession: new Map() });
  const mine = testnetLedger.bySession.get(sessionId) ?? 0;
  if (testnetLedger.count >= TESTNET_DAILY_CAP) throw new HttpError(429, 'The testnet wallet has paid its fill for today. It resets at midnight UTC.');
  if (mine >= TESTNET_SESSION_CAP) throw new HttpError(429, 'This browser has run the testnet payment many times today. Try again tomorrow.');
  testnetLedger.count += 1;
  testnetLedger.bySession.set(sessionId, mine + 1);
}

async function runTestnetPay(job, quote) {
  const started = Date.now();
  const mark = (id, patch) => Object.assign(job.steps.find((entry) => entry.id === id), patch);
  try {
    job.queue = testnetQueue;
    testnetQueue += 1;
    if (job.assetId) { try { job.route = await routeQuote(job.assetId, String(quote.cart.total_amount)); } catch { job.route = null; } }
    const result = await serial(async () => {
      testnetQueue -= 1;
      job.queue = 0;
      job.startedAt = new Date().toISOString();
      return payOnTestnet({
        network: NETWORK, account: ACCOUNT, total: String(quote.cart.total_amount), cartId: quote.cart.cart_id,
        asin: quote.cart.items?.[0]?.product_id ?? 'ITEM', onStep: mark,
      });
    });
    job.result = { route: job.route ?? null, payer: result.payer, memo: result.memo, nearTx: result.nearTx, solanaTx: result.solanaTx, slot: result.slot, merchant: DEVNET.merchant.toBase58(), mint: DEVNET.mint.toBase58(), amount: String(quote.cart.total_amount) };
    job.status = 'done';
    lastPaid = { title: quote.cart.items?.[0]?.title ?? 'Amazon item', total: String(quote.cart.total_amount), seconds: Number(((Date.now() - started) / 1000).toFixed(1)), nearTx: result.nearTx, solanaTx: result.solanaTx, at: new Date().toISOString() };
  } catch (error) {
    const active = job.steps.find((entry) => entry.state === 'active') ?? job.steps.find((entry) => entry.state === 'pending');
    if (active) active.state = 'failed';
    job.status = 'failed';
    job.error = error.message;
  } finally {
    job.seconds = Number(((Date.now() - started) / 1000).toFixed(1));
  }
}
let testnetQueue = 0;
let lastPaid = null;

// ---- quote cache: SP3ND takes several seconds to price an item. A cached quote is served to a visitor while 10+ minutes of its 30 remain; the warmer renews it at 22.
const quoteCache = new Map();
const holds = (cart, minutes) => Date.parse(cart.expires_at) - Date.now() > minutes * 60_000;
async function liveQuote({ asin, url, quantity, postal, fresh: bypass, minutes = 10 }) {
  const key = `${asin}|${postal}|${quantity}`;
  const hit = quoteCache.get(key);
  if (!bypass && hit && holds(hit, minutes)) return hit;
  const cart = await withMcp((mcp) => quoteWithRetry(mcp, { productUrl: url, quantity, country: 'US', postal, attempts: 3 }));
  quotes.set(cart.cart_id, { cart, postal });
  if (!bypass) quoteCache.set(key, cart);
  return cart;
}
const WARM = ['B00006IE7J', 'B00FLYWNYQ'];
async function warmQuotes() {
  for (const asin of WARM) {
    try { await liveQuote({ asin, url: `https://www.amazon.com/dp/${asin}`, quantity: 1, postal: '10001', minutes: 22 }); } catch (error) { console.error(`warm ${asin}: ${error.message}`); }
  }
}
async function routeQuote(assetId, total) {
  const need = toUsdcAtomicUnits(total);
  if (need <= 0n) throw bad('Nothing to convert.');
  const list = await tokens();
  const origin = list.find((token) => token.assetId === assetId);
  if (!origin) throw bad('That asset is not on the NEAR Intents token list.');
  const route = { symbol: origin.symbol, chain: origin.blockchain, decimals: origin.decimals };
  if (origin.assetId === SOLANA_USDC_ASSET_ID) return { ...route, direct: true, amountIn: formatUnits(need, 6), amountInUsd: Number(formatUnits(need, 6)), costUsd: 0 };
  const { wallet_address: recipient } = await withMcp((_, session) => session);
  const { quote, quoteRequest } = await quoteExactOutput({ originAsset: origin.assetId, destinationAsset: SOLANA_USDC_ASSET_ID, amount: need.toString(), recipient, refundTo: ACCOUNT, dry: true });
  const amountInUsd = Number(quote.amountInUsd);
  return {
    ...route, direct: false, amountIn: quote.amountInFormatted, minAmountIn: formatUnits(quote.minAmountIn, origin.decimals),
    amountInUsd, amountOutUsd: Number(quote.amountOutUsd), costUsd: Math.max(0, amountInUsd - Number(quote.amountOutUsd)),
    seconds: quote.timeEstimate, deadline: quoteRequest?.deadline, quotedAt: new Date().toISOString(), wallet: recipient,
  };
}


// ---- routes
const ZIP = /^\d{5}(?:-\d{4})?$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function cleanAddress(raw = {}) {
  const text = (key, max = 120) => String(raw[key] ?? '').trim().slice(0, max);
  const phone = text('phone', 40).replace(/[^\d+]/g, '');
  const address = {
    recipient: text('recipient'), address1: text('address1', 200), city: text('city'),
    state: text('state', 2).toUpperCase(), postalCode: text('postalCode', 10), phone,
    country: 'United States', countryCode: 'US',
  };
  if (text('address2', 200)) address.address2 = text('address2', 200);
  if (!address.recipient) throw bad('Recipient name is required.');
  if (!address.address1) throw bad('Street address is required.');
  if (!address.city) throw bad('City is required.');
  if (!/^[A-Z]{2}$/.test(address.state)) throw bad('Use the two-letter US state code, like NY.');
  if (!ZIP.test(address.postalCode)) throw bad('Use a US ZIP code, like 10118.');
  if (phone.replace(/\D/g, '').length < 10) throw bad('A US phone number is required for delivery.');
  return address;
}

const routes = {
  'POST /api/quote': async ({ body }) => {
    let product;
    try { product = parseProduct(body.input); } catch (error) { throw bad(error.message); }
    const { asin, url } = product;
    const postal = String(body.zip ?? '10001').trim();
    if (!ZIP.test(postal)) throw bad('Use a US ZIP code, like 10001.');
    const quantity = Number(body.quantity ?? 1);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 5) throw bad('Quantity is 1 to 5.');
    const cart = await liveQuote({ asin, url, quantity, postal, fresh: body.fresh === true });
    return { asin, ...normCart(cart), zip: postal };
  },

  'GET /api/tokens': async () => {
    const list = await tokens();
    return list.map(({ assetId, symbol, blockchain, decimals, price }) => ({ assetId, symbol, blockchain, decimals, price }))
      .sort((a, b) => a.blockchain.localeCompare(b.blockchain) || a.symbol.localeCompare(b.symbol));
  },

  'POST /api/swap-quote': async ({ body }) => routeQuote(body.assetId, body.total),

  'POST /api/order': async ({ body, sessionId }) => {
    const cached = quotes.get(body.cartId);
    if (!cached || Date.parse(cached.cart.expires_at) < Date.now()) throw new HttpError(410, 'That quote expired. Paste the link again for a fresh quote.');
    if (!EMAIL.test(String(body.email ?? ''))) throw bad('A valid email is required for the order receipt.');
    const address = cleanAddress(body.address);
    const order = await withMcp((mcp) => createOrder(mcp, { cart: cached.cart, email: body.email.trim(), shippingAddress: address }));
    const first = order.items?.[0];
    saveOrder({ sessionId, orderId: order.order_id, orderNumber: order.order_number, title: first?.product_title, asin: first?.product_id, createdAt: order.created_at });
    return normOrder(order);
  },

  // Dry run of the payment: ticket, prepare, tamper checks. Nothing is signed or submitted.
  'POST /api/prepare': async ({ body, sessionId }) => {
    ownedOrder(sessionId, body.orderId);
    return withMcp(async (mcp, session) => {
      const order = await getOrder(mcp, body.orderId);
      const ready = await prepareChecked(mcp, session, order);
      if (ready.alreadyPaid) return { alreadyPaid: true };
      const { prepared, checked } = ready;
      return { network: prepared.network, payer: prepared.payer_address, recipient: prepared.recipient_address, amount: formatUnits(checked.amountAtomic, 6), currency: prepared.currency, memo: checked.memo, checks: 'amount, mint, recipient, memo and signer match the order' };
    });
  },

  'POST /api/pay': async ({ body, sessionId }) => {
    if (body.confirm !== true) throw bad('Payment needs an explicit confirm: true.');
    if (!PAY_ENABLED) throw new HttpError(403, 'Payments are switched off on this server.');
    ownedOrder(sessionId, body.orderId);
    const running = jobs.get(body.orderId);
    if (running?.status === 'running') return running;
    const order = await withMcp((mcp) => getOrder(mcp, body.orderId));
    if (toUsdcAtomicUnits(order.total_amount) !== toUsdcAtomicUnits(body.expectTotal)) throw bad('The confirmed total does not match the order total.');
    const job = newJob(body.orderId);
    jobs.set(body.orderId, job);
    runPay(job, body.sourceAssetId);
    return job;
  },

  'GET /api/order': async ({ query, sessionId }) => {
    const orderId = query.get('id');
    ownedOrder(sessionId, orderId);
    const order = await withMcp((mcp) => getOrder(mcp, orderId));
    return { order: normOrder(order), job: jobs.get(orderId) ?? null, payEnabled: PAY_ENABLED };
  },

  'GET /api/orders': async ({ sessionId }) => {
    const rows = readOrders().filter((row) => row.sessionId === sessionId).slice(0, 20);
    return withMcp((mcp) => Promise.all(rows.map(async (row) => {
      try {
        return normOrder(await getOrder(mcp, row.orderId));
      } catch (error) {
        return { orderId: row.orderId, orderNumber: row.orderNumber, status: 'Unreadable', error: error.message, items: [], total: 0, currency: 'USDC', createdAt: row.createdAt };
      }
    })));
  },

  'GET /api/wallet': async () => {
    const { wallet_address: address } = await withMcp((_, session) => session);
    const { lamports, usdc } = await solanaBalances(address);
    return { address, account: ACCOUNT, nearNetwork: NETWORK, usdc: formatUnits(usdc, 6), sol: formatUnits(lamports, 9) };
  },

  'POST /api/testnet/pay': async ({ body, sessionId }) => {
    const quote = quotes.get(String(body.cartId ?? ''));
    if (!quote) throw bad('That quote is no longer held. Price the item again.');
    if (Date.parse(quote.cart.expires_at) <= Date.now()) throw bad('The quote expired. Price the item again.');
    if (quote.cart.payment_ready !== true) throw bad('The store has not marked this quote payable.');
    const prior = [...testnetJobs.values()].find((job) => job.sessionId === sessionId && job.status === 'running');
    if (prior) return publicJob(prior);
    admitTestnet(sessionId);
    const id = randomUUID();
    const job = { id, sessionId, assetId: typeof body.assetId === 'string' ? body.assetId : null, route: null, cartId: quote.cart.cart_id, status: 'running', error: null, result: null, seconds: 0, queue: 0, steps: TESTNET_STEPS.map(([sid, label]) => ({ id: sid, label, state: 'pending', detail: null, link: null })) };
    testnetJobs.set(id, job);
    if (testnetJobs.size > 300) testnetJobs.delete(testnetJobs.keys().next().value);
    runTestnetPay(job, quote);
    return publicJob(job);
  },

  'GET /api/testnet/job': async ({ query, sessionId }) => {
    const job = testnetJobs.get(query.get('id'));
    if (!job || job.sessionId !== sessionId) throw new HttpError(404, 'No testnet payment with that id in this browser session.');
    return publicJob(job);
  },

  'GET /api/testnet/last': async () => {
    if (!lastPaid) throw new HttpError(404, 'No payment yet.');
    return lastPaid;
  },

  'GET /api/testnet/wallet': async () => {
    const { wallet_address: address } = await withMcp((_, session) => session);
    const held = await devnetBalances(address);
    return { address, account: ACCOUNT, nearNetwork: 'testnet', usdc: formatUnits(held.usdc, 6), sol: formatUnits(held.lamports, 9), merchant: DEVNET.merchant.toBase58(), mint: DEVNET.mint.toBase58() };
  },

  'GET /api/health': async () => ({ ok: true, payEnabled: PAY_ENABLED, network: NETWORK }),
};

// ---- http
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon' };

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64_000) throw bad('Request body too large.');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw bad('Request body is not valid JSON.'); }
}

function serveStatic(req, res, pathname) {
  let file = normalize(join(DIST, pathname));
  if (!file.startsWith(DIST)) return false;
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  if (!existsSync(file)) return false;
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': file.endsWith('.html') ? 'no-cache' : 'public, max-age=31536000, immutable' });
  createReadStream(file).pipe(res);
  return true;
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const send = (status, payload) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(payload));
  };
  const handler = routes[`${req.method} ${url.pathname}`];
  if (!handler) {
    if (!url.pathname.startsWith('/api/') && req.method === 'GET' && serveStatic(req, res, url.pathname)) return;
    return send(404, { error: 'Not found' });
  }
  try {
    const sessionId = String(req.headers['x-cart-session'] ?? '');
    if (!/^[0-9a-f-]{36}$/.test(sessionId) && url.pathname !== '/api/health' && url.pathname !== '/api/tokens') throw bad('Missing browser session id.');
    const body = req.method === 'POST' ? await readBody(req) : {};
    send(200, await handler({ body, query: url.searchParams, sessionId }));
  } catch (error) {
    send(error.status ?? 502, { error: error.message });
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`cart api on http://127.0.0.1:${PORT} (payments ${PAY_ENABLED ? 'enabled' : 'off'})`);
  void warmQuotes();
  setInterval(() => void warmQuotes(), 5 * 60_000).unref();
});
