import { useEffect, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, ShieldAlert, Target, X } from 'lucide-react';
import type { Toast } from '@/hooks/useSignalAlerts';
import { formatPrice, formatDateTime } from '@/lib/sma';

export const TOAST_DURATION_MS = 15000;
type Props = { toasts: Toast[]; onDismiss: (id: string) => void; onOpenChart: (symbol: string, granularity: number, chartTargetId?: string) => void };

export function Toasts({ toasts, onDismiss, onOpenChart }: Props) {
  const signals = toasts.filter((toast) => toast.kind === 'signal' || toast.kind === 'reversal');
  const hits = toasts.filter((toast) => toast.kind === 'hit');
  return <>
    <div aria-live="polite" className="pointer-events-none fixed inset-0 z-[70] overflow-hidden">
      {signals.map((toast, index) => <SignalBubble key={toast.id} toast={toast} index={index} onDismiss={onDismiss} onOpenChart={onOpenChart} />)}
      {hits.map((toast, index) => <HitBubble key={toast.id} toast={toast} index={index + signals.length} onDismiss={onDismiss} onOpenChart={onOpenChart} />)}
    </div>
  </>;
}

function SignalBubble({ toast, index, onDismiss, onOpenChart }: { toast: Toast; index: number; onDismiss: (id: string) => void; onOpenChart: (symbol: string, granularity: number, chartTargetId?: string) => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(toast.id), TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [toast.id, onDismiss]);
  const buy = toast.direction === 'BUY';
  const displayName = toast.assetName || toast.symbol;
  const bubbleSize = Math.min(112, Math.max(88, 82 + displayName.length * 1.9));
  return <>
    <button type="button" aria-label={`Open ${toast.direction} ${toast.timeframe} signal details`} onClick={() => setOpen(true)}
      className={`signal-bubble pointer-events-auto absolute bottom-[-120px] flex -translate-x-1/2 flex-col items-center justify-center rounded-full border-2 shadow-[0_0_30px_-8px] backdrop-blur-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${buy ? 'border-up/80 bg-up/15 text-up shadow-up/40' : 'border-down/80 bg-down/15 text-down shadow-down/40'}`}
      style={{ width: bubbleSize, height: bubbleSize, left: `calc(16% + ${(index % 5) * 17}%)` }}>
      {buy ? <ArrowUpRight className="h-7 w-7" strokeWidth={2.6} /> : <ArrowDownRight className="h-7 w-7" strokeWidth={2.6} />}
      <span className="text-sm font-black tracking-wider">{toast.direction}</span>
      <span className="text-[10px] font-bold tracking-[0.16em] opacity-85">{toast.timeframe}</span>
      <BubbleAssetName name={displayName} size={bubbleSize} id={toast.id} />
    </button>
    {open && <SignalDetails toast={toast} onClose={() => setOpen(false)} onDismiss={() => onDismiss(toast.id)} onOpenChart={() => onOpenChart(toast.symbol, toast.granularity, toast.chartTargetId)} />}
  </>;
}


function HitBubble({ toast, index, onDismiss, onOpenChart }: { toast: Toast; index: number; onDismiss: (id: string) => void; onOpenChart: (symbol: string, granularity: number) => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(toast.id), TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [toast.id, onDismiss]);
  const isStop = toast.tone === 'STOP';
  const hitLabel = toast.tag.split('|').pop() ?? 'TARGET';
  const displayName = toast.assetName || toast.symbol;
  const bubbleSize = Math.min(132, Math.max(88, 82 + displayName.length * 2.6));
  return <>
    <button type="button" aria-label={`Open ${toast.message} details for ${toast.symbol}`} onClick={() => setOpen(true)}
      className={`signal-bubble pointer-events-auto absolute bottom-[-140px] flex flex-col items-center justify-center rounded-full border-2 shadow-[0_0_30px_-8px] backdrop-blur-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${isStop ? 'border-down/80 bg-down/15 text-down shadow-down/40' : 'border-warn/80 bg-warn/15 text-warn shadow-warn/40'}`}
      style={{ width: bubbleSize, height: bubbleSize, left: `calc(16% + ${(index % 5) * 17}%)` }}>
      {isStop ? <ShieldAlert className="h-6 w-6" /> : <Target className="h-6 w-6" />}
      <span className="text-xs font-black tracking-wider">{isStop ? 'STOP' : hitLabel}</span>
      <BubbleAssetName name={displayName} size={bubbleSize} id={toast.id} />
    </button>
    {open && <HitDetails toast={toast} onClose={() => setOpen(false)} onDismiss={() => onDismiss(toast.id)} onOpenChart={() => onOpenChart(toast.symbol, toast.granularity, toast.chartTargetId)} />}
  </>;
}

