import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, type Order, type Quote } from '@/lib/api';
import { Btn, ErrorNote, Field, SectionHead } from '@/components/ui';
import { EmptyReceipt, Receipt, useNow } from '@/components/Receipt';
import { PayWith } from '@/components/PayWith';

const SAMPLES: [string, string][] = [['BIC pens', 'B00006IE7J'], ['Instant Pot', 'B00FLYWNYQ']];

function watchLine(q: Quote): string {
  const key = `cart.watch.${q.asin}`;
  const seen: { t: string; total: number }[] = JSON.parse(localStorage.getItem(key) ?? '[]');
  const last = seen.at(-1);
  localStorage.setItem(key, JSON.stringify([...seen, { t: new Date().toISOString(), total: q.total }].slice(-30)));
  if (!last) return 'First time you priced this item. Cart keeps each live quote so you can see it move.';
  const d = q.total - last.total;
  const day = new Date(last.t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (Math.abs(d) < 0.005) return `Same as your ${day} quote: ${last.total.toFixed(2)} USDC. ${seen.length + 1} quotes saved.`;
  return `${d < 0 ? 'Down' : 'Up'} ${Math.abs(d).toFixed(2)} USDC since your ${day} quote of ${last.total.toFixed(2)}. ${seen.length + 1} quotes saved.`;
}

const blank = { recipient: '', email: '', phone: '', address1: '', address2: '', city: '', state: '', postalCode: '' };

export function Shop({ active }: { active: boolean }) {
  const [input, setInput] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [watch, setWatch] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(0);
  const [asset, setAsset] = useState<string | null>(null);
  const [form, setForm] = useState(blank);
  const [ordering, setOrdering] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const now = useNow();
  const ctl = useRef<AbortController | null>(null);

  useEffect(() => () => ctl.current?.abort(), []);

  async function lookup(raw: string) {
    ctl.current?.abort();
    const c = (ctl.current = new AbortController());
    setBusy(true); setError(null); setQuote(null); setStarted(Date.now());
    try {
      const q = await api<Quote>('/api/quote', { input: raw }, c.signal);
      setQuote(q); setWatch(watchLine(q));
    } catch (e) {
      if (!c.signal.aborted) setError((e as Error).message);
    } finally {
      if (!c.signal.aborted) setBusy(false);
    }
  }

  const submit = (e: FormEvent) => { e.preventDefault(); void lookup(input); };
  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function createOrder(e: FormEvent) {
    e.preventDefault();
    if (!quote) return;
    setOrdering(true); setOrderError(null);
    try {
      const { email, ...address } = form;
      const order = await api<Order>('/api/order', { cartId: quote.cartId, email, address });
      if (asset) sessionStorage.setItem(`cart.src.${order.orderId}`, asset);
      location.hash = `#/order/${encodeURIComponent(order.orderId)}`;
    } catch (err) {
      setOrderError((err as Error).message);
    } finally {
      setOrdering(false);
    }
  }

  const item = quote?.items[0];
  const expired = quote ? Date.parse(quote.expiresAt) <= now : false;

  return (
    <div hidden={!active} className="grid gap-x-14 gap-y-10 pb-24 lg:grid-cols-[minmax(0,1fr)_420px] lg:grid-rows-[auto_1fr]">
      <section className="pt-8 sm:pt-14">
        <p className="label">Shop Amazon · pay from any chain</p>
        <h1 className="display mt-4 max-w-5xl text-[clamp(2.5rem,6.2vw,4.4rem)] !leading-[1.02]">
          Buy it on Amazon.<br /><span className="bg-lime px-[0.12em] [box-decoration-break:clone]">Pay from any chain.</span>
        </h1>
        <p className="mt-6 max-w-xl text-[17px] leading-snug text-ink-2">
          Paste a product link. A NEAR account's Chain Signatures wallet settles the order in Solana USDC, and NEAR Intents converts whatever you hold.
        </p>

        <form onSubmit={submit} className="mt-8 max-w-3xl">
          <label htmlFor="link" className="sr-only">Amazon link or ASIN</label>
          <div className="flex items-center gap-2 rounded-full border-[1.5px] border-ink bg-paper p-1.5 pl-5 shadow-[0_6px_0_0_var(--color-ink)] focus-within:outline-3 focus-within:outline-offset-4 focus-within:outline-ink">
            <svg aria-hidden width="20" height="20" viewBox="0 0 20 20" className="shrink-0 text-mute"><path d="M8.5 11.5a3.5 3.5 0 0 0 5 0l2.6-2.6a3.5 3.5 0 0 0-5-5l-.9.9M11.5 8.5a3.5 3.5 0 0 0-5 0l-2.6 2.6a3.5 3.5 0 0 0 5 5l.9-.9" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" /></svg>
            <input id="link" value={input} onChange={(e) => setInput(e.target.value)} placeholder="amazon.com/dp/… or an ASIN" autoComplete="off" spellCheck={false}
              className="bare h-12 min-w-0 flex-1 bg-transparent text-[16px] placeholder:text-mute/70 focus:outline-none focus-visible:outline-none" />
            <button type="submit" disabled={busy || !input.trim()} aria-label="Get a live quote"
              className="grid size-12 shrink-0 place-items-center rounded-full bg-lime text-ink ring-[1.5px] ring-ink transition-[transform,background-color] hover:bg-lime-hi active:scale-95 disabled:opacity-40">
              <svg aria-hidden width="20" height="20" viewBox="0 0 20 20"><path d="M4 10h11M10.5 5l5 5-5 5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2 text-[13px]">
            <span className="label mr-1">Try</span>
            {SAMPLES.map(([name, asin]) => (
              <button key={asin} type="button" onClick={() => { setInput(asin); void lookup(asin); }} className="h-9 rounded-full border border-ink/50 px-3.5 font-semibold hover:bg-lime-pale">
                {name} <span className="num ml-1 text-mute">{asin}</span>
              </button>
            ))}
          </div>
          {error && <ErrorNote>{error}</ErrorNote>}
        </form>
      </section>

      <aside className="lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:pt-14">
        <div className="lg:sticky lg:top-6">
          {quote && item ? (
            <Receipt kind="quote" item={item} money={quote} expiresAt={quote.expiresAt} watch={watch} />
          ) : (
            <EmptyReceipt busy={busy} seconds={Math.max(0, Math.floor((now - started) / 1000))} />
          )}
        </div>
      </aside>

      <div className="space-y-14 lg:col-start-1 lg:row-start-2">
        <div className="space-y-14">
          <PayWith total={quote?.total ?? 0} value={asset} onChange={setAsset} />

          <section aria-labelledby="ship">
            <SectionHead n="03" title="Ship to"><span id="ship" className="sr-only">Ship to</span></SectionHead>
            <p className="mt-1 max-w-xl text-[14px] text-ink-2">The store delivers within the United States. Tax and the final total are set from this address.</p>
            <form onSubmit={createOrder} className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Recipient" value={form.recipient} onChange={set('recipient')} autoComplete="name" required className="sm:col-span-2" />
              <Field label="Email for the receipt" type="email" value={form.email} onChange={set('email')} autoComplete="email" required />
              <Field label="Phone" type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" required hint="Carriers need a US number to deliver." />
              <Field label="Street address" value={form.address1} onChange={set('address1')} autoComplete="address-line1" required className="sm:col-span-2" />
              <Field label="Apt, suite (optional)" value={form.address2} onChange={set('address2')} autoComplete="address-line2" className="sm:col-span-2" />
              <Field label="City" value={form.city} onChange={set('city')} autoComplete="address-level2" required />
              <div className="grid grid-cols-2 gap-4">
                <Field label="State" value={form.state} onChange={set('state')} maxLength={2} placeholder="NY" autoComplete="address-level1" required />
                <Field label="ZIP" value={form.postalCode} onChange={set('postalCode')} inputMode="numeric" placeholder="10118" autoComplete="postal-code" required />
              </div>
              <div className="flex flex-wrap items-center gap-4 pt-2 sm:col-span-2">
                <Btn type="submit" disabled={!quote || expired || ordering}>{ordering ? 'Creating order…' : 'Create order'}</Btn>
                <span className="text-[13px] text-mute">{!quote ? 'Get a quote first.' : expired ? 'The quote expired. Paste the link again.' : 'Creates the order at the store. Nothing is charged yet.'}</span>
              </div>
              {orderError && <div className="sm:col-span-2"><ErrorNote>{orderError}</ErrorNote></div>}
            </form>
          </section>
        </div>

      </div>
    </div>
  );
}
