// node scripts/testnet-run.mjs <amazon url or ASIN>   (quote from SP3ND, payment on NEAR testnet + Solana devnet)
import { openMcp } from './sp3nd.mjs';
import { ensureSession, NETWORK, ACCOUNT } from './sp3nd-login.mjs';
import { quoteWithRetry } from './shop.mjs';
import { parseProduct } from './cart-core.mjs';
import { payOnTestnet } from './testnet.mjs';

const { asin, url } = parseProduct(process.argv[2] ?? 'B00006IE7J');
const session = await ensureSession();
const mcp = await openMcp(session);
const cart = await quoteWithRetry(mcp, { productUrl: url, quantity: 1, country: 'US', postal: '10001', attempts: 3 });
console.log(`quote ${asin} total ${cart.total_amount} USDC cart ${cart.cart_id}`);
const started = Date.now();
const result = await payOnTestnet({
  network: NETWORK, account: ACCOUNT, total: String(cart.total_amount), cartId: cart.cart_id, asin,
  onStep: (id, s) => console.log(`${((Date.now() - started) / 1000).toFixed(1)}s ${id} ${s.state} ${s.detail ?? ''} ${s.link ?? ''}`),
});
console.log(JSON.stringify(result));
