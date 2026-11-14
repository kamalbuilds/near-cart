import { useEffect, useRef, useState } from 'react';
import { api, short, type Quote, type TestnetJob } from '@/lib/api';
import { Btn } from '@/components/ui';
import { useNow } from '@/components/Receipt';
import { cn } from '@/lib/utils';


function StepIcon({ state }: { state: string }) {
  if (state === 'done') return <span className="grid size-6 place-items-center rounded-full bg-good text-white"><svg aria-hidden width="12" height="12" viewBox="0 0 12 12"><path d="M2 6.5 4.8 9 10 3.2" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg></span>;
  if (state === 'active') return <span className="grid size-6 place-items-center rounded-full bg-lime"><svg aria-hidden className="spin" width="14" height="14" viewBox="0 0 14 14"><path d="M7 1.5a5.5 5.5 0 1 1-5.5 5.5" stroke="#10120e" strokeWidth="2" fill="none" strokeLinecap="round" /></svg></span>;
  if (state === 'quote') return <span className="grid size-6 place-items-center rounded-full bg-sage-2 text-ink-2"><svg aria-hidden width="12" height="12" viewBox="0 0 12 12"><path d="M1.5 6h9M7.5 3 10.5 6l-3 3" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg></span>;
  if (state === 'failed') return <span className="grid size-6 place-items-center rounded-full bg-bad text-white"><svg aria-hidden width="10" height="10" viewBox="0 0 10 10"><path d="M2 2l6 6M8 2 2 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></span>;
  return <span className="size-6 rounded-full bg-sage" />;
}

const trimNum = (v: string) => Number(v).toPrecision(4).replace(/\.?0+$/, '');

function Line({ icon, title, detail, link, linkLabel, tone }: { icon: string; title: string; detail?: string | null; link?: string | null; linkLabel?: string; tone?: 'lime' }) {
  return (
    <li className="line-in flex flex-wrap items-start gap-x-3 gap-y-1 py-2.5 sm:flex-nowrap">
      <StepIcon state={icon} />
      <div className="min-w-[12rem] flex-1">
        <p className="text-[15px] font-semibold leading-6">{title}</p>
        {detail && <p className="break-words text-[14px] leading-snug text-mute">{detail}</p>}
      </div>
      {link && (
        <a href={link} target="_blank" rel="noreferrer" aria-label={`${title}, open transaction ${linkLabel ?? ''}`}
          className={cn('num ml-9 inline-flex min-h-11 shrink-0 sm:ml-0 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold underline underline-offset-4 transition-colors', tone === 'lime' ? 'bg-lime-pale hover:bg-lime/60' : 'bg-sage hover:bg-sage-2')}>
          {linkLabel}<svg aria-hidden width="11" height="11" viewBox="0 0 12 12"><path d="M3 9 9 3M4.5 3H9v4.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </a>
      )}
    </li>
  );
}

