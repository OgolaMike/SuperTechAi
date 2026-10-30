import { Activity, Radio, TrendingDown, TrendingUp } from 'lucide-react';
import type { ConnectionStatus } from '@/lib/deriv';
import { formatDateTime } from '@/lib/sma';

const STATUS_META: Record<ConnectionStatus, { label: string; dot: string; text: string }> = {
  connecting: { label: 'Connecting', dot: 'bg-warn', text: 'text-warn' },
  open: { label: 'Live', dot: 'bg-up', text: 'text-up' },
  closed: { label: 'Disconnected', dot: 'bg-ink-3', text: 'text-ink-2' },
  reconnecting: { label: 'Reconnecting', dot: 'bg-warn', text: 'text-warn' },
  error: { label: 'Error', dot: 'bg-down', text: 'text-down' },
};

type Props = {
  status: ConnectionStatus;
  detail?: string;
  lastTick: number | null;
  monitoredCount: number;
  saveError: string | null;
};

export function StatusBar({ status, detail, lastTick, monitoredCount, saveError }: Props) {
  const meta = STATUS_META[status];
  const pulsing = status === 'connecting' || status === 'reconnecting';
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line/10 bg-surface/[0.03] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span className={`inline-flex h-2.5 w-2.5 flex-shrink-0 rounded-full ${meta.dot} ${pulsing ? 'animate-pulse' : ''}`} />
        <span className={`text-sm font-medium tracking-wide ${meta.text}`}>{meta.label}</span>
        {detail && status !== 'open' && <span className="max-w-[260px] break-words text-xs text-ink-3">{detail}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-4 text-xs text-ink-2">
        {saveError && <span className="max-w-[320px] break-words text-down">Signals not saved: {saveError}</span>}
        <div className="flex items-center gap-1.5"><Radio className="h-3.5 w-3.5 text-accent" /><span>{monitoredCount} monitored</span></div>
        <div className="flex items-center gap-1.5"><Activity className="h-3.5 w-3.5 text-ink-3" /><span className="tabular-nums">{lastTick ? formatDateTime(lastTick) : '—'}</span></div>
      </div>
    </div>
  );
}

export function HeaderBrand() {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="relative flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border border-warn/30 bg-black">
        <img src="/IMG-20261018-WA0005(1).jpg" alt="SuperTech Ai" className="h-full w-full object-cover" />
        <span className="absolute -inset-px rounded-xl ring-1 ring-inset ring-white/10" />
      </div>
      <div className="min-w-0">
        <h1 className="break-words font-display text-lg font-semibold tracking-tight text-ink">SuperTech Ai</h1>
        <p className="break-words text-xs text-ink-2">Live market intelligence</p>
      </div>
    </div>
  );
}

export function TrendIcons() {
  return (
    <div className="hidden items-center gap-2 sm:flex">
      <TrendingUp className="h-4 w-4 text-up" />
      <TrendingDown className="h-4 w-4 text-down" />
    </div>
  );
}
