import { useEffect, useState } from 'react';
import { api, short, type TestnetWallet, type Wallet } from '@/lib/api';
import { setMode, useMode, type Mode } from '@/lib/mode';
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
  const [wallet, setWallet] = useState<Wallet | TestnetWallet | null>(null);
  const mode = useMode();

  useEffect(() => {
    const on = () => { setRoute(parse(location.hash)); window.scrollTo({ top: 0 }); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  useEffect(() => {
    setWallet(null);
    api<Wallet | TestnetWallet>(mode === 'testnet' ? '/api/testnet/wallet' : '/api/wallet').then(setWallet).catch(() => setWallet(null));
  }, [mode]);

  const nav = (name: Route['name'], label: string, href: string) => (
    <a href={href} aria-current={route.name === name ? 'page' : undefined}
      className={cn('flex h-10 items-center rounded-full px-4 text-[15px] font-semibold transition-colors', route.name === name ? 'bg-sage-2' : 'hover:bg-sage')}>{label}</a>
  );

  return (
    <div className="mx-auto max-w-[1240px] px-5 sm:px-10">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-3 py-5">
        <Logo />
        <nav className="flex items-center gap-1" aria-label="Main">
          {nav('shop', 'Shop', '#/')}
          {nav('orders', 'Orders', '#/orders')}
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-3 text-[14px]">
          <div role="radiogroup" aria-label="Network" className="flex rounded-full bg-sage p-1">
            {(['testnet', 'mainnet'] as Mode[]).map((m) => (
              <button key={m} role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
                className={cn('h-9 rounded-full px-4 font-semibold capitalize transition-colors', mode === m ? 'bg-ink text-lime' : 'hover:bg-sage-2')}>{m}</button>
            ))}
          </div>
          {wallet && (
            <a href={mode === 'testnet' ? `https://explorer.solana.com/address/${wallet.address}?cluster=devnet` : `https://solscan.io/account/${wallet.address}`} target="_blank" rel="noreferrer" title={`Chain Signatures wallet of ${wallet.account}`}
              className="num hidden h-11 items-center gap-2 rounded-full bg-paper px-4 hover:bg-lime-pale sm:flex">
              <span aria-hidden className="size-2 rounded-full bg-good" />{short(wallet.address, 4, 4)}<span className="text-mute">{mode === 'testnet' ? 'testnet' : `${wallet.usdc} USDC`}</span>
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