function shareUrl(job: TestnetJob, quote: Quote): string {
  const r = job.result!;
  const title = (quote.items[0]?.title ?? 'an Amazon item').split(/[,|(-]/)[0].trim().slice(0, 60);
  const text = `Bought ${title} on Amazon with no wallet installed. A NEAR testnet account signed, Solana devnet paid ${quote.total.toFixed(2)} USDC, ${job.seconds.toFixed(1)} s.\nNEAR: https://testnet.nearblocks.io/txns/${r.nearTx}\nSolana: https://explorer.solana.com/tx/${r.solanaTx}?cluster=devnet`;
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(location.origin)}`;
}

function Ledger({ job, quote }: { job: TestnetJob; quote: Quote }) {
  const route = job.result?.route ?? job.route;
  const done = job.status === 'done' && job.result;
  const total = quote.total;
  return (
    <div className="mt-5" aria-live="polite">
      <p className="label">Payment receipt</p>
      <ol className="mt-1 divide-y divide-dashed divide-line">
        {route && !route.direct && (
          <Line icon="quote" title={`Quoted by NEAR Intents: ${trimNum(route.amountIn)} ${route.symbol} to ${total.toFixed(2)} USDC`} detail={`Live 1Click quote, about ${route.seconds ?? 20} s on mainnet. This run pays from the funded testnet wallet.`} />
        )}
        {job.steps.filter((s) => s.state !== 'pending').map((s) => (
          <Line key={s.id} icon={s.state} title={s.label}
            detail={s.id === 'paid' && s.state === 'done' ? `${total.toFixed(2)} USDC from the Cart wallet to the merchant, memo on chain` : s.id === 'verified' && done ? `Merchant balance rose by exactly ${Number(job.result!.amount).toFixed(2)} USDC, read at slot ${job.result!.slot.toLocaleString('en-US')}` : s.detail}
            link={s.state === 'done' ? s.link : null} linkLabel={s.ref ? short(s.ref, 4, 4) : undefined} tone={s.id === 'paid' ? 'lime' : undefined} />
        ))}
      </ol>
      {done && (
        <div className="line-in mt-3 border-t-2 border-dashed border-ink/70 pt-4">
          <p className="text-[20px] font-bold leading-tight tracking-tight">Paid in {job.seconds.toFixed(1)} seconds, two chains, no wallet installed.</p>
          <p className="mt-1.5 break-words text-[14px] text-mute">Memo on chain: {job.result!.memo}</p>
          <a href={shareUrl(job, quote)} target="_blank" rel="noreferrer" className="mt-4 inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-[15px] font-semibold text-lime transition-colors hover:bg-lime-deep">
            <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 2H22l-7.2 8.2L23.3 22h-6.6l-5.2-6.8L5.6 22H2.5l7.7-8.8L1.8 2h6.8l4.7 6.2L18.9 2Zm-1.2 18h1.8L7.4 3.9H5.5L17.7 20Z" /></svg>
            Post result on X
          </a>
        </div>
      )}
    </div>
  );
}

export function TestnetPay({ quote, expired, assetId, onDone }: { quote: Quote; expired: boolean; assetId: string | null; onDone: (job: TestnetJob) => void }) {
  const [job, setJob] = useState<TestnetJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [pending, setPending] = useState(false);
  const alive = useRef(true);
  const done = useRef(onDone);
  done.current = onDone;
  const now = useNow(100);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { setJob(null); setError(null); }, [quote.cartId]);

  useEffect(() => {
    if (!job || job.status !== 'running') return;
    const timer = setTimeout(async () => {
      try {
        const next = await api<TestnetJob>(`/api/testnet/job?id=${encodeURIComponent(job.id)}`);
        if (!alive.current) return;
        setJob(next);
        if (next.status === 'done') done.current(next);
      } catch (e) {
        if (alive.current) { setError((e as Error).message); setJob(null); }
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [job]);

  async function start() {
    setError(null); setPending(true); setStartedAt(Date.now());
    try {
      const next = await api<TestnetJob>('/api/testnet/pay', { cartId: quote.cartId, assetId });
      if (alive.current) setJob(next);
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setPending(false);
    }
  }

  const running = job?.status === 'running';
  const failed = job?.status === 'failed';
  const finished = job?.status === 'done' && !!job.result;
  return (
    <div className="contents">
      {!running && !finished && (
        <>
          <Btn type="button" onClick={start} disabled={pending || expired} className="sticky bottom-3 z-10 mt-5 h-14 w-full text-[17px]">
            {pending ? 'Starting…' : failed ? 'Try the payment again' : `Pay ${quote.total.toFixed(2)} USDC on testnet`}
          </Btn>
          <p className="mt-3 text-[14px] text-mute">
            {expired ? 'This quote expired. Price the item again.' : 'Cart’s NEAR testnet account signs for a Solana devnet wallet. Nothing to install, no funds needed.'}
          </p>
        </>
      )}
      {running && job && (
        <div className="mt-5 flex items-baseline justify-between">
          <p className="text-[18px] font-bold tracking-tight">{job.queue > 0 ? `Waiting for the signer, ${job.queue} ahead` : 'Printing the receipt as each chain answers'}</p>
          <p className="num shrink-0 whitespace-nowrap pl-3 text-[18px] font-bold">{((now - startedAt) / 1000).toFixed(1)} s</p>
        </div>
      )}
      {job && (running || finished || job.steps.some((s) => s.state !== 'pending')) && <Ledger job={job} quote={quote} />}
      {(error || failed) && (
        <p role="alert" className="mt-3 rounded-xl bg-bad/10 px-4 py-3 text-[15px] font-medium text-[#8a1c21]">
          {error ?? job?.error}
        </p>
      )}
    </div>
  );
}
