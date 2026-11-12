import { useMemo, useState } from 'react';
import { Activity, Search, TrendingDown, TrendingUp } from 'lucide-react';
import { SignalCard } from '@/components/SignalCard';
import type { SignalLearningModel } from '@/lib/aiLearning';
import type { Asset, TfState, Timeframe } from '@/lib/sma';
import { TIMEFRAMES, formatPrice } from '@/lib/sma';

type Props = {
  assets: Asset[];
  states: Record<string, Record<number, TfState>>;
  prices: Record<string, number>;
  selectedSymbols: string[];
  onMonitorAsset: (symbol: string) => void;
  aiModel: SignalLearningModel;
};

type Mover = { asset: Asset; price: number | null; changePct: number | null; candles: number };

function getRoc(asset: Asset, states: Props['states'], prices: Props['prices']): Mover {
  const hourly = states[asset.symbol]?.[3600]?.candles ?? [];
  const latest = hourly.at(-1);
  const previous = hourly.at(-25);
  const price = prices[asset.symbol] ?? latest?.close ?? null;
  const changePct = previous && previous.close !== 0 && price != null
    ? ((price - previous.close) / previous.close) * 100
    : null;
  return { asset, price, changePct, candles: hourly.length };
}

export function DerivMarket({ assets, states, prices, selectedSymbols, onMonitorAsset, aiModel }: Props) {
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [timeframe, setTimeframe] = useState<Timeframe>(TIMEFRAMES.find((item) => item.label === 'M15') ?? TIMEFRAMES[0]);
  const [visibleCount, setVisibleCount] = useState(60);
  const [spacing, setSpacing] = useState(12);
  const [showSma, setShowSma] = useState(true);
  const [showBands, setShowBands] = useState(true);
  const [query, setQuery] = useState('');

  const derivAssets = useMemo(() => assets.filter((asset) => asset.exchange === 'DERIV'), [assets]);
  const movers = useMemo(() => derivAssets.map((asset) => getRoc(asset, states, prices)), [derivAssets, states, prices]);
  const ranked = useMemo(() => movers.filter((item) => item.changePct != null), [movers]);
  const watchlist = useMemo(() => {
    const term = query.trim().toLowerCase();
    return [...movers].filter((item) => !term || `${item.asset.name} ${item.asset.symbol} ${item.asset.fullName}`.toLowerCase().includes(term))
      .sort((a, b) => (b.changePct ?? -Infinity) - (a.changePct ?? -Infinity));
  }, [movers, query]);
  const gainers = useMemo(() => [...ranked].sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0)).slice(0, 10), [ranked]);
  const losers = useMemo(() => [...ranked].sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0)).slice(0, 10), [ranked]);
  const active = derivAssets.find((asset) => asset.symbol === selectedSymbol) ?? gainers[0]?.asset ?? derivAssets[0] ?? null;
  const activeState = active ? states[active.symbol]?.[timeframe.granularity] : null;
  const hourlyMove = active ? movers.find((item) => item.asset.symbol === active.symbol) : null;
  const candles = activeState?.chartCandles ?? activeState?.candles ?? [];
  const visible = candles.slice(-Math.min(visibleCount, candles.length));

  const chart = useMemo(() => {
    if (visible.length < 2) return null;
    const stats = visible.map((_, index) => {
      const absoluteIndex = candles.length - visible.length + index;
      if (absoluteIndex < 59) return null;
      const closes = candles.slice(absoluteIndex - 59, absoluteIndex + 1).map((item) => item.close);
      const mean = closes.reduce((sum, value) => sum + value, 0) / 60;
      const variance = closes.reduce((sum, value) => sum + (value - mean) ** 2, 0) / 60;
      const deviation = Math.sqrt(variance);
      return { mean, upper: mean + 2.5 * deviation, lower: mean - 2.5 * deviation };
    });
    const values = visible.flatMap((candle, index) => [
      candle.high, candle.low,
      ...(showBands && stats[index] ? [stats[index]!.upper, stats[index]!.lower] : []),
      ...(showSma && stats[index] ? [stats[index]!.mean] : []),
    ]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = Math.max(max - min, Math.abs(max) * 0.00001, 0.000001);
    const width = Math.max(720, visible.length * spacing + 100);
    const height = 280;
    const x = (index: number) => 18 + index * spacing;
    const y = (value: number) => 16 + ((max - value) / range) * (height - 42);
    const path = (key: 'mean' | 'upper' | 'lower') => stats.map((item, index) =>
      item ? `${index === 0 || !stats[index - 1] ? 'M' : 'L'} ${x(index)} ${y(item[key])}` : '',
    ).filter(Boolean).join(' ');
    return { width, height, min, max, x, y, path, stats, bodyWidth: Math.max(2, Math.min(28, spacing * 0.72)) };
  }, [visible, candles, spacing, showSma, showBands]);

  const rocText = (value: number | null) => value == null ? 'Building data' : `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

  return (
    <section className="mt-8 flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Deriv watch list</p>
          <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink">Deriv Market</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-2">Explore Deriv assets, compare live 24-hour momentum, and open any market for its live chart, rate of change and signal analysis.</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-line/10 bg-surface/[0.03] px-3 py-2 text-xs text-ink-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-up" />
          {derivAssets.length} Deriv markets discovered
        </div>
      </div>

      <div className="rounded-2xl border border-accent/25 bg-accent/[0.04] p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Live market momentum</p>
            <h3 className="mt-1 text-lg font-semibold text-ink">Top gainers and losers</h3>
            <p className="mt-1 text-xs text-ink-3">Ranked by rate of change across the latest 24 hourly candles. Rankings appear as data becomes available.</p>
          </div>
          <Activity className="h-5 w-5 text-accent" />
        </div>
        {ranked.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <MoverList title="Top gainers" tone="up" items={gainers} selected={active?.symbol ?? ''} onSelect={setSelectedSymbol} format={rocText} />
            <MoverList title="Top losers" tone="down" items={losers} selected={active?.symbol ?? ''} onSelect={setSelectedSymbol} format={rocText} />
          </div>
        ) : (
          <div className="rounded-xl border border-line/10 p-5 text-sm text-ink-2">Loading Deriv market history and calculating momentum…</div>
        )}
      </div>

      {active ? (
        <section className="overflow-hidden rounded-2xl border border-line/10 bg-surface/[0.03]">
          <div className="flex flex-col gap-3 border-b border-line/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-ink">{active.name} market analysis</h3>
                <span className="rounded-md bg-accent/10 px-2 py-1 text-[10px] font-semibold text-accent">DERIV</span>
              </div>
              <p className="mt-1 text-xs text-ink-3">24-hour rate of change {rocText(hourlyMove?.changePct ?? null)} · Live price {formatPrice(prices[active.symbol] ?? activeState?.lastClose ?? null, active.digits)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-ink-2">
                <span>Timeframe</span>
                <select value={timeframe.granularity} onChange={(event) => {
                  const next = TIMEFRAMES.find((item) => item.granularity === Number(event.target.value));
                  if (next) setTimeframe(next);
                }} className="rounded-lg border border-line/15 bg-canvas px-3 py-2 text-ink">
                  {TIMEFRAMES.map((item) => <option key={item.granularity} value={item.granularity}>{item.label}</option>)}
                </select>
              </label>
              {selectedSymbols.includes(active.symbol) ? (
                <span className="rounded-lg border border-up/30 bg-up/10 px-3 py-2 text-xs font-semibold text-up">Monitored</span>
              ) : (
                <button type="button" onClick={() => onMonitorAsset(active.symbol)} disabled={selectedSymbols.length >= 10}
                  className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-xs font-semibold text-accent disabled:opacity-50">
                  {selectedSymbols.length >= 10 ? '10/10 monitored' : 'Add to monitored assets'}
                </button>
              )}
            </div>
          </div>

          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Market bias" value={activeState?.lastClose == null || activeState.currentSma == null ? 'Building analysis' : activeState.lastClose > activeState.currentSma ? 'Bullish bias' : activeState.lastClose < activeState.currentSma ? 'Bearish bias' : 'Neutral bias'} />
            <Metric label="24-hour ROC" value={rocText(hourlyMove?.changePct ?? null)} />
            <Metric label="Bollinger position" value={activeState?.lastClose == null || activeState.bbHigh == null || activeState.bbLow == null ? 'Not available' : activeState.lastClose >= activeState.bbHigh ? 'At / above upper band' : activeState.lastClose <= activeState.bbLow ? 'At / below lower band' : 'Inside bands'} />
            <Metric label="Latest candle" value={activeState?.updatedEpoch ? new Date(activeState.updatedEpoch * 1000).toLocaleString() : 'Waiting for candle'} />
          </div>

          <div className="mx-4 mb-4 rounded-xl border border-line/10 bg-canvas/60 p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3 text-xs text-ink-2">
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={showSma} onChange={(event) => setShowSma(event.target.checked)} /> SMA 60</label>
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={showBands} onChange={(event) => setShowBands(event.target.checked)} /> Bollinger ±2.5σ</label>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setVisibleCount((value) => Math.min(200, value + 20))} className="rounded-lg border border-line/15 px-2 py-1 text-xs text-ink-2">Zoom out</button>
                <span className="text-[10px] tabular-nums text-ink-3">{visible.length} candles</span>
                <button type="button" onClick={() => setVisibleCount((value) => Math.max(30, value - 20))} className="rounded-lg border border-line/15 px-2 py-1 text-xs text-ink-2">Zoom in</button>
              </div>
            </div>
            <label className="mb-3 flex items-center gap-3 text-xs text-ink-2">
              <span className="shrink-0">Candle spacing</span>
              <input type="range" min="5" max="24" step="1" value={spacing} onChange={(event) => setSpacing(Number(event.target.value))} className="min-w-0 flex-1 accent-accent" />
              <span className="w-8 text-right tabular-nums text-ink-3">{spacing}px</span>
            </label>
            {chart ? (
              <div className="w-full overflow-x-auto overscroll-x-contain">
                <svg viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label={`${active.name} ${timeframe.label} live Deriv candlestick chart`} style={{ width: `${chart.width}px`, maxWidth: 'none', height: 'auto' }} className="block">
                  {[0, 1, 2, 3].map((step) => {
                    const y = 16 + ((chart.height - 42) * step) / 3;
                    const value = chart.max - ((chart.max - chart.min) * step) / 3;
                    return <g key={step}><line x1="18" x2={chart.width - 10} y1={y} y2={y} stroke="currentColor" opacity="0.12" strokeDasharray="3 5" /><text x={chart.width - 6} y={y - 4} textAnchor="end" fill="currentColor" opacity="0.6" fontSize="11">{value.toPrecision(6)}</text></g>;
                  })}
                  {showBands && <><path d={chart.path('upper')} fill="none" stroke="#ef7777" strokeWidth="2" /><path d={chart.path('lower')} fill="none" stroke="#60a5fa" strokeWidth="2" /></>}
                  {showSma && <path d={chart.path('mean')} fill="none" stroke="#eab308" strokeWidth="2" />}
                  {visible.map((candle, index) => {
                    const up = candle.close >= candle.open;
                    const color = up ? '#22c55e' : '#f43f5e';
                    const top = chart.y(Math.max(candle.open, candle.close));
                    const bottom = chart.y(Math.min(candle.open, candle.close));
                    return <g key={candle.epoch}><line x1={chart.x(index)} x2={chart.x(index)} y1={chart.y(candle.high)} y2={chart.y(candle.low)} stroke={color} strokeWidth="1.5" /><rect x={chart.x(index) - chart.bodyWidth / 2} y={top} width={chart.bodyWidth} height={Math.max(1.5, bottom - top)} fill={color} rx="1" /></g>;
                  })}
                </svg>
              </div>
            ) : <p className="py-8 text-center text-xs text-ink-3">Waiting for enough live candles to draw this chart.</p>}
          </div>

          {activeState && <div className="border-t border-line/10 p-4">
            <SignalCard asset={active} tf={activeState} loaded={activeState.candles.length > 0} price={prices[active.symbol] ?? activeState.lastClose ?? 0} aiModel={aiModel} />
          </div>}
        </section>
      ) : (
        <div className="rounded-2xl border border-line/10 bg-surface/[0.03] p-8 text-sm text-ink-2">Deriv assets are still loading. The market list will appear when the public feed is ready.</div>
      )}

      <section className="overflow-hidden rounded-2xl border border-line/10 bg-surface/[0.03]">
        <div className="flex flex-col gap-3 border-b border-line/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h3 className="text-base font-semibold text-ink">Deriv market watchlist</h3><p className="mt-1 text-xs text-ink-3">Every discovered Deriv asset, ranked by its latest 24-hour rate of change.</p></div>
          <label className="flex items-center gap-2 rounded-lg border border-line/15 bg-canvas px-3 py-2"><Search className="h-4 w-4 text-ink-3" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Deriv assets" className="min-w-0 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3" /></label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="bg-surface/[0.04] text-[10px] uppercase tracking-wider text-ink-3"><tr><th className="px-4 py-3">Asset</th><th className="px-4 py-3 text-right">Live price</th><th className="px-4 py-3 text-right">24h ROC</th><th className="px-4 py-3 text-right">Action</th></tr></thead>
            <tbody className="divide-y divide-line/10">
              {watchlist.map((item) => <tr key={item.asset.symbol} className={active?.symbol === item.asset.symbol ? 'bg-accent/[0.05]' : ''}>
                <td className="px-4 py-3"><button type="button" onClick={() => setSelectedSymbol(item.asset.symbol)} className="text-left"><span className="block font-semibold text-ink">{item.asset.name}</span><span className="block text-[10px] text-ink-3">{item.asset.symbol} · {item.asset.fullName}</span></button></td>
                <td className="px-4 py-3 text-right tabular-nums text-ink">{formatPrice(item.price, item.asset.digits)}</td>
                <td className={`px-4 py-3 text-right font-semibold tabular-nums ${(item.changePct ?? 0) >= 0 ? 'text-up' : 'text-down'}`}>{rocText(item.changePct)}</td>
                <td className="px-4 py-3 text-right"><button type="button" onClick={() => setSelectedSymbol(item.asset.symbol)} className="rounded-lg border border-line/15 px-3 py-1.5 text-xs font-semibold text-ink-2 hover:text-ink">Analyse</button></td>
              </tr>)}
              {watchlist.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-xs text-ink-3">No matching Deriv assets.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex items-center justify-between text-xs text-ink-3">
        <span>{derivAssets.length} assets · separate from Crypto Market</span>
        <span>Momentum is calculated from live market candles</span>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-line/10 p-3"><p className="text-[10px] uppercase tracking-wider text-ink-3">{label}</p><p className="mt-1 text-sm font-semibold text-ink">{value}</p></div>;
}

function MoverList({ title, tone, items, selected, onSelect, format }: {
  title: string; tone: 'up' | 'down'; items: Mover[]; selected: string;
  onSelect: (symbol: string) => void; format: (value: number | null) => string;
}) {
  const Icon = tone === 'up' ? TrendingUp : TrendingDown;
  return <div className="hud-panel rounded-2xl border border-line/10 bg-surface/[0.03] p-5">
    <div className="mb-3 flex items-center gap-2"><Icon className={`h-4 w-4 ${tone === 'up' ? 'text-up' : 'text-down'}`} /><h3 className="text-sm font-semibold text-ink">{title}</h3></div>
    <ul className="divide-y divide-line/10">
      {items.map((item, index) => <li key={item.asset.symbol}>
        <button type="button" onClick={() => onSelect(item.asset.symbol)} aria-pressed={selected === item.asset.symbol}
          className={selected === item.asset.symbol ? 'flex w-full items-center justify-between gap-3 rounded-lg bg-accent/10 px-2 py-2.5 text-left ring-1 ring-accent/30' : 'flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-surface/[0.05]'}>
          <span className="flex min-w-0 items-center gap-3"><span className="w-5 text-xs tabular-nums text-ink-3">{index + 1}</span><span className="min-w-0"><span className="block truncate text-sm font-semibold text-ink">{item.asset.name}</span><span className="block truncate text-[10px] text-ink-3">{item.asset.symbol} · {item.asset.fullName}</span></span></span>
          <span className={`shrink-0 text-sm font-semibold tabular-nums ${(item.changePct ?? 0) >= 0 ? 'text-up' : 'text-down'}`}>{format(item.changePct)}</span>
        </button>
      </li>)}
      {items.length === 0 && <li className="py-5 text-xs text-ink-3">Waiting for 24 hourly candles.</li>}
    </ul>
  </div>;
}
