import { useEffect, useState } from 'react';
import { Chip } from '@/components/ui';
import { isPaid, when, type Item, type Money } from '@/lib/api';
import { cn } from '@/lib/utils';

export const useNow = (ms = 1000): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(id); }, [ms]);
  return now;
};

const clock = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

function Line({ k, v, dim }: { k: string; v: string; dim?: boolean }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4 py-1.5 text-[14px]', dim && 'text-mute')}>
      <span>{k}</span>
      <span className="num">{v}</span>
    </div>
  );
}

type Props = {
  item: Item; money: Money; kind: 'quote' | 'order';
  expiresAt?: string; orderNumber?: string; status?: string; watch?: string | null; createdAt?: string;
};

export function Receipt({ item, money, kind, expiresAt, orderNumber, status, watch, createdAt }: Props) {
  const now = useNow();
  const left = expiresAt ? Date.parse(expiresAt) - now : null;
  const expired = left !== null && left <= 0;
  const paid = status ? isPaid(status) : false;
  return (
    <div className="paper-wrap">
      <article className="paper print px-6 pt-6" aria-label={kind === 'quote' ? 'Live quote receipt' : 'Order receipt'}>
        <header className="flex items-center justify-between">
          <span className="label">{kind === 'quote' ? 'Quote' : 'Order'}{orderNumber ? ` · ${orderNumber}` : ''}</span>
          <span className="num text-[12px] text-mute">{when(createdAt ?? new Date().toISOString())}</span>
        </header>

        <div className="mt-4 flex gap-4">
          <div className="grid size-24 shrink-0 place-items-center rounded-lg border border-line bg-white p-1.5">
            {item.image ? <img src={item.image} alt="" className="max-h-full max-w-full object-contain mix-blend-multiply" /> : <span className="label">No image</span>}
          </div>
          <div className="min-w-0">
            <h3 className="line-clamp-3 text-[17px] font-bold leading-snug tracking-tight">{item.title}</h3>
            <p className="mt-1 text-[13px] text-mute">{item.brand ?? item.store} <span className="num">· {item.asin}</span></p>
            {item.verified && <Chip tone="good" className="mt-2"><svg aria-hidden width="12" height="12" viewBox="0 0 12 12"><path d="M2 6.5 4.8 9 10 3.2" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>Verified by the store</Chip>}
          </div>
        </div>

        <div className="mt-5">
          <Line k={`Item${item.quantity > 1 ? ` × ${item.quantity}` : ''}`} v={money.subtotal.toFixed(2)} />
          <Line k="Shipping" v={money.shipping ? money.shipping.toFixed(2) : 'Free'} />
          <Line k="Tax" v={kind === 'quote' && !money.tax ? 'set with address' : money.tax.toFixed(2)} dim={kind === 'quote' && !money.tax} />
          {money.fee > 0 && <Line k="Fees" v={money.fee.toFixed(2)} />}
        </div>

        <div className="perf mt-3 pt-3">
          <div className="flex items-end justify-between">
            <span className="label pb-1.5">Total</span>
            <p className="num text-[40px] font-medium leading-none tracking-tight">{money.total.toFixed(2)}<span className="ml-1.5 text-[15px] text-mute">USDC</span></p>
          </div>
        </div>

        {kind === 'quote' && expiresAt && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-[13px]">
              <span className={cn('font-semibold', expired && 'text-bad')}>{expired ? 'Quote expired' : 'Price holds for'}</span>
              <span className={cn('num', expired && 'text-bad')}>{expired ? '00:00' : clock(left ?? 0)}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sage">
              <div className={cn('h-full rounded-full', expired ? 'bg-bad' : 'bg-ink')} style={{ width: `${Math.min(100, Math.max(0, ((left ?? 0) / (30 * 60_000)) * 100))}%`, transition: 'width 1s linear' }} />
            </div>
          </div>
        )}

        {kind === 'order' && status && (
          <div className="mt-4 flex items-center justify-between">
            <span className="label">Status</span>
            <Chip tone={paid ? 'good' : 'warn'}>{paid ? status : 'Awaiting payment'}</Chip>
          </div>
        )}

        {watch && <p className="mt-4 border-t border-dashed border-line pt-3 text-[12px] text-mute">{watch}</p>}

        <p className="num mt-4 text-[11px] leading-relaxed text-mute">
          NEAR Intents → Solana USDC → SP3ND → Amazon<br />
          Settled by NEAR Chain Signatures
        </p>
      </article>
    </div>
  );
}

export function EmptyReceipt({ busy, seconds }: { busy: boolean; seconds: number }) {
  return (
    <div className="paper-wrap">
      <article className="paper px-6 pt-6" aria-live="polite">
        <span className="label">{busy ? 'Asking the store' : 'Receipt'}</span>
        <div className="mt-5 space-y-3" aria-hidden>
          {[78, 52, 90, 40].map((w, i) => <div key={i} className={cn('h-3 rounded-full bg-sage', busy && 'pulse')} style={{ width: `${w}%`, animationDelay: `${i * 120}ms` }} />)}
        </div>
        <div className="perf mt-6 pt-4">
          <p className="num text-[40px] leading-none text-line">0.00<span className="ml-1.5 text-[15px]">USDC</span></p>
        </div>
        <p className="mt-4 text-[14px] text-ink-2">
          {busy ? `SP3ND is checking the live Amazon price. ${seconds}s` : 'Paste a link and the price, tax and total print here, checked by the store.'}
        </p>
      </article>
    </div>
  );
}
