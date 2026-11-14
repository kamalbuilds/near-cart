import { useEffect, useState } from 'react';
import { api, isPaid, usd, when, type Order } from '@/lib/api';
import { Chip, Dot, ErrorNote } from '@/components/ui';

export function OrdersView({ active }: { active: boolean }) {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    api<Order[]>('/api/orders').then((o) => { setOrders(o); setError(null); }).catch((e: Error) => setError(e.message));
  }, [active]);

  const paidCount = orders?.filter((o) => isPaid(o.status)).length ?? 0;
  const open = orders ? orders.length - paidCount : 0;

  return (
    <div hidden={!active} className="pb-24 pt-8 sm:pt-12">
      <p className="label">Read back from SP3ND</p>
      <h1 className="display mt-3 text-[clamp(2.5rem,7vw,5.5rem)]">Orders</h1>
      {error && <ErrorNote>{error}</ErrorNote>}
      {!orders && !error && <p className="mt-10 text-[17px] font-medium pulse">Reading each order from SP3ND…</p>}
      {orders && (
        <>
          <dl className="mt-8 grid max-w-xl grid-cols-3 gap-px overflow-hidden rounded-2xl border border-ink/70 bg-ink/70">
            {[['Orders', String(orders.length)], ['Paid', String(paidCount)], ['Open', String(open)]].map(([k, v]) => (
              <div key={k} className="bg-paper px-5 py-4"><dt className="label">{k}</dt><dd className="num mt-1 text-[32px] leading-none">{v}</dd></div>
            ))}
          </dl>
          {orders.length === 0 ? (
            <div className="mt-8 max-w-xl rounded-[var(--radius-card)] border border-dashed border-ink/50 p-8">
              <p className="text-[20px] font-bold tracking-tight">No orders in this browser yet.</p>
              <p className="mt-1 text-[14px] text-ink-2">Orders you create here are read back from SP3ND on this page.</p>
              <a href="#/" className="mt-5 inline-flex h-12 items-center rounded-full bg-lime px-6 font-semibold ring-[1.5px] ring-ink hover:bg-lime-hi">Shop an item</a>
            </div>
          ) : (
            <ul className="mt-8 divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-ink/70 bg-paper">
              {orders.map((o) => {
                const paid = isPaid(o.status);
                const item = o.items[0];
                return (
                  <li key={o.orderId}>
                    <a href={`#/order/${encodeURIComponent(o.orderId)}`} className="flex items-center gap-4 px-4 py-4 transition-colors hover:bg-lime-pale sm:px-5">
                      <div className="grid size-16 shrink-0 place-items-center rounded-lg border border-line bg-white p-1">
                        {item?.image ? <img src={item.image} alt="" className="max-h-full max-w-full object-contain mix-blend-multiply" /> : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[16px] font-semibold">{item?.title ?? o.orderNumber}</p>
                        <p className="num mt-0.5 text-[12px] text-mute">{o.orderNumber} · {when(o.createdAt)}</p>
                        {o.error && <p className="mt-0.5 text-[12px] text-bad">{o.error}</p>}
                      </div>
                      <div className="text-right">
                        <p className="num text-[18px]">{usd(o.total).slice(1)}<span className="ml-1 text-[11px] text-mute">USDC</span></p>
                        <Chip tone={paid ? 'good' : o.status === 'Unreadable' ? 'bad' : 'warn'} className="mt-1"><Dot tone={paid ? 'good' : o.status === 'Unreadable' ? 'bad' : 'warn'} />{paid ? o.status : o.status === 'Unreadable' ? 'Unreadable' : 'Awaiting payment'}</Chip>
                      </div>
                      <span aria-hidden className="hidden text-[20px] sm:block">→</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
