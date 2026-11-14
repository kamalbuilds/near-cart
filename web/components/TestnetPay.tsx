import { useEffect, useRef, useState } from 'react';
import { api, short, type Quote, type TestnetJob } from '@/lib/api';
import { Btn } from '@/components/ui';
import { useNow } from '@/components/Receipt';
import { cn } from '@/lib/utils';


function StepIcon({ state }: { state: string }) {
  if (state === 'done') return <span className="grid size-6 place-items-center rounded-full bg-good text-white"><svg aria-hidden width="12" height="12" viewBox="0 0 12 12"><path d="M2 6.5 4.8 9 10 3.2" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg></span>;
  if (state === 'active') return <span className="grid size-6 place-items-center rounded-full bg-lime"><svg aria-hidden className="spin" width="14" height="14" viewBox="0 0 14 14"><path d="M7 1.5a5.5 5.5 0 1 1-5.5 5.5" stroke="#10120e" strokeWidth="2" fill="none" strokeLinecap="round" /></svg></span>;
  if (state === 'failed') return <span className="grid size-6 place-items-center rounded-full bg-bad text-white"><svg aria-hidden width="10" height="10" viewBox="0 0 10 10"><path d="M2 2l6 6M8 2 2 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></span>;
  return <span className="size-6 rounded-full bg-sage" />;
}

export function Proof({ job, total }: { job: TestnetJob; total: number }) {
  const r = job.result!;
  return (
    <div className="mt-6" aria-live="polite">
      <p className="text-[20px] font-bold leading-tight tracking-tight">Paid in {job.seconds.toFixed(1)} seconds, two chains, no wallet installed.</p>
      <div className="mt-4 grid gap-2.5">
        {r.route && !r.route.direct && (
          <>
            <div className="rounded-2xl bg-sage/60 px-4 py-3">
              <span className="block text-[15px] font-bold">NEAR Intents routes {Number(r.route.amountIn).toPrecision(4).replace(/\.?0+$/, '')} {r.route.symbol}</span>
              <span className="block text-[14px] text-mute">Live 1Click quote for exactly {Number(r.amount).toFixed(2)} USDC on Solana, about {r.route.seconds ?? 20} s on mainnet</span>
            </div>
            <div aria-hidden className="mx-auto -my-1 h-3" />
          </>
        )}
        <a href={`https://testnet.nearblocks.io/txns/${r.nearTx}`} target="_blank" rel="noreferrer" className="group flex items-center justify-between gap-3 rounded-2xl bg-sage px-4 py-3 transition-colors hover:bg-sage-2">
          <span><span className="block text-[15px] font-bold">NEAR testnet signs</span><span className="block text-[14px] text-mute">Chain Signatures returns an Ed25519 signature for {short(r.payer, 4, 4)}</span></span>
          <span className="num shrink-0 text-[14px] font-semibold underline underline-offset-4">{short(r.nearTx, 4, 4)}</span>
        </a>
        <div aria-hidden className="mx-auto -my-1 flex h-6 items-center gap-2 text-[13px] font-semibold text-mute"><svg width="14" height="18" viewBox="0 0 14 18"><path d="M7 1v14M2 10.5 7 16l5-5.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>signature</div>
        <a href={`https://explorer.solana.com/tx/${r.solanaTx}?cluster=devnet`} target="_blank" rel="noreferrer" className="group flex items-center justify-between gap-3 rounded-2xl bg-lime-pale px-4 py-3 transition-colors hover:bg-lime/60">
          <span><span className="block text-[15px] font-bold">Solana devnet pays {total.toFixed(2)} USDC</span><span className="block text-[14px] text-lime-deep">Merchant balance rose by exactly {Number(r.amount).toFixed(2)}, read back at slot {r.slot.toLocaleString('en-US')}</span></span>
          <span className="num shrink-0 text-[14px] font-semibold underline underline-offset-4">{short(r.solanaTx, 4, 4)}</span>
        </a>
      </div>
      <p className="mt-3 text-[14px] text-mute">Memo on chain: {r.memo}</p>
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

  if (job?.status === 'done' && job.result) return <Proof job={job} total={quote.total} />;

  const running = job?.status === 'running';
  const failed = job?.status === 'failed';
  return (
    <div className="mt-5">
      {!running && (
        <>
          <Btn type="button" onClick={start} disabled={pending || expired} className="sticky bottom-3 z-10 h-14 w-full text-[17px]">
            {pending ? 'Starting…' : failed ? 'Try the payment again' : `Pay ${quote.total.toFixed(2)} USDC on testnet`}
          </Btn>
          <p className="mt-3 text-[14px] text-mute">
            {expired ? 'This quote expired. Price the item again.' : 'Cart’s NEAR testnet account signs for a Solana devnet wallet. Nothing to install, no funds needed.'}
          </p>
        </>
      )}
      {running && job && (
        <div aria-live="polite">
          <div className="flex items-baseline justify-between">
            <p className="text-[18px] font-bold tracking-tight">{job.queue > 0 ? `Waiting for the signer, ${job.queue} ahead` : 'Paying on two chains'}</p>
            <p className="num text-[18px] font-bold">{((now - startedAt) / 1000).toFixed(1)} s</p>
          </div>
          <ol className="mt-4 space-y-3">
            {job.steps.map((s) => (
              <li key={s.id} className="flex items-start gap-3">
                <StepIcon state={s.state} />
                <div className="min-w-0">
                  <p className={cn('text-[15px] font-semibold leading-6', s.state === 'pending' && 'text-mute')}>{s.label}</p>
                  {s.detail && s.state !== 'pending' && <p className="break-words text-[14px] text-mute">{s.detail}</p>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
      {(error || failed) && (
        <p role="alert" className="mt-3 rounded-xl bg-bad/10 px-4 py-3 text-[15px] font-medium text-[#8a1c21]">
          {error ?? job?.error}
        </p>
      )}
    </div>
  );
}
