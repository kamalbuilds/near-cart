import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

const BTN = {
  primary: 'bg-lime text-ink hover:bg-lime-hi shadow-[0_1px_0_rgba(14,15,12,.9)_inset,0_0_0_1.5px_var(--color-ink)]',
  dark: 'bg-ink text-lime hover:bg-lime-deep',
  soft: 'bg-sage text-ink hover:bg-line',
  ghost: 'bg-transparent text-ink underline decoration-1 underline-offset-4 hover:decoration-2',
};

export function Btn({ tone = 'primary', className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: keyof typeof BTN }) {
  return (
    <button
      {...rest}
      className={cn(
        'inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold transition-[transform,background-color] duration-150 active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100',
        BTN[tone], className,
      )}
    />
  );
}

export function Field({ label, hint, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="label">{label}</span>
      <input
        aria-label={label}
        {...rest}
        className="mt-1.5 h-12 w-full rounded-xl border border-ink/70 bg-paper px-4 text-[15px] text-ink placeholder:text-mute/70 focus:border-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink"
      />
      {hint && <span className="mt-1 block text-[12px] text-mute">{hint}</span>}
    </label>
  );
}

const CHIP = {
  good: 'bg-lime-pale text-good-deep',
  warn: 'bg-warn/30 text-[#4a3b1c]',
  bad: 'bg-bad/12 text-bad',
  neutral: 'bg-sage text-ink-2',
  ink: 'bg-ink text-lime',
};

export function Chip({ tone = 'neutral', children, className }: { tone?: keyof typeof CHIP; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold leading-none', CHIP[tone], className)}>{children}</span>;
}

export function Dot({ tone }: { tone: 'good' | 'warn' | 'bad' | 'mute' }) {
  const color = { good: 'bg-good', warn: 'bg-warn', bad: 'bg-bad', mute: 'bg-mute' }[tone];
  return <span aria-hidden className={cn('inline-block size-2 rounded-full', color)} />;
}

export function SectionHead({ n, title, children }: { n: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="num text-[13px] text-mute">{n}</span>
      <h2 className="text-[26px] font-bold tracking-tight">{title}</h2>
      {children && <div className="ml-auto">{children}</div>}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <p role="alert" className="mt-3 rounded-xl border border-bad/40 bg-bad/8 px-4 py-3 text-[14px] font-medium text-[#8a1c21]">{children}</p>;
}
