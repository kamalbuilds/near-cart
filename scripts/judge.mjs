// npm run judge: unit checks, the live site, and the evidence transactions, against real endpoints.
import { spawnSync } from 'node:child_process';

const LIVE = process.env.CART_LIVE_URL ?? 'https://near-cart.nearlive.workers.dev';
const SOLANA_TX = '4DTDZ1BmtLpMsBGo5FNGzfrS9k27esj5htTi8vRDyWVRMyr2mzo1L1N9E5vMBNwCrD2uvMfygAhwJJbUKPgi1yyE';
const NEAR_TX = 'FuLvRaYixAYo36myyeZczp5iPbgfYFkDDXeYCmVyHfoS';
const NEAR_ACCOUNT = 'cart-spike-1313-kamal.testnet';
const rpc = async (url, method, params) => (await (await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(20_000) })).json()).result;

const checks = [
  ['unit checks pass', async () => { const r = spawnSync('npm', ['test'], { encoding: 'utf8' }); if (r.status !== 0) throw new Error(r.stdout.slice(-400)); }],
  ['live page serves Cart', async () => { const html = await (await fetch(LIVE, { signal: AbortSignal.timeout(20_000) })).text(); if (!/<title>Cart/.test(html)) throw new Error('title missing'); }],
  ['live API answers', async () => { const r = await (await fetch(`${LIVE}/api/health`, { signal: AbortSignal.timeout(20_000) })).json(); if (!r.ok) throw new Error(JSON.stringify(r)); }],
  ['Solana devnet payment landed without error', async () => {
    const r = await rpc('https://api.devnet.solana.com', 'getTransaction', [SOLANA_TX, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]);
    if (!r || r.meta.err) throw new Error('missing or failed');
  }],
  ['NEAR testnet signer call is final', async () => {
    const r = await rpc('https://near-testnet.drpc.org', 'tx', { tx_hash: NEAR_TX, sender_account_id: NEAR_ACCOUNT, wait_until: 'EXECUTED' });
    if (!r || r.transaction.receiver_id !== 'v1.signer-prod.testnet' || !/FINAL|EXECUTED/.test(r.final_execution_status)) throw new Error('not final');
  }],
];

let failed = 0;
for (const [name, run] of checks) {
  try { await run(); console.log(`PASS ${name}`); } catch (error) { failed += 1; console.log(`FAIL ${name}: ${error.message}`); }
}
process.exit(failed ? 1 : 0);
