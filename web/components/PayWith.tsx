import { useEffect, useMemo, useRef, useState } from 'react';
import { api, short, usd, type SwapQuote, type Token } from '@/lib/api';
import { Chip, ErrorNote, SectionHead } from '@/components/ui';
import { cn } from '@/lib/utils';

const CHAIN: Record<string, string> = { near: 'NEAR', eth: 'Ethereum', sol: 'Solana', btc: 'Bitcoin', base: 'Base', arb: 'Arbitrum', bsc: 'BNB Chain', pol: 'Polygon', ton: 'TON', tron: 'Tron', op: 'Optimism', avax: 'Avalanche', sui: 'Sui', doge: 'Dogecoin', xrp: 'XRP', zec: 'Zcash', ltc: 'Litecoin', aptos: 'Aptos', stellar: 'Stellar' };
export const chainName = (c: string): string => CHAIN[c] ?? c.toUpperCase();
export const SOLANA_USDC = 'nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near';
const QUICK: [string, string][] = [['wNEAR', 'near'], ['ETH', 'eth'], ['BTC', 'btc'], ['SOL', 'sol'], ['USDC', 'sol'], ['USDT', 'tron']];

let tokenCache: Promise<Token[]> | undefined;
const loadTokens = (): Promise<Token[]> => (tokenCache ??= api<Token[]>('/api/tokens').catch((e) => { tokenCache = undefined; throw e; }));

function Hop({ k, v, sub, last }: { k: string; v: string; sub?: string; last?: boolean }) {
  return (
    <li className="relative grid grid-cols-[28px_1fr] gap-x-3">
      <span aria-hidden className="relative flex justify-center">
        <span className="z-10 mt-1.5 size-3 rounded-full bg-lime ring-4 ring-ink" />
        {!last && <span className="wire-v absolute bottom-[-6px] top-5 w-0.5" />}
      </span>
      <div className={last ? '' : 'pb-5'}>
        <p className="text-[13px] font-semibold text-lime/60">{k}</p>
        <p className="num text-[17px] leading-snug text-lime">{v}</p>
        {sub && <p className="num mt-0.5 text-[12px] text-lime/60">{sub}</p>}
      </div>
    </li>
  );
}

function Route({ q, total, busy, onRefresh }: { q: SwapQuote; total: number; busy: boolean; onRefresh: () => void }) {
  const trim = (s: string) => (s.length > 10 ? Number(s).toPrecision(6).replace(/\.?0+$/, '') : s);
  return (
    <div className="mt-5 rounded-[var(--radius-card)] bg-ink p-5 text-lime sm:p-6" aria-label="Payment route">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold text-lime/70">Route, dry quote from 1Click</p>
        <button onClick={onRefresh} className="text-[12px] font-semibold text-lime underline underline-offset-4" disabled={busy}>{busy ? 'Refreshing' : 'Refresh'}</button>
      </div>
      <ol className="mt-5">
        <Hop k="You send" v={`${trim(q.amountIn)} ${q.symbol}`} sub={`on ${chainName(q.chain)} · about ${usd(q.amountInUsd)}`} />
        <Hop k="NEAR Intents" v={q.direct ? 'No swap needed' : `1Click swap and bridge, ~${q.seconds ?? 20}s`} sub={q.direct ? 'Solana USDC is the target asset' : 'exact output, you get precisely the total'} />
        <Hop k="Solana USDC" v={`${total.toFixed(2)} USDC`} sub={q.wallet ? `lands in Cart wallet ${short(q.wallet)}` : 'lands in the Cart wallet'} />
        <Hop k="SP3ND order" v="Amazon order paid" sub="signed by NEAR Chain Signatures" last />
      </ol>
      {!q.direct && (
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-lime/20 pt-4 text-[13px]">
          <div><dt className="text-lime/60">Cost over the item</dt><dd className="num text-[20px]">{usd(q.costUsd)}</dd></div>
          <div><dt className="text-lime/60">Min deposit, 1% slippage</dt><dd className="num text-[20px]">{trim(q.minAmountIn ?? q.amountIn)}</dd></div>
        </dl>
      )}
      <p className="num mt-3 text-[11px] text-lime/50">Quoted {q.quotedAt ? new Date(q.quotedAt).toLocaleTimeString('en-US') : ''}. A dry quote moves no funds.</p>
    </div>
  );
}

type Props = { total: number; value: string | null; onChange: (id: string | null) => void; n?: string; compact?: boolean };

