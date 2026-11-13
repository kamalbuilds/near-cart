import { openMcp } from './sp3nd.mjs';
import { ensureSession } from './sp3nd-login.mjs';
import { quoteWithRetry } from './shop.mjs';

const [productUrl, quantityArg] = process.argv.slice(2);
if (!productUrl) {
  console.error('usage: quote.mjs <amazon-or-ebay-url> [quantity]');
  process.exit(2);
}

const session = await ensureSession();
const cart = await quoteWithRetry(await openMcp(session), {
  productUrl,
  quantity: Number(quantityArg ?? 1),
  country: process.env.CART_COUNTRY ?? 'US',
  postal: process.env.CART_POSTAL ?? '10001',
});
console.log(JSON.stringify({
  payment_ready: cart.payment_ready === true,
  total_usdc: cart.total_amount,
  items: cart.items?.map((item) => ({ asin: item.product_id, title: item.product_title, price: item.price, verified: item.server_verified })),
  expires_at: cart.expires_at,
  wallet: session.wallet_address,
}, null, 2));
