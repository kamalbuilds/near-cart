import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, type Order, type Quote } from '@/lib/api';
import { Btn, ErrorNote, Field, SectionHead } from '@/components/ui';
import { EmptyReceipt, Receipt, useNow } from '@/components/Receipt';
import { PayWith } from '@/components/PayWith';
import { TestnetPay } from '@/components/TestnetPay';
import { useMode } from '@/lib/mode';

const SAMPLES: [string, string][] = [['BIC pens', 'B00006IE7J'], ['Instant Pot', 'B00FLYWNYQ']];
const FIRST = 'B00006IE7J';

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
  const [paid, setPaid] = useState(false);
  const mode = useMode();
  const now = useNow();
  const auto = useRef(false);
  const ctl = useRef<AbortController | null>(null);

  useEffect(() => () => ctl.current?.abort(), []);
  useEffect(() => {
    if (auto.current || !active) return;
    auto.current = true;
    setInput(FIRST);
    void lookup(FIRST);
  }, [active]);

  async function lookup(raw: string) {
    ctl.current?.abort();
    const c = (ctl.current = new AbortController());
    setBusy(true); setError(null); setQuote(null); setPaid(false); setStarted(Date.now());
    try {
      const q = await api<Quote>('/api/quote', { input: raw, fresh: mode === 'mainnet' }, c.signal);
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
  const testnet = mode === 'testnet';

  return (
    <div hidden={!active} className="pb-24">
      <div className="grid gap-x-14 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:grid-rows-[auto_1fr]">
        <section className="pt-4 sm:pt-12 lg:col-start-1 lg:row-start-1">
          <h1 className="display max-w-[11em] text-[clamp(2rem,5.4vw,4.4rem)]">
            Buy it on Amazon. Pay from any chain.
          </h1>
          <p className="mt-5 max-w-xl text-[18px] leading-snug text-ink-2">
            {testnet
              ? <>Paste a link. The store prices it live, and a NEAR account signs the Solana USDC payment through Chain Signatures.<span className="hidden sm:inline"> Press pay and watch both chains.</span></>
              : 'Paste a link. The store prices it live, NEAR Intents converts whatever you hold into Solana USDC, and a NEAR account signs the payment.'}
          </p>

          <form onSubmit={submit} className="mt-8 max-w-2xl">
            <label htmlFor="link" className="sr-only">Amazon link or ASIN</label>
            <div className="flex items-center gap-2 rounded-2xl bg-paper p-2 pl-5 focus-within:outline-3 focus-within:outline-offset-4 focus-within:outline-ink">
              <input id="link" value={input} onChange={(e) => setInput(e.target.value)} placeholder="amazon.com/dp/… or an ASIN" autoComplete="off" spellCheck={false}
                className="bare h-12 min-w-0 flex-1 bg-transparent text-[17px] placeholder:text-mute/70 focus:outline-none" />
              <button type="submit" disabled={busy || !input.trim()}
                className="h-12 shrink-0 rounded-xl bg-ink px-6 text-[16px] font-semibold text-lime transition-[transform,background-color] hover:bg-lime-deep active:scale-95 disabled:opacity-45 disabled:active:scale-100">
                {busy ? 'Pricing…' : 'Price it'}
              </button>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-[15px]">
              <span className="mr-1 text-mute">Or try</span>
              {SAMPLES.map(([name, asin]) => (
                <button key={asin} type="button" onClick={() => { setInput(asin); void lookup(asin); }} className="h-10 rounded-full bg-sage px-4 font-semibold hover:bg-sage-2">
                  {name}
                </button>
              ))}
            </div>
            {error && <ErrorNote>{error}</ErrorNote>}
          </form>

        </section>

        <aside className="lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:pt-12">
          <div className="lg:sticky lg:top-6">
            {quote && item ? (
              <Receipt kind="quote" item={item} money={quote} expiresAt={quote.expiresAt} watch={watch} paid={paid}>
                {testnet ? (
                  <TestnetPay quote={quote} expired={expired} onDone={() => setPaid(true)} />
                ) : (
                  <a href="#pay" className="mt-6 flex h-14 w-full items-center justify-center rounded-full bg-ink text-[17px] font-semibold text-lime hover:bg-lime-deep">Choose how you pay</a>
                )}
              </Receipt>
            ) : (
              <EmptyReceipt busy={busy} seconds={Math.max(0, Math.floor((now - started) / 1000))} failed={error ? 'Pricing did not finish. Nothing was charged.' : null} onRetry={() => void lookup(input || FIRST)} />
            )}
            {paid && (
              <button type="button" onClick={() => { setQuote(null); setPaid(false); setInput(''); }} className="mt-5 h-11 rounded-full bg-sage px-5 text-[15px] font-semibold hover:bg-sage-2">Price another item</button>
            )}
          </div>
        </aside>

        <ul className="grid max-w-2xl gap-3 self-start sm:grid-cols-3 lg:col-start-1 lg:row-start-2">
          {[
            ['Amazon prices it', 'SP3ND checks the live price, shipping and tax and holds it for 30 minutes.'],
            ['NEAR signs', 'One NEAR account controls a Solana wallet through Chain Signatures. No Solana key exists.'],
            ['USDC settles', testnet ? 'The payment lands on Solana devnet and the merchant balance is read back.' : 'SP3ND receives Solana USDC and places the Amazon order.'],
          ].map(([t, d]) => (
            <li key={t} className="rounded-2xl bg-sage/70 p-4">
              <p className="text-[16px] font-bold tracking-tight">{t}</p>
              <p className="mt-1 text-[14px] leading-snug text-ink-2">{d}</p>
            </li>
          ))}
        </ul>
      </div>

      {!testnet && (
        <div id="pay" className="mt-16 max-w-3xl space-y-14">
          <PayWith total={quote?.total ?? 0} value={asset} onChange={setAsset} />

          <section aria-labelledby="ship">
            <SectionHead title="Ship to"><span id="ship" className="sr-only">Ship to</span></SectionHead>
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
      )}
    </div>
  );
}
