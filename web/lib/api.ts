export type Item = { asin: string; title: string; image: string | null; brand: string | null; store: string; price: number; quantity: number; verified: boolean; url: string };
export type Money = { subtotal: number; shipping: number; tax: number; fee: number; total: number; currency: string };
export type Quote = Money & { asin: string; cartId: string; paymentReady: boolean; expiresAt: string; items: Item[]; zip: string };
export type Order = Money & { orderId: string; orderNumber: string; status: string; paymentReady: boolean; txSignature: string | null; createdAt: string; paidAt: string | null; items: Item[]; error?: string };
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
