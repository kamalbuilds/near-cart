import { createHash } from 'node:crypto';

const CHECKOUT_API = 'https://www.sp3nd.shop/api/mcp/checkout';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const bodyOf = (result) => result.structuredContent ?? JSON.parse(result.content?.[0]?.text ?? '{}');

export async function quoteWithRetry(mcp, { productUrl, quantity = 1, country = 'US', postal = '10001', attempts = 5 }) {
  let last = 'quote rejected';
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const body = bodyOf(await mcp.callTool('sp3nd_quote_purchase', {
      items: [{ product_url: productUrl, quantity }],
      destination: { country_code: country, postal_code: postal },
    }));
    if (body.success && body.cart) return body.cart;
    last = body.error ?? last;
    await sleep(2500 * attempt);
  }
  throw new Error(`SP3ND quote failed: ${last}`);
}

export function orderKey(cartId, address) {
  return `cart-${createHash('sha256').update(JSON.stringify([cartId, address])).digest('hex').slice(0, 40)}`;
}

export async function createOrder(mcp, { cart, email, shippingAddress }) {
  const body = bodyOf(await mcp.callTool('sp3nd_create_order', {
    cart_id: cart.cart_id,
    idempotency_key: orderKey(cart.cart_id, shippingAddress),
    customer_email: email,
    shipping_address: shippingAddress,
  }));
  if (!body.success || !body.order?.order_id) throw new Error(`SP3ND order creation failed: ${body.error ?? 'rejected'}`);
  return body.order;
}

export async function getOrder(mcp, orderId) {
  const body = bodyOf(await mcp.callTool('sp3nd_get_order', { order_id: orderId }));
  if (!body.success || !body.order) throw new Error(`SP3ND order read failed: ${body.error ?? 'rejected'}`);
  return body.order;
}

export async function checkoutTicket(mcp, orderId) {
  const result = await mcp.callTool('sp3nd_checkout', { order_id: orderId });
  const url = result._meta?.['sp3nd/checkoutUrl'];
  const ticket = url && new URL(url).hash.replace(/^#ticket=/, '');
  if (!ticket) throw new Error('SP3ND checkout did not return a session ticket');
  return ticket;
}

export async function checkoutCall(action, ticket, extra = {}) {
  const response = await fetch(CHECKOUT_API, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://www.sp3nd.shop', referer: 'https://www.sp3nd.shop/mcp/checkout' },
    body: JSON.stringify({ action, ticket, ...extra }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`SP3ND checkout ${action} failed (HTTP ${response.status}): ${json.error ?? 'rejected'}`);
    error.detail = json;
    throw error;
  }
  return json;
}

export const preparePayment = (ticket) => checkoutCall('prepare', ticket);
export const submitPayment = (approvalTicket, signedTransactionBase64) =>
  checkoutCall('submit', approvalTicket, { signed_transaction_base64: signedTransactionBase64 });

export async function waitPaid(mcp, orderId, { timeoutMs = 180_000, intervalMs = 4_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const order = await getOrder(mcp, orderId);
    if (['paid', 'ordered', 'shipped', 'delivered'].includes(String(order.status).toLowerCase())) return order;
    await sleep(intervalMs);
  }
  throw new Error('SP3ND did not confirm payment before the timeout');
}
