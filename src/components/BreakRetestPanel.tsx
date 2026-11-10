import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Crosshair, RefreshCw, Target, Waves } from 'lucide-react';
import type { Asset, TfState } from '@/lib/sma';
import { buildBreakRetestSetups } from '@/lib/breakRetest';
import { formatPrice } from '@/lib/sma';

type Props = {
  assets: Asset[];
  states: Record<string, Record<number, TfState>>;
  prices: Record<string, number>;
};

export function BreakRetestPanel({ assets, states, prices }: Props) {
  const [direction, setDirection] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const setups = useMemo(() => buildBreakRetestSetups(assets, states), [assets, states]);
  const visible = setups.filter(item => direction === 'ALL' || item.direction === direction);
  const timeframes = new Set(Object.values(states).flatMap(byTf => Object.values(byTf).filter(s => s.candles.length > 0).map(s => s.granularity))).size;
  const assetCount = new Set(Object.keys(states)).size;
  return (
    <section className="mt-8 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Dedicated market scanner</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Break &amp; Retest Setups</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-2">Only confirmed breakouts qualify: a real zone break, a retest, rejection, then a fresh higher high or lower low. Signals are generated after the final confirmation.</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-line/10 bg-surface/[0.04] px-3 py-2 text-xs text-ink-2"><RefreshCw className="h-3.5 w-3.5 text-accent" /> Live scan · all loaded markets</div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-line/10 bg-surface/[0.04] p-4"><p className="text-xs text-ink-2">Markets scanned</p><p className="mt-1 text-2xl font-semibold text-ink">{assetCount}</p></div>
        <div className="rounded-xl border border-line/10 bg-surface/[0.04] p-4"><p className="text-xs text-ink-2">Timeframes active</p><p className="mt-1 text-2xl font-semibold text-ink">{timeframes}/8</p></div>
        <div className="col-span-2 rounded-xl border border-line/10 bg-surface/[0.04] p-4 sm:col-span-1"><p className="text-xs text-ink-2">Confirmed setups</p><p className="mt-1 text-2xl font-semibold text-ink">{setups.length}</p></div>
      </div>
      <div className="flex flex-wrap gap-2">
        {(['ALL', 'BUY', 'SELL'] as const).map(value => <button key={value} onClick={() => setDirection(value)} className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${direction === value ? 'border-accent/50 bg-accent/10 text-ink' : 'border-line/10 text-ink-2 hover:text-ink'}`}>{value === 'ALL' ? 'All setups' : value}</button>)}
      </div>
      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line/20 bg-surface/[0.025] px-5 py-12 text-center">
          <Waves className="mx-auto h-8 w-8 text-ink-2" />
          <h3 className="mt-3 font-semibold text-ink">No confirmed setups yet</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-2">The scanner will keep watching every available asset and timeframe. A zone touch alone will never trigger a trade call.</p>
        </div>
      ) : <div className="grid gap-4 lg:grid-cols-2">
        {visible.map(item => {
          const price = prices[item.symbol] ?? item.entry;
          const BuyIcon = item.direction === 'BUY' ? ArrowUpRight : ArrowDownRight;
          return <article key={item.key} className="rounded-2xl border border-line/15 bg-surface/[0.045] p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div><div className="flex items-center gap-2"><span className={`rounded-md px-2 py-1 text-xs font-bold ${item.direction === 'BUY' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}><BuyIcon className="mr-1 inline h-3.5 w-3.5" />{item.direction} MARKET</span><span className="text-xs text-ink-2">{item.exchange} · {item.timeframe}</span></div><h3 className="mt-3 text-lg font-semibold text-ink">{item.assetName}</h3><p className="text-xs text-ink-2">{item.symbol}</p></div>
              <span className="rounded-full border border-emerald-500/20 px-2.5 py-1 text-[11px] font-semibold text-emerald-500">CONFIRMED</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-surface/[0.06] p-3"><p className="text-xs text-ink-2">Market price</p><p className="mt-1 font-semibold tabular-nums text-ink">{formatPrice(price, 5)}</p></div>
              <div className="rounded-lg bg-surface/[0.06] p-3"><p className="text-xs text-ink-2">Target · prior swing</p><p className="mt-1 font-semibold tabular-nums text-emerald-500">{formatPrice(item.target, 5)}</p></div>
            </div>
            <div className="mt-3 rounded-lg border border-accent/20 bg-accent/[0.04] p-3"><p className="flex items-center gap-2 text-xs font-semibold text-ink"><Crosshair className="h-3.5 w-3.5 text-accent" /> Retest zone</p><p className="mt-1 text-sm font-medium tabular-nums text-ink">{formatPrice(item.zoneLow, 5)} – {formatPrice(item.zoneHigh, 5)}</p></div>
            <div className="mt-3 flex items-center justify-between gap-3 text-xs text-ink-2"><span className="flex items-center gap-1"><Target className="h-3.5 w-3.5" /> Structure confirmed</span><span className="font-medium text-ink">{formatPrice(item.confirmationPrice, 5)}</span></div>
            <p className="mt-3 text-xs leading-relaxed text-ink-2">Break → retest → rejection → {item.direction === 'BUY' ? 'higher high' : 'lower low'}. Market entry is signalled only after confirmation.</p>
          </article>;
        })}
      </div>}
    </section>
  );
}
