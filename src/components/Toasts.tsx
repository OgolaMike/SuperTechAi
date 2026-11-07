import { useEffect, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, ShieldAlert, Target, X } from 'lucide-react';
import type { Toast } from '@/hooks/useSignalAlerts';
import { formatPrice, formatDateTime } from '@/lib/sma';

export const TOAST_DURATION_MS = 15000;
type Props = { toasts: Toast[]; onDismiss: (id: string) => void };

export function Toasts({ toasts, onDismiss }: Props) {
  const signals = toasts.filter((toast) => toast.kind === 'signal' || toast.kind === 'reversal');
  const hits = toasts.filter((toast) => toast.kind === 'hit');
  return <>
    <div aria-live="polite" className="pointer-events-none fixed inset-0 z-[70] overflow-hidden">
      {signals.map((toast, index) => <SignalBubble key={toast.id} toast={toast} index={index} onDismiss={onDismiss} />)}
    </div>
    <div aria-live="polite" className="pointer-events-none fixed inset-x-3 bottom-3 z-[71] flex flex-col gap-3 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[24rem]">
      {hits.map((toast) => <HitToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />)}
    </div>
  </>;
}

function SignalBubble({ toast, index, onDismiss }: { toast: Toast; index: number; onDismiss: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(toast.id), TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [toast.id, onDismiss]);
  const buy = toast.direction === 'BUY';
  return <>
    <button type="button" aria-label={`Open ${toast.direction} ${toast.timeframe} signal details`} onClick={() => setOpen(true)}
      className={`signal-bubble pointer-events-auto absolute bottom-[-110px] flex h-[88px] w-[88px] flex-col items-center justify-center rounded-full border-2 shadow-[0_0_30px_-8px] backdrop-blur-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${buy ? 'border-up/80 bg-up/15 text-up shadow-up/40' : 'border-down/80 bg-down/15 text-down shadow-down/40'}`}
      style={{ left: `calc(8% + ${(index % 5) * 19}%)` }}>
      {buy ? <ArrowUpRight className="h-7 w-7" strokeWidth={2.6} /> : <ArrowDownRight className="h-7 w-7" strokeWidth={2.6} />}
      <span className="text-sm font-black tracking-wider">{toast.direction}</span>
      <span className="text-[10px] font-bold tracking-[0.16em] opacity-85">{toast.timeframe}</span>
    </button>
    {open && <SignalDetails toast={toast} onClose={() => setOpen(false)} />}
  </>;
}

function SignalDetails({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const buy = toast.direction === 'BUY';
  return <div className="pointer-events-auto fixed inset-0 z-[90] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm" onClick={onClose}>
    <section role="dialog" aria-modal="true" aria-label="Signal details" onClick={(event) => event.stopPropagation()} className="w-full max-w-sm rounded-3xl border border-line/30 bg-canvas p-5 shadow-2xl">
      <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink-3">Signal details</p><h2 className={`mt-1 text-2xl font-black ${buy ? 'text-up' : 'text-down'}`}>{toast.direction} · {toast.timeframe}</h2><p className="text-sm text-ink-2">{toast.assetName} ({toast.symbol})</p></div><button type="button" onClick={onClose} aria-label="Close details" className="rounded-full p-2 text-ink-2 hover:bg-surface/10"><X className="h-5 w-5" /></button></div>
      <p className="mt-3 text-xs text-ink-3">{toast.message}</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Detail label="Entry" value={formatPrice(toast.levels.entry, toast.digits)} />
        <Detail label="Stop-loss" value={formatPrice(toast.levels.stopLoss, toast.digits)} tone="text-down" />
        <Detail label="Take-profit 1" value={formatPrice(toast.levels.tp1, toast.digits)} tone="text-up" />
        <Detail label="Take-profit 2" value={formatPrice(toast.levels.tp2, toast.digits)} tone="text-up" />
        <Detail label="Take-profit 3" value={formatPrice(toast.levels.tp3, toast.digits)} tone="text-up" />
        <Detail label="Signal time" value={formatDateTime(toast.at)} />
      </div>
      <button type="button" onClick={onClose} className="mt-5 w-full rounded-xl bg-accent px-4 py-3 text-sm font-bold text-canvas">Close</button>
    </section>
  </div>;
}

function Detail({ label, value, tone = 'text-ink' }: { label: string; value: string; tone?: string }) {
  return <div className="rounded-xl border border-line/15 bg-surface/[0.04] p-3"><div className="text-[10px] uppercase tracking-wider text-ink-3">{label}</div><div className={`mt-1 break-all font-mono text-sm font-bold tabular-nums ${tone}`}>{value}</div></div>;
}

const TONE_STYLE: Record<Toast['tone'], { accent: string; bar: string; icon: string }> = {
  BUY: { accent: 'border-up/40', bar: 'bg-up', icon: 'bg-up/15 text-up' },
  SELL: { accent: 'border-down/40', bar: 'bg-down', icon: 'bg-down/15 text-down' },
  TARGET: { accent: 'border-warn/40', bar: 'bg-warn', icon: 'bg-warn/15 text-warn' },
  STOP: { accent: 'border-down/40', bar: 'bg-down', icon: 'bg-down/15 text-down' },
};
function HitToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(toast.id), TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [toast.id, onDismiss]);
  const style = TONE_STYLE[toast.tone];
  const Icon = toast.tone === 'TARGET' ? Target : ShieldAlert;
  return <div role="status" className={`pointer-events-auto relative overflow-hidden rounded-2xl border bg-canvas/95 p-4 shadow-2xl backdrop-blur-xl ${style.accent}`}>
    <div className="flex items-center gap-3"><div className={`flex h-10 w-10 items-center justify-center rounded-xl ${style.icon}`}><Icon className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="text-sm font-bold text-ink">{toast.tone === 'STOP' ? 'Stop-loss hit' : toast.message}</div><div className="text-xs text-ink-2">{toast.assetName} · {toast.timeframe}</div><div className="font-mono text-sm tabular-nums text-ink">{formatPrice(toast.price, toast.digits)}</div></div><button type="button" onClick={() => onDismiss(toast.id)} aria-label="Dismiss alert" className="rounded-lg p-2 text-ink-3 hover:bg-surface/[0.06]"><X className="h-4 w-4" /></button></div>
    <div className="absolute inset-x-0 bottom-0 h-1 bg-surface/[0.06]"><div className={`h-full origin-left animate-toast-drain ${style.bar}`} /></div>
  </div>;
}
