import { useEffect, useState } from 'react';
import { api, short, type Wallet } from '@/lib/api';
import { Shop } from '@/views/Shop';
import { OrderView } from '@/views/Order';
import { OrdersView } from '@/views/Orders';
import { cn } from '@/lib/utils';

type Route = { name: 'shop' } | { name: 'orders' } | { name: 'order'; id: string };

const parse = (hash: string): Route => {
  const m = /^#\/order\/(.+)$/.exec(hash);
  if (m) return { name: 'order', id: decodeURIComponent(m[1]) };
  return hash === '#/orders' ? { name: 'orders' } : { name: 'shop' };
};

function Logo() {
  return (
    <a href="#/" className="flex items-center gap-2.5" aria-label="Cart home">
      <svg aria-hidden width="34" height="34" viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="#0e0f0c" /><path d="M7 9h3l2 11h10l2-8H11" stroke="#9fe870" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /><circle cx="13" cy="24" r="1.8" fill="#9fe870" /><circle cx="21" cy="24" r="1.8" fill="#9fe870" /></svg>
      <span className="display text-[26px]">Cart</span>
    </a>
  );
}

export function App() {
  const [route, setRoute] = useState<Route>(() => parse(location.hash));
  const [wallet, setWallet] = useState<Wallet | null>(null);

  useEffect(() => {
    const on = () => { setRoute(parse(location.hash)); window.scrollTo({ top: 0 }); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  useEffect(() => { api<Wallet>('/api/wallet').then(setWallet).catch(() => setWallet(null)); }, []);

  const nav = (name: Route['name'], label: string, href: string) => (
    <a href={href} aria-current={route.name === name ? 'page' : undefined}
      className={cn('flex h-10 items-center rounded-full px-4 text-[14px] font-semibold transition-colors', route.name === name ? 'bg-ink text-lime' : 'hover:bg-sage')}>{label}</a>
  );

  return (
    <div className="mx-auto max-w-[1240px] px-5 sm:px-10">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-ink/15 py-4">
        <Logo />
        <nav className="flex items-center gap-1" aria-label="Main">
          {nav('shop', 'Shop', '#/')}
          {nav('orders', 'Orders', '#/orders')}
        </nav>
        <div className="ml-auto flex items-center gap-2 text-[12px]">
          <span className="hidden h-8 items-center rounded-full bg-sage px-3 font-semibold sm:flex">Solana USDC</span>
          {wallet && (
            <a href={`https://solscan.io/account/${wallet.address}`} target="_blank" rel="noreferrer" title={`Chain Signatures wallet of ${wallet.account}`}
              className="num flex h-8 items-center gap-2 rounded-full border border-ink/60 bg-paper px-3 hover:bg-lime-pale">
              <span aria-hidden className="size-1.5 rounded-full bg-good" />{short(wallet.address, 4, 4)}<span className="text-mute">{wallet.usdc} USDC</span>
            </a>
          )}
        </div>
      </header>
      <main>
        <Shop active={route.name === 'shop'} />
        <OrdersView active={route.name === 'orders'} />
        {route.name === 'order' && <OrderView key={route.id} orderId={route.id} />}
      </main>
    </div>
  );
}
