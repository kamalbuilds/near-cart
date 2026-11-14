import { useCallback, useEffect, useState } from 'react';
import { api, isPaid, short, when, type Job, type Order, type Prepared, type Step, type Wallet } from '@/lib/api';
import { Btn, Chip, Dot, ErrorNote, SectionHead } from '@/components/ui';
import { Receipt } from '@/components/Receipt';
import { PayWith, chainName } from '@/components/PayWith';
import { cn } from '@/lib/utils';

type Detail = { order: Order; job: Job | null; payEnabled: boolean };

function Timeline({ steps }: { steps: Step[] }) {
  return (
    <ol className="mt-5 space-y-0">
      {steps.map((s, i) => (
        <li key={s.id} className="relative flex gap-4 pb-6 last:pb-0">
          {i < steps.length - 1 && <span aria-hidden className={cn('absolute left-[11px] top-7 h-[calc(100%-1.5rem)] w-0.5', s.state === 'done' ? 'bg-good' : 'bg-line')} />}
          <span aria-hidden className={cn('relative z-10 mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2 text-[11px] font-bold',
            s.state === 'done' && 'border-good bg-good text-white', s.state === 'active' && 'border-ink bg-lime pulse', s.state === 'failed' && 'border-bad bg-bad text-white', s.state === 'pending' && 'border-line bg-paper text-mute')}>
            {s.state === 'done' ? '✓' : s.state === 'failed' ? '!' : i + 1}
          </span>
          <div className="min-w-0">
            <p className={cn('text-[16px] font-semibold', s.state === 'pending' && 'text-mute')}>
              {s.label}
              <span className="sr-only"> {s.state}</span>
            </p>
            {s.detail && <p className="num mt-0.5 break-all text-[12px] text-ink-2">{s.detail}</p>}
            {s.link && <a className="mt-1 inline-block text-[13px] font-semibold underline underline-offset-4" href={s.link} target="_blank" rel="noreferrer">View transaction ↗</a>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function OrderView({ orderId }: { orderId: string }) {
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prep, setPrep] = useState<Prepared | null>(null);
  const [prepError, setPrepError] = useState<string | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [asset, setAsset] = useState<string | null>(() => sessionStorage.getItem(`cart.src.${orderId}`));
  const [confirmed, setConfirmed] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setD(await api<Detail>(`/api/order?id=${encodeURIComponent(orderId)}`)); setError(null); } catch (e) { setError((e as Error).message); }
  }, [orderId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (d?.job?.status !== 'running') return;
    const id = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 10000);
    return () => clearInterval(id);
  }, [d?.job?.status, load]);

  const paid = d ? isPaid(d.order.status) : false;
  useEffect(() => {
    api<Wallet>('/api/wallet').then(setWallet).catch(() => setWallet(null));
  }, [d?.job?.status]);
  useEffect(() => {
    if (!d || paid) return;
    setPrepError(null);
    api<Prepared>('/api/prepare', { orderId }).then(setPrep).catch((e: Error) => setPrepError(e.message));
  }, [orderId, paid, d?.order.total]); // eslint-disable-line react-hooks/exhaustive-deps

  const pay = async () => {
    if (!d) return;
    setPayError(null);
    try {
      await api('/api/pay', { orderId, confirm: true, expectTotal: d.order.total.toFixed(2), sourceAssetId: asset ?? undefined });
      await load();
    } catch (e) { setPayError((e as Error).message); }
  };

  if (error && !d) return <div className="py-16"><ErrorNote>{error}</ErrorNote><a href="#/orders" className="mt-4 inline-block font-semibold underline underline-offset-4">Back to orders</a></div>;
  if (!d) return <p className="py-24 text-[17px] font-medium pulse">Reading the order from SP3ND…</p>;

  const { order, job } = d;
  const item = order.items[0];
  const steps: Step[] = job?.steps ?? [
    { id: 'created', label: 'Order created at SP3ND', state: 'done', detail: order.orderNumber, link: null },
    { id: 'funded', label: 'Cart wallet funded', state: 'pending', detail: wallet ? `Holds ${wallet.usdc} USDC, needs ${order.total.toFixed(2)}` : null, link: null },
    { id: 'prepared', label: 'Payment prepared and checked', state: prep ? 'done' : prepError ? 'failed' : 'active', detail: prep ? `${prep.amount} USDC, memo ${prep.memo}` : prepError, link: null },
    { id: 'signed', label: 'Signed by Chain Signatures', state: 'pending', detail: null, link: null },
    { id: 'paid', label: 'Paid on Solana', state: paid ? 'done' : 'pending', detail: order.txSignature, link: order.txSignature ? `https://solscan.io/tx/${order.txSignature}` : null },
    { id: 'confirmed', label: 'SP3ND confirmed', state: paid ? 'done' : 'pending', detail: order.paidAt ? when(order.paidAt) : null, link: null },
  ];
  const short6 = wallet && Number(wallet.usdc) < order.total;

  return (
    <div className="pb-24 pt-8 sm:pt-12">
      <a href="#/orders" className="text-[13px] font-semibold underline underline-offset-4">All orders</a>
      <div className="mt-3 flex flex-wrap items-end gap-x-5 gap-y-2">
        <h1 className="display text-[clamp(1.9rem,4.4vw,3.4rem)]">{order.orderNumber}</h1>
        <Chip tone={paid ? 'good' : job?.status === 'failed' ? 'bad' : 'warn'} className="mb-2"><Dot tone={paid ? 'good' : job?.status === 'failed' ? 'bad' : 'warn'} />{paid ? order.status : job?.status === 'running' ? 'Settling' : job?.status === 'failed' ? 'Needs attention' : 'Awaiting payment'}</Chip>
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-14">
        <div className="order-2 space-y-14 lg:order-1">
          <section aria-labelledby="status">
            <SectionHead n="04" title="Order status"><span id="status" className="sr-only">Order status</span></SectionHead>
            <Timeline steps={steps} />
            {job?.error && <ErrorNote>{job.error}</ErrorNote>}
            {job?.funding.map((f) => (
              <div key={f.asset} className="mt-4 rounded-2xl bg-ink p-4 text-lime">
                <p className="text-[13px] font-semibold text-lime/70">{f.direct ? `Send ${f.asset === 'usdc' ? 'USDC' : 'SOL'} on Solana` : `Deposit ${f.symbol} on ${chainName(f.chain)}`} · {f.state.replace('_', ' ')}</p>
                <p className="num mt-1 break-all text-[14px]">{f.amountIn ? `${f.amountIn} ${f.symbol} → ` : ''}{f.depositAddress}{f.depositMemo ? ` memo ${f.depositMemo}` : ''}</p>
              </div>
            ))}
          </section>

          {!paid && (
            <>
              <section aria-labelledby="wallet">
                <SectionHead n="05" title="Cart wallet"><span id="wallet" className="sr-only">Cart wallet</span></SectionHead>
                <div className="mt-4 rounded-[var(--radius-card)] bg-paper p-5">
                  <dl className="grid gap-4 sm:grid-cols-3">
                    <div><dt className="label">Solana address</dt><dd className="num mt-1 break-all text-[13px]">{wallet ? <a className="underline underline-offset-4" href={`https://solscan.io/account/${wallet.address}`} target="_blank" rel="noreferrer">{short(wallet.address, 6, 6)}</a> : '…'}</dd></div>
                    <div><dt className="label">USDC held</dt><dd className="num mt-1 text-[22px]">{wallet?.usdc ?? '…'}</dd></div>
                    <div><dt className="label">Order needs</dt><dd className="num mt-1 text-[22px]">{order.total.toFixed(2)}</dd></div>
                  </dl>
                  {wallet && <p className="mt-4 text-[13px] text-ink-2">Derived from <span className="num">{wallet.account}</span> by NEAR Chain Signatures. {short6 ? 'Fund it from the route below and Cart pays when the deposit lands.' : 'It holds enough USDC to pay now.'}</p>}
                  {prep && <p className="num mt-3  pt-3 text-[12px] text-ink-2">SP3ND receives {prep.amount} {prep.currency} at {short(prep.recipient, 5, 5)} · memo {prep.memo}<br />Checked: {prep.checks}.</p>}
                  {prepError && <ErrorNote>{prepError}</ErrorNote>}
                </div>
              </section>

              <PayWith n="06" total={order.total} value={asset} onChange={(v) => { setAsset(v); if (v) sessionStorage.setItem(`cart.src.${orderId}`, v); else sessionStorage.removeItem(`cart.src.${orderId}`); }} />

              <section aria-labelledby="confirm">
                <SectionHead n="07" title="Confirm"><span id="confirm" className="sr-only">Confirm</span></SectionHead>
                <label className="mt-4 flex cursor-pointer items-start gap-3 text-[15px]">
                  <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1 size-5 accent-[#163300]" />
                  <span>Spend {order.total.toFixed(2)} USDC from the Cart wallet on this order.</span>
                </label>
                <div className="mt-5 flex flex-wrap items-center gap-4">
                  <Btn onClick={pay} disabled={!confirmed || !d.payEnabled || job?.status === 'running'}>{job?.status === 'running' ? 'Settling…' : `Pay ${order.total.toFixed(2)} USDC`}</Btn>
                  {!d.payEnabled && <span className="text-[13px] text-mute">Spending is armed by the wallet owner.</span>}
                </div>
                {payError && <ErrorNote>{payError}</ErrorNote>}
              </section>
            </>
          )}
        </div>

        <aside className="order-1 lg:order-2">
          <div className="lg:sticky lg:top-6">
            {item && <Receipt kind="order" item={item} money={order} orderNumber={order.orderNumber} status={order.status} createdAt={order.createdAt} />}
            <button onClick={() => void load()} className="mt-5 text-[13px] font-semibold underline underline-offset-4">Refresh from SP3ND</button>
          </div>
        </aside>
      </div>
    </div>
  );
}