function BubbleAssetName({ name, size, id }: { name: string; size: number; id: string }) {
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '');
  const pathId = `asset-smile-${safeId}`;
  const label = name.toUpperCase();
  const fontSize = label.length > 15 ? 7 : label.length > 11 ? 8 : 9;
  const textWidth = Math.min(size - 20, Math.max(38, label.length * fontSize * 0.66));
  return <svg aria-label={name} role="img" viewBox="0 0 120 34" width={size - 12} height="30" className="pointer-events-none absolute bottom-[7px] overflow-visible">
    <defs><path id={pathId} d="M 8 8 Q 60 34 112 8" /></defs>
    <text fill="currentColor" fontSize={fontSize} fontWeight="900" letterSpacing=".7" textAnchor="middle" opacity=".96">
      <textPath href={`#${pathId}`} startOffset="50%" textLength={textWidth} lengthAdjust="spacingAndGlyphs">{label}</textPath>
    </text>
  </svg>;
}

function HitDetails({ toast, onClose, onDismiss, onOpenChart }: { toast: Toast; onClose: () => void; onDismiss: () => void; onOpenChart: () => void }) {
  return <div className="pointer-events-auto fixed inset-0 z-[90] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm" onClick={onClose}>
    <section role="dialog" aria-modal="true" aria-label="Target or stop details" onClick={(event) => event.stopPropagation()} className="w-full max-w-sm rounded-3xl border border-line/30 bg-canvas p-5 shadow-2xl">
      <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink-3">Trade update</p><h2 className={`mt-1 text-2xl font-black ${toast.tone === 'STOP' ? 'text-down' : 'text-up'}`}>{toast.message}</h2><p className="text-sm text-ink-2">{toast.assetName} ({toast.symbol}) · {toast.timeframe}</p></div><button type="button" onClick={onClose} aria-label="Close details" className="rounded-full p-2 text-ink-2 hover:bg-surface/10"><X className="h-5 w-5" /></button></div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Detail label="Hit price" value={formatPrice(toast.price, toast.digits)} tone={toast.tone === 'STOP' ? 'text-down' : 'text-up'} />
        <Detail label="Entry" value={formatPrice(toast.levels.entry, toast.digits)} />
        <Detail label="Stop-loss" value={formatPrice(toast.levels.stopLoss, toast.digits)} tone="text-down" />
        <Detail label="Take-profit 1" value={formatPrice(toast.levels.tp1, toast.digits)} tone="text-up" />
        <Detail label="Take-profit 2" value={formatPrice(toast.levels.tp2, toast.digits)} tone="text-up" />
        <Detail label="Take-profit 3" value={formatPrice(toast.levels.tp3, toast.digits)} tone="text-up" />
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => { onDismiss(); onClose(); }} className="min-w-0 rounded-xl border border-line/25 bg-surface/10 px-3 py-3 text-sm font-bold text-ink">Close</button>
        <button type="button" onClick={() => { onOpenChart(); onDismiss(); onClose(); }} className="min-w-0 rounded-xl bg-accent px-3 py-3 text-sm font-bold text-canvas">Open Chart</button>
      </div>
    </section>
  </div>;
}

function SignalDetails({ toast, onClose, onDismiss, onOpenChart }: { toast: Toast; onClose: () => void; onDismiss: () => void; onOpenChart: () => void }) {
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
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => { onDismiss(); onClose(); }} className="min-w-0 rounded-xl border border-line/25 bg-surface/10 px-3 py-3 text-sm font-bold text-ink">Close</button>
        <button type="button" onClick={() => { onOpenChart(); onDismiss(); onClose(); }} className="min-w-0 rounded-xl bg-accent px-3 py-3 text-sm font-bold text-canvas">Open Chart</button>
      </div>
    </section>
  </div>;
}

function Detail({ label, value, tone = 'text-ink' }: { label: string; value: string; tone?: string }) {
  return <div className="rounded-xl border border-line/15 bg-surface/[0.04] p-3"><div className="text-[10px] uppercase tracking-wider text-ink-3">{label}</div><div className={`mt-1 break-all font-mono text-sm font-bold tabular-nums ${tone}`}>{value}</div></div>;
}

