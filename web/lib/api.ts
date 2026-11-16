export type Item = { asin: string; title: string; image: string | null; brand: string | null; store: string; price: number; quantity: number; verified: boolean; url: string };
export type Money = { subtotal: number; shipping: number; tax: number; fee: number; total: number; currency: string };
export type Quote = Money & { asin: string; cartId: string; ticket: string; paymentReady: boolean; expiresAt: string; items: Item[]; zip: string };
export type Order = Money & { orderId: string; ref: string; orderNumber: string; status: string; paymentReady: boolean; txSignature: string | null; createdAt: string; paidAt: string | null; items: Item[]; error?: string };
export type Token = { assetId: string; symbol: string; blockchain: string; decimals: number; price: number };
export type SwapQuote = {
  symbol: string; chain: string; decimals: number; direct: boolean; amountIn: string; minAmountIn?: string;
  amountInUsd: number; amountOutUsd?: number; costUsd: number; seconds?: number; deadline?: string; quotedAt?: string; wallet?: string;
};
export type Step = { id: string; label: string; state: 'pending' | 'active' | 'done' | 'failed'; detail: string | null; link: string | null };
export type FundingRow = { asset: 'usdc' | 'sol'; amountAtomic: string; state: string; direct?: boolean; depositAddress: string; depositMemo?: string | null; symbol?: string; chain: string; amountIn?: string };
export type Job = { orderId: string; status: 'running' | 'done' | 'failed'; error: string | null; steps: Step[]; funding: FundingRow[]; startedAt: string };
export type Prepared = { alreadyPaid?: boolean; network: string; payer: string; recipient: string; amount: string; currency: string; memo: string; checks: string };
export type Wallet = { address: string; account: string; nearNetwork: string; usdc: string; sol: string };

const key = 'cart.session';
export const sessionId = (): string => {
  let id = localStorage.getItem(key);
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(key, id); }
  return id;
};

// Order refs are sealed by the server; this browser keeps the list.
const ordersKey = 'cart.orders';
export const orderRefs = (): string[] => { try { return JSON.parse(localStorage.getItem(ordersKey) ?? '[]'); } catch { return []; } };
export const rememberOrder = (ref: string): void => localStorage.setItem(ordersKey, JSON.stringify([ref, ...orderRefs().filter((r) => r !== ref)].slice(0, 20)));

// Reads an NDJSON response, calling onEvent for each line as it arrives.
export async function apiStream<T>(path: string, body: unknown, onEvent: (event: T) => void): Promise<void> {
  const res = await fetch(path, { method: 'POST', headers: { 'x-cart-session': sessionId(), 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok || !res.body) {
    const json = await res.json().catch(() => ({ error: `Server answered HTTP ${res.status} with no JSON.` }));
    throw new Error(json.error ?? `HTTP ${res.status}`);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) if (line.trim()) onEvent(JSON.parse(line) as T);
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer) as T);
}

export async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST', signal,
    headers: { 'x-cart-session': sessionId(), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({ error: `Server answered HTTP ${res.status} with no JSON.` }));
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json as T;
}

export const usd = (n: number): string => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
export const short = (s: string, a = 4, b = 4): string => (s.length > a + b + 1 ? `${s.slice(0, a)}…${s.slice(-b)}` : s);
export const PAID = ['paid', 'ordered', 'shipped', 'delivered'];
export const isPaid = (status: string): boolean => PAID.includes(status.toLowerCase());
export const when = (iso: string): string => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export type TestnetStep = { id: string; label: string; state: 'pending' | 'active' | 'done' | 'failed'; detail: string | null; link: string | null; ref?: string };
export type TestnetJob = {
  id: string; status: 'running' | 'done' | 'failed'; error: string | null; steps: TestnetStep[]; elapsed: number; seconds: number; queue: number; route?: SwapQuote | null;
  result: { route: SwapQuote | null; payer: string; memo: string; nearTx: string; solanaTx: string; slot: number; merchant: string; mint: string; amount: string } | null;
};
export type TestnetWallet = { address: string; account: string; nearNetwork: string; usdc: string; sol: string; merchant: string; mint: string };
