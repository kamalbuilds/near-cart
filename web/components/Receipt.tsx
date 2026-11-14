import { useEffect, useState, type ReactNode } from 'react';
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
    <div className={cn('flex items-baseline justify-between gap-4 py-1.5 text-[15px]', dim && 'text-mute')}>
      <span>{k}</span>
      <span className="num">{v}</span>
    </div>
  );
}

type Props = {
  item: Item; money: Money; kind: 'quote' | 'order';
  expiresAt?: string; orderNumber?: string; status?: string; watch?: string | null; createdAt?: string;
  paid?: boolean; children?: ReactNode;
};

export function Receipt({ item, money, kind, expiresAt, orderNumber, status, watch, createdAt, paid: stamped, children }: Props) {
  const now = useNow();
  const left = expiresAt ? Date.parse(expiresAt) - now : null;
  const expired = left !== null && left <= 0;
  const paid = stamped ?? (status ? isPaid(status) : false);
  return (
    <article className="paper print px-6 pt-6 sm:px-8" aria-label={kind === 'quote' ? 'Live quote receipt' : 'Order receipt'}>
      <header className="flex items-center justify-between gap-3">
        <span className="label">{kind === 'quote' ? 'Live quote from SP3ND' : `Order${orderNumber ? ` ${orderNumber}` : ''}`}</span>
        <span className="num text-[14px] text-mute">{when(createdAt ?? new Date().toISOString())}</span>
      </header>

      <div className="mt-4 flex gap-4">
        <div className="grid size-24 shrink-0 place-items-center rounded-xl bg-white p-2">
          {item.image ? <img src={item.image} alt="" className="max-h-full max-w-full object-contain mix-blend-multiply" /> : <span className="text-[13px] text-mute">No image</span>}
        </div>
        <div className="min-w-0">
          <h3 className="line-clamp-3 text-[18px] font-bold leading-snug tracking-tight">{item.title}</h3>
          <p className="mt-1 text-[14px] text-mute">{item.brand ?? item.store} <span className="num">{item.asin}</span></p>
          {item.verified && (
            <Chip tone="good" className="mt-2">
              <svg aria-hidden width="12" height="12" viewBox="0 0 12 12"><path d="M2 6.5 4.8 9 10 3.2" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Price verified on Amazon
            </Chip>
          )}
        </div>
      </div>

      <div className="mt-3">
        <Line k={`Item${item.quantity > 1 ? ` × ${item.quantity}` : ''}`} v={money.subtotal.toFixed(2)} />
        <Line k="Shipping" v={money.shipping ? money.shipping.toFixed(2) : 'Free'} />
        <Line k="Tax" v={kind === 'quote' && !money.tax ? 'set with address' : money.tax.toFixed(2)} dim={kind === 'quote' && !money.tax} />
        {money.fee > 0 && <Line k="Fees" v={money.fee.toFixed(2)} />}
      </div>

      <div className="relative mt-3 flex items-end justify-between rounded-2xl bg-sage px-5 py-4">
        <span className="pb-1.5 text-[16px] font-bold">Total</span>
        <p className="num text-[44px] font-bold leading-none tracking-tight">{money.total.toFixed(2)}<span className="ml-2 text-[16px] font-semibold text-mute">USDC</span></p>
        {paid && (
          <span className="stamp absolute -top-6 left-4 rounded-lg bg-lime px-3.5 py-1.5 text-[22px] font-extrabold tracking-tight text-lime-deep" aria-label="Paid">Paid</span>
        )}
      </div>

      {kind === 'quote' && expiresAt && !paid && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[14px]">
            <span className={cn('font-semibold', expired && 'text-bad')}>{expired ? 'Quote expired' : 'Price holds for'}</span>
            <span className={cn('num', expired && 'text-bad')}>{expired ? '00:00' : clock(left ?? 0)}</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-sage">
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

      {children}

      {watch && <p className="mt-4 text-[14px] text-mute">{watch}</p>}
    </article>
  );
}

export function EmptyReceipt({ busy, seconds, failed, onRetry }: { busy: boolean; seconds: number; failed?: string | null; onRetry?: () => void }) {
  return (
    <article className="paper px-6 pt-6 sm:px-8" aria-live="polite">
      <span className="label">{busy ? 'Asking SP3ND about the live Amazon price' : failed ? 'The store did not answer' : 'Your receipt'}</span>
      <div className="mt-5 flex gap-4" aria-hidden>
        <div className={cn('size-24 shrink-0 rounded-xl bg-sage', busy && 'pulse')} />
        <div className="flex-1 space-y-3 pt-1">
          {[88, 62, 40].map((w, i) => <div key={i} className={cn('h-3.5 rounded-full bg-sage', busy && 'pulse')} style={{ width: `${w}%`, animationDelay: `${i * 120}ms` }} />)}
        </div>
      </div>
      <div className="mt-6 flex items-end justify-between rounded-2xl bg-sage px-5 py-4">
        <span className="pb-1.5 text-[16px] font-bold text-mute">Total</span>
        <p className={cn('num text-[44px] font-bold leading-none tracking-tight text-sage-2', busy && 'pulse')}>0.00<span className="ml-2 text-[16px] font-semibold">USDC</span></p>
      </div>
      <p className="mt-4 text-[15px] text-ink-2">
        {busy ? `Checking the price, shipping and tax. ${seconds} s` : failed ? failed : 'Paste a link and the price, shipping and tax print here, checked by the store.'}
      </p>
      {failed && onRetry && <button type="button" onClick={onRetry} className="mt-3 h-11 rounded-full bg-ink px-5 text-[15px] font-semibold text-lime hover:bg-lime-deep">Try again</button>}
    </article>
  );
}