export function PayWith({ total, value, onChange, n = '02', compact }: Props) {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [filter, setFilter] = useState('');
  const [q, setQ] = useState<SwapQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [listOpen, setListOpen] = useState(false);
  const seq = useRef(0);

  useEffect(() => { loadTokens().then(setTokens).catch((e: Error) => setError(e.message)); }, []);

  useEffect(() => {
    if (!value || !(total > 0)) { setQ(null); return; }
    const mine = ++seq.current;
    setBusy(true); setError(null);
    api<SwapQuote>('/api/swap-quote', { assetId: value, total: total.toFixed(2) })
      .then((r) => { if (mine === seq.current) setQ(r); })
      .catch((e: Error) => { if (mine === seq.current) { setQ(null); setError(e.message); } })
      .finally(() => { if (mine === seq.current) setBusy(false); });
  }, [value, total, tick]);

  const seeded = useRef(false);
  useEffect(() => {
    if (!compact || seeded.current || value || !tokens.length) return;
    const eth = tokens.find((t) => t.symbol === 'ETH' && t.blockchain === 'eth');
    if (eth) { seeded.current = true; onChange(eth.assetId); }
  }, [compact, tokens, value, onChange]);

  const quick = useMemo(() => QUICK.map(([s, c]) => tokens.find((t) => t.symbol === s && t.blockchain === c)).filter((t): t is Token => !!t), [tokens]);
  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const list = f ? tokens.filter((t) => `${t.symbol} ${t.blockchain} ${chainName(t.blockchain)}`.toLowerCase().includes(f)) : tokens;
    return list.slice(0, 60);
  }, [tokens, filter]);

  return (
    <section aria-labelledby="paywith">
      {compact ? (
        <p className="text-[16px] font-bold tracking-tight">Pay from any chain</p>
      ) : (
        <>
      <SectionHead n={n} title="Pay with"><span id="paywith" className="sr-only">Pay with</span><Chip>{tokens.length ? `${tokens.length} assets on NEAR Intents` : 'Loading assets'}</Chip></SectionHead>
      <p className="mt-1 max-w-xl text-[14px] text-ink-2">Pick what you hold. 1Click converts it into the Solana USDC the order needs, and the Cart wallet pays.</p>

        </>
      )}

      <div className={cn('flex flex-wrap gap-2', compact ? 'mt-3' : 'mt-4')} role="radiogroup" aria-label="Popular assets">
        {(compact ? quick.slice(0, 5) : quick).map((t) => (
          <button key={t.assetId} role="radio" title={`${t.symbol} on ${chainName(t.blockchain)}`} aria-checked={value === t.assetId} onClick={() => onChange(value === t.assetId ? null : t.assetId)}
            className={cn(compact ? 'h-10 rounded-full px-3.5 text-[15px] font-semibold transition-colors' : 'h-11 rounded-full px-4 text-[15px] font-semibold transition-colors', value === t.assetId ? 'bg-ink text-lime' : 'bg-paper hover:bg-lime-pale')}>
            {t.symbol}{!compact && <span className="ml-1.5 text-[13px] font-medium opacity-60">{chainName(t.blockchain)}</span>}
          </button>
        ))}
      </div>

      {!compact && (
      <details className="group mt-3 rounded-xl bg-paper/60" onToggle={(e) => setListOpen(e.currentTarget.open)}>
        <summary className="flex h-11 cursor-pointer list-none items-center justify-between px-4 text-[14px] font-semibold">
          All assets and chains <span aria-hidden className="text-mute transition-transform group-open:rotate-180">⌄</span>
        </summary>
        <div className="p-3">
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search a token or chain, like near or base" aria-label="Search assets"
            className="h-11 w-full rounded-lg border border-ink/60 bg-white px-3 text-[14px] focus:outline-none" />
          <ul className="mt-2 max-h-64 overflow-auto" role="listbox" aria-label="Assets">
            {listOpen && shown.map((t) => (
              <li key={t.assetId} role="option" aria-selected={value === t.assetId}>
                <button onClick={() => onChange(t.assetId)} className={cn('flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-[14px] hover:bg-lime-pale', value === t.assetId && 'bg-lime-pale font-semibold')}>
                  <span className="w-20 shrink-0 font-semibold">{t.symbol}</span>
                  <Chip>{chainName(t.blockchain)}</Chip>
                  <span className="num ml-auto text-[12px] text-mute">{usd(t.price)}</span>
                </button>
              </li>
            ))}
            {listOpen && !shown.length && <li className="px-3 py-4 text-[14px] text-mute">No asset matches "{filter}".</li>}
          </ul>
        </div>
      </details>
      )}

      {!(total > 0) && <p className="mt-4 text-[14px] text-mute">The route prices once a quote is on the receipt.</p>}
      {error && <ErrorNote>{error}</ErrorNote>}
      {busy && !q && <p className="mt-5 text-[14px] font-medium pulse">Asking 1Click for a dry quote…</p>}
      {q && !compact && <Route q={q} total={total} busy={busy} onRefresh={() => setTick((v) => v + 1)} />}
      {q && compact && (
        <p className="mt-3 text-[14px] leading-snug text-ink-2" aria-live="polite">
          {q.direct
            ? 'Solana USDC needs no swap on mainnet.'
            : <>Live 1Click quote: <span className="num font-bold text-ink">{Number(q.amountIn).toPrecision(4).replace(/\.?0+$/, '')} {q.symbol}</span> becomes exactly {total.toFixed(2)} USDC on Solana in about {q.seconds ?? 20} s. This run pays from the funded testnet wallet.</>}
        </p>
      )}
    </section>
  );
}
