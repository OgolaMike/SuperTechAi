import { useMemo, useState } from 'react';
import { Archive, ArrowDownRight, ArrowUpRight, Clock3, ExternalLink, Search } from 'lucide-react';
import { formatDateTime, formatPrice } from '@/lib/sma';
import { loadBubbleHistory, type ArchivedBubble, type BubbleStatus } from '@/lib/bubbleHistory';

type Props = { onOpenDashboard: (symbol: string, granularity: number) => void };
const STATUS_LABEL: Record<BubbleStatus, string> = {
  unopened: 'Not opened', opened: 'Opened', expired: 'Expired', dismissed: 'Dismissed',
};

export function BubbleHistory({ onOpenDashboard }: Props) {
  const [rows] = useState<ArchivedBubble[]>(loadBubbleHistory);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | BubbleStatus>('all');
  const filtered = useMemo(() => rows.filter(({ toast, status }) => {
    const matchesText = `${toast.assetName} ${toast.symbol} ${toast.direction} ${toast.timeframe}`.toLowerCase().includes(query.toLowerCase());
    return matchesText && (filter === 'all' || status === filter);
  }), [rows, query, filter]);

  return <section className="mt-8 space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Signal archive</p><h2 className="mt-1 text-2xl font-bold text-ink">Bubble History</h2><p className="mt-1 text-sm text-ink-2">Every signal bubble is saved here before it leaves the screen, including bubbles you never open.</p></div>
      <span className="rounded-xl border border-line/15 bg-surface/[0.04] px-3 py-2 text-sm font-bold text-ink">{rows.length} recorded</span>
    </header>
    <div className="flex flex-col gap-2 sm:flex-row">
      <label className="flex flex-1 items-center gap-2 rounded-xl border border-line/15 bg-surface/[0.035] px-3 py-2"><Search className="h-4 w-4 text-ink-3"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search asset or signal" className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none"/></label>
      <select value={filter} onChange={(event) => setFilter(event.target.value as 'all' | BubbleStatus)} className="rounded-xl border border-line/15 bg-canvas px-3 py-2 text-sm text-ink"><option value="all">All bubbles</option><option value="unopened">Not opened</option><option value="opened">Opened</option><option value="expired">Expired</option><option value="dismissed">Dismissed</option></select>
    </div>
    {filtered.length === 0 ? <div className="rounded-2xl border border-dashed border-line/20 p-10 text-center"><Archive className="mx-auto h-7 w-7 text-ink-3"/><p className="mt-3 font-semibold text-ink">No bubbles in this view</p><p className="mt-1 text-sm text-ink-3">New signal and trade-update bubbles will be saved automatically.</p></div> : <div className="grid gap-3 md:grid-cols-2">
      {filtered.map(({ toast, status }) => <article key={toast.id} className="rounded-2xl border border-line/15 bg-surface/[0.035] p-4">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-bold text-ink">{toast.assetName} · {toast.symbol}</p><p className="mt-1 text-xs text-ink-3">{toast.timeframe} · {formatDateTime(toast.at)}</p></div><span className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold ${toast.direction === 'BUY' ? 'bg-up/10 text-up' : 'bg-down/10 text-down'}`}>{toast.direction}</span></div>
        <p className="mt-3 text-sm font-semibold text-ink">{toast.message}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg border border-line/10 p-2"><span className="text-ink-3">Entry</span><p className="mt-1 font-mono font-bold text-ink">{formatPrice(toast.levels.entry, toast.digits)}</p></div><div className="rounded-lg border border-line/10 p-2"><span className="text-ink-3">Recorded state</span><p className="mt-1 font-semibold text-ink">{STATUS_LABEL[status]}</p></div></div>
        <button type="button" onClick={() => onOpenDashboard(toast.symbol, toast.granularity)} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-accent px-3 py-2 text-xs font-bold text-canvas"><ExternalLink className="h-3.5 w-3.5"/>VIEW ON DASHBOARD</button>
      </article>)}
    </div>}
    <p className="text-xs text-ink-3">This archive is stored on this device/browser. Clearing site data or switching devices will not carry this local archive across.</p>
  </section>;
}
