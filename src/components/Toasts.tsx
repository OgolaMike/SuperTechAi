import { useEffect } from 'react';
import { ArrowDownRight, ArrowUpRight, ShieldAlert, Target, X } from 'lucide-react';
import type { Toast } from '@/hooks/useSignalAlerts';
import { formatPrice } from '@/lib/sma';

export const TOAST_DURATION_MS = 15000;

type Props = {
  toasts: Toast[];
  onDismiss: (id: string) => void;
};

export function Toasts({ toasts, onDismiss }: Props) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-3 bottom-3 z-50 flex flex-col gap-3 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[24rem]"
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

const TONE_STYLE: Record<Toast['tone'], { accent: string; bar: string; icon: string }> = {
  BUY: { accent: 'border-up/40', bar: 'bg-up', icon: 'bg-up/15 text-up' },
  SELL: { accent: 'border-down/40', bar: 'bg-down', icon: 'bg-down/15 text-down' },
  TARGET: { accent: 'border-warn/40', bar: 'bg-warn', icon: 'bg-warn/15 text-warn' },
  STOP: { accent: 'border-down/40', bar: 'bg-down', icon: 'bg-down/15 text-down' },
};

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(toast.id), TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const style = TONE_STYLE[toast.tone];
  const Icon = toast.tone === 'BUY' ? ArrowUpRight : toast.tone === 'SELL' ? ArrowDownRight : toast.tone === 'TARGET' ? Target : ShieldAlert;
  const { levels, digits } = toast;
  const isSignal = toast.kind === 'signal' || toast.kind === 'reversal';
  const title = isSignal
    ? toast.timeframe === 'SUPER SIGNAL' ? 'SUPER SIGNAL CONFIRMED' : `${toast.direction} SIGNAL`
    : toast.tone === 'STOP' ? 'Stop-loss hit' : 'Target reached';

  return (
    <div
      role="status"
      className={`pointer-events-auto relative animate-toast-in overflow-hidden rounded-2xl border bg-canvas/95 p-4 shadow-2xl backdrop-blur-xl ${style.accent}`}
    >
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${style.icon}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold tracking-wide text-ink">
              {title}
            </span>
            <span className="rounded-md bg-surface/[0.06] px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-ink-2">
              {toast.timeframe}
            </span>
          </div>
          <p className="break-words text-xs text-ink-2">{toast.assetName}</p>
          <p className="mt-1.5 text-xs font-medium text-ink">{toast.message}</p>
          {toast.kind === 'reversal' && toast.previousSignalEpoch ? (
            <p className="mt-1 text-[10px] text-ink-3">
              Previous signal: {toast.previousDirection} at {new Date(toast.previousSignalEpoch * 1000).toLocaleString()}
            </p>
          ) : null}
          {isSignal ? (
            <dl className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1 font-mono text-xs tabular-nums">
              <Cell label="New entry" value={formatPrice(levels.entry, digits)} />
              <Cell label="SL" value={formatPrice(levels.stopLoss, digits)} tone="text-down" />
              <Cell label="TP1" value={formatPrice(levels.tp1, digits)} tone="text-up" />
              <Cell label="TP2" value={formatPrice(levels.tp2, digits)} tone="text-up" />
              <Cell label="TP3" value={formatPrice(levels.tp3, digits)} tone="text-up" />
            </dl>
          ) : (
            <p className="mt-2 font-mono text-sm tabular-nums text-ink">{formatPrice(toast.price, digits)}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          aria-label="Dismiss alert"
          className="-mr-1 -mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-surface/[0.06] hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-1 bg-surface/[0.06]">
        <div className={`h-full origin-left animate-toast-drain ${style.bar}`} />
      </div>
    </div>
  );
}

function Cell({ label, value, tone = 'text-ink' }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <dt className="text-[9px] uppercase tracking-wider text-ink-3">{label}</dt>
      <dd className={tone}>{value}</dd>
    </div>
  );
}
