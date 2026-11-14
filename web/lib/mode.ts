import { useSyncExternalStore } from 'react';

export type Mode = 'testnet' | 'mainnet';
const KEY = 'cart.mode';
const listeners = new Set<() => void>();

const read = (): Mode => {
  try { return localStorage.getItem(KEY) === 'mainnet' ? 'mainnet' : 'testnet'; } catch { return 'testnet'; }
};

export function setMode(mode: Mode): void {
  try { localStorage.setItem(KEY, mode); } catch { /* storage blocked: the choice lasts until reload */ }
  memo = mode;
  listeners.forEach((fn) => fn());
}

let memo: Mode = read();
export const useMode = (): Mode => useSyncExternalStore(
  (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  () => memo,
);
