import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, TrendingDown, TrendingUp } from 'lucide-react';
import { SignalCard } from '@/components/SignalCard';
import { EXCHANGE_OPTIONS, buildExchangeStates, fetchExchangeTickers, type ExchangeId, type ExchangeTicker } from '@/lib/exchangeMarkets';
import type { SignalLearningModel } from '@/lib/aiLearning';
import type { View } from '@/components/ViewNav';
import type { Asset, Timeframe, TfState } from '@/lib/sma';
import { TIMEFRAMES, formatPrice } from '@/lib/sma';

type Props = { aiModel: SignalLearningModel; onNavigate: (view: View) => void };
type LoadState = { rows: ExchangeTicker[]; loading: boolean; error: string | null };

export function ExchangeMarkets({ aiModel, onNavigate }: Props) {
  const [exchange, setExchange] = useState<ExchangeId>('OKX');
  const [load, setLoad] = useState<LoadState>({ rows: [], loading: true, error: null });
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [query, setQuery] = useState('');
  const [timeframe, setTimeframe] = useState<Timeframe>(TIMEFRAMES.find((item) => item.label === 'M15') ?? TIMEFRAMES[0]);
  const [states, setStates] = useState<Record<number, TfState>>({});
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(60);
  const [spacing, setSpacing] = useState(12);
  const [showSma, setShowSma] = useState(true);
  const [showBands, setShowBands] = useState(true);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const loadTickers = async () => {
      try {
        const rows = await fetchExchangeTickers(exchange);
        if (!cancelled) {
          setLoad({ rows, loading: false, error: null });
          setSelectedSymbol((current) => rows.some((row) => row.symbol === current) ? current : rows[0]?.symbol ?? '');
        }
      } catch (error) {
        if (!cancelled) setLoad((previous) => ({ ...previous, loading: false, error: error instanceof Error ? error.message : 'Exchange feed is unavailable.' }));
      }
    };
    setLoad((previous) => ({ ...previous, loading: previous.rows.length === 0, error: null }));
    // Keep the previous chart visible while the next exchange/symbol refreshes.
    void loadTickers();
    const timer = window.setInterval(loadTickers, 60_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [exchange, refresh]);

  const selected = load.rows.find((row) => row.symbol === selectedSymbol) ?? load.rows[0] ?? null;
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setChartLoading((current) => current || Object.keys(states).length === 0);
    setChartError(null);
    buildExchangeStates(exchange, selected.symbol)
      .then((next) => { if (!cancelled) setStates(next); })
      .catch((error) => { if (!cancelled) setChartError(error instanceof Error ? error.message : 'Chart data is unavailable.'); })
      .finally(() => { if (!cancelled) setChartLoading(false); });
    return () => { cancelled = true; };
  }, [exchange, selected?.symbol, refresh]);

  useEffect(() => {
    if (!selected) return;
    const timer = window.setInterval(() => setRefresh((value) => value + 1), 60_000);
    return () => window.clearInterval(timer);
  }, [exchange, selected?.symbol]);

  const gainers = useMemo(() => [...load.rows].sort((a, b) => b.changePct - a.changePct).slice(0, 10), [load.rows]);
  const losers = useMemo(() => [...load.rows].sort((a, b) => a.changePct - b.changePct).slice(0, 10), [load.rows]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return load.rows.filter((row) => !term || `${row.base} ${row.symbol}`.toLowerCase().includes(term));
  }, [load.rows, query]);

  const state = selected ? states[timeframe.granularity] : null;
  const candles = state?.chartCandles ?? state?.candles ?? [];
  const visible = candles.slice(-Math.min(visibleCount, candles.length));
  const asset: Asset | null = selected ? { symbol: selected.symbol, name: selected.base, fullName: selected.symbol, digits: selected.price >= 100 ? 2 : selected.price >= 1 ? 4 : 8 } : null;

  const chart = useMemo(() => {
    if (visible.length < 2) return null;
    const mean = (index: number) => {
      const absolute = candles.length - visible.length + index;
      if (absolute < 59) return null;
      const values = candles.slice(absolute - 59, absolute + 1).map((candle) => candle.close);
      const average = values.reduce((sum, value) => sum + value, 0) / 60;
      const deviation = Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / 60);
      return { average, upper: average + 2.5 * deviation, lower: average - 2.5 * deviation };
    };
    const stats = visible.map((_, index) => mean(index));
    const values = visible.flatMap((candle, index) => [candle.high, candle.low, ...(stats[index] && showBands ? [stats[index]!.upper, stats[index]!.lower] : []), ...(stats[index] && showSma ? [stats[index]!.average] : [])]);
    const min = Math.min(...values), max = Math.max(...values), range = Math.max(max - min, Math.abs(max) * 0.00001, 0.000001);
    const width = Math.max(720, visible.length * spacing + 100), height = 280;
    const x = (index: number) => 18 + index * spacing;
    const y = (value: number) => 16 + ((max - value) / range) * (height - 42);
    const path = (key: 'average' | 'upper' | 'lower') => stats.map((item, index) => item ? `${index === 0 || !stats[index - 1] ? 'M' : 'L'} ${x(index)} ${y(item[key])}` : '').filter(Boolean).join(' ');
    return { width, height, min, max, x, y, path, stats, bodyWidth: Math.max(2, Math.min(28, spacing * 0.72)) };
  }, [visible, candles, spacing, showSma, showBands]);

  return (
    <section className="mt-8 flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Multi-exchange intelligence</p>
          <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink">Exchange Markets</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-2">Switch between major crypto exchanges and use the same market-momentum, asset-search, live-chart and signal-analysis workspace.</p>
        </div>
        <button type="button" onClick={() => setRefresh((value) => value + 1)} className="flex h-9 items-center justify-center gap-2 rounded-xl border border-line/10 bg-surface/[0.03] px-3 text-xs font-semibold text-ink-2 hover:text-ink"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
      </div>

      <div className="rounded-2xl border border-accent/25 bg-accent/[0.04] p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Select exchange</p><p className="mt-1 text-sm text-ink-2">Your selection changes the market feed, available assets and chart source.</p></div>
          <select value={exchange} onChange={(event) => setExchange(event.target.value as ExchangeId)} className="rounded-xl border border-line/15 bg-canvas px-4 py-3 text-sm font-semibold text-ink">
            {EXCHANGE_OPTIONS.map((item) => <option key={item.id} value={item.id}>{item.name} Market</option>)}
          </select>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-ink-3">Existing markets</span>
          <button type="button" onClick={() => onNavigate('crypto')} className="rounded-full border border-line/15 bg-surface/[0.03] px-3 py-1.5 text-xs font-semibold text-ink-2 hover:text-ink">Binance Market</button>
          <button type="button" onClick={() => onNavigate('deriv-market')} className="rounded-full border border-line/15 bg-surface/[0.03] px-3 py-1.5 text-xs font-semibold text-ink-2 hover:text-ink">Deriv Market</button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {EXCHANGE_OPTIONS.map((item) => <button key={item.id} type="button" onClick={() => setExchange(item.id)} aria-pressed={exchange === item.id} className={exchange === item.id ? 'rounded-xl border border-accent/40 bg-accent/10 px-3 py-2.5 text-xs font-semibold text-accent' : 'rounded-xl border border-line/10 bg-surface/[0.03] px-3 py-2.5 text-xs font-semibold text-ink-2 hover:text-ink'}>{item.name}</button>)}
        </div>
      </div>

      <div className="rounded-2xl border border-line/10 bg-surface/[0.03] p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Live market momentum</p><h3 className="mt-1 text-lg font-semibold text-ink">{EXCHANGE_OPTIONS.find((item) => item.id === exchange)?.name} gainers and losers</h3></div><span className="text-xs text-ink-3">{load.rows.length} markets</span></div>
        {load.loading ? <p className="py-8 text-center text-sm text-ink-2">Loading exchange markets…</p> : load.error ? <p className="rounded-xl border border-down/20 bg-down/5 p-4 text-sm text-down">{load.error}</p> : (
          <div className="grid gap-4 lg:grid-cols-2">
            <MoverList title="Top gainers" items={gainers} selected={selected?.symbol ?? ''} onSelect={setSelectedSymbol} up />
            <MoverList title="Top losers" items={losers} selected={selected?.symbol ?? ''} onSelect={setSelectedSymbol} />
          </div>
        )}
      </div>

      <section className="overflow-hidden rounded-2xl border border-line/10 bg-surface/[0.03]">
        <div className="flex flex-col gap-3 border-b border-line/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h3 className="text-base font-semibold text-ink">{EXCHANGE_OPTIONS.find((item) => item.id === exchange)?.name} asset watchlist</h3><p className="mt-1 text-xs text-ink-3">Search the highest-volume spot markets quoted in USDT.</p></div>
          <label className="flex items-center gap-2 rounded-lg border border-line/15 bg-canvas px-3 py-2"><Search className="h-4 w-4 text-ink-3" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search assets" className="min-w-0 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3" /></label>
        </div>
        <div className="max-h-80 overflow-auto">
          <table className="w-full min-w-[480px] text-left text-sm"><thead className="sticky top-0 bg-canvas text-[10px] uppercase tracking-wider text-ink-3"><tr><th className="px-4 py-3">Asset</th><th className="px-4 py-3 text-right">Price</th><th className="px-4 py-3 text-right">24h ROC</th><th className="px-4 py-3 text-right">Volume (USDT)</th></tr></thead><tbody className="divide-y divide-line/10">
            {filtered.map((row) => <tr key={row.symbol} className={selected?.symbol === row.symbol ? 'bg-accent/[0.05]' : ''}><td className="px-4 py-3"><button type="button" onClick={() => setSelectedSymbol(row.symbol)} className="text-left"><span className="block font-semibold text-ink">{row.base}/USDT</span><span className="block text-[10px] text-ink-3">{row.symbol}</span></button></td><td className="px-4 py-3 text-right tabular-nums text-ink">{formatPrice(row.price, row.price >= 100 ? 2 : row.price >= 1 ? 4 : 8)}</td><td className={`px-4 py-3 text-right font-semibold tabular-nums ${row.changePct >= 0 ? 'text-up' : 'text-down'}`}>{row.changePct >= 0 ? '+' : ''}{row.changePct.toFixed(2)}%</td><td className="px-4 py-3 text-right tabular-nums text-ink-2">{new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(row.quoteVolume)}</td></tr>)}
            {filtered.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-xs text-ink-3">No matching markets.</td></tr>}
          </tbody></table>
        </div>
      </section>

      {selected && asset && <section className="overflow-hidden rounded-2xl border border-line/10 bg-surface/[0.03]">
        <div className="flex flex-col gap-3 border-b border-line/10 p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><h3 className="text-base font-semibold text-ink">{selected.base}/USDT market analysis</h3><span className="rounded-md bg-accent/10 px-2 py-1 text-[10px] font-semibold text-accent">{exchange}</span></div><p className="mt-1 text-xs text-ink-3">Live price {formatPrice(selected.price, asset.digits)} · 24-hour ROC {selected.changePct >= 0 ? '+' : ''}{selected.changePct.toFixed(2)}%</p></div><label className="flex items-center gap-2 text-xs text-ink-2"><span>Timeframe</span><select value={timeframe.granularity} onChange={(event) => { const next = TIMEFRAMES.find((item) => item.granularity === Number(event.target.value)); if (next) setTimeframe(next); }} className="rounded-lg border border-line/15 bg-canvas px-3 py-2 text-ink">{TIMEFRAMES.map((item) => <option key={item.granularity} value={item.granularity}>{item.label}</option>)}</select></label></div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Market bias" value={!state?.lastClose || !state.currentSma ? 'Building analysis' : state.lastClose > state.currentSma ? 'Bullish bias' : 'Bearish bias'} /><Metric label="24-hour ROC" value={`${selected.changePct >= 0 ? '+' : ''}${selected.changePct.toFixed(2)}%`} /><Metric label="Bollinger position" value={!state?.lastClose || !state.bbHigh || !state.bbLow ? 'Not available' : state.lastClose >= state.bbHigh ? 'At / above upper band' : state.lastClose <= state.bbLow ? 'At / below lower band' : 'Inside bands'} /><Metric label="Chart feed" value={chartLoading ? 'Updating' : chartError ? 'Unavailable' : 'Exchange public data'} /></div>
        <div className="mx-4 mb-4 rounded-xl border border-line/10 bg-canvas/60 p-3"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-3 text-xs text-ink-2"><label className="flex items-center gap-1.5"><input type="checkbox" checked={showSma} onChange={(event) => setShowSma(event.target.checked)} /> SMA 60</label><label className="flex items-center gap-1.5"><input type="checkbox" checked={showBands} onChange={(event) => setShowBands(event.target.checked)} /> Bollinger ±2.5σ</label></div><div className="flex items-center gap-2"><button type="button" onClick={() => setVisibleCount((value) => Math.min(200, value + 20))} className="rounded-lg border border-line/15 px-2 py-1 text-xs text-ink-2">Zoom out</button><span className="text-[10px] tabular-nums text-ink-3">{visible.length} candles</span><button type="button" onClick={() => setVisibleCount((value) => Math.max(30, value - 20))} className="rounded-lg border border-line/15 px-2 py-1 text-xs text-ink-2">Zoom in</button></div></div>
          <label className="mb-3 flex items-center gap-3 text-xs text-ink-2"><span className="shrink-0">Candle spacing</span><input type="range" min="5" max="24" value={spacing} onChange={(event) => setSpacing(Number(event.target.value))} className="min-w-0 flex-1 accent-accent" /><span className="w-8 text-right tabular-nums text-ink-3">{spacing}px</span></label>
          {chart ? <div className="w-full overflow-x-auto overscroll-x-contain"><svg viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label={`${selected.base} ${timeframe.label} chart on ${exchange}`} style={{ width: `${chart.width}px`, maxWidth: 'none', height: 'auto' }} className="block">
            {[0, 1, 2, 3].map((step) => { const y = 16 + ((chart.height - 42) * step) / 3; const value = chart.max - ((chart.max - chart.min) * step) / 3; return <g key={step}><line x1="18" x2={chart.width - 10} y1={y} y2={y} stroke="currentColor" opacity="0.12" strokeDasharray="3 5" /><text x={chart.width - 6} y={y - 4} textAnchor="end" fill="currentColor" opacity="0.6" fontSize="11">{value.toPrecision(6)}</text></g>; })}
            {showBands && <><path d={chart.path('upper')} fill="none" stroke="#ef7777" strokeWidth="2" /><path d={chart.path('lower')} fill="none" stroke="#60a5fa" strokeWidth="2" /></>}{showSma && <path d={chart.path('average')} fill="none" stroke="#eab308" strokeWidth="2" />}
            {visible.map((candle, index) => { const up = candle.close >= candle.open, color = up ? '#22c55e' : '#f43f5e', top = chart.y(Math.max(candle.open, candle.close)), bottom = chart.y(Math.min(candle.open, candle.close)); return <g key={candle.epoch}><line x1={chart.x(index)} x2={chart.x(index)} y1={chart.y(candle.high)} y2={chart.y(candle.low)} stroke={color} strokeWidth="1.5" /><rect x={chart.x(index) - chart.bodyWidth / 2} y={top} width={chart.bodyWidth} height={Math.max(1.5, bottom - top)} fill={color} rx="1" /></g>; })}
          </svg></div> : <p className="py-8 text-center text-xs text-ink-3">{chartLoading ? 'Loading live chart candles…' : chartError ?? 'Waiting for chart history.'}</p>}
        </div>
        {state && asset && <div className="border-t border-line/10 p-4"><SignalCard asset={asset} tf={state} loaded={state.candles.length > 0} price={selected.price} aiModel={aiModel} /></div>}
      </section>}
      <p className="text-xs text-ink-3">Exchange public market data only. No trading keys or account permissions are required. Crypto Market (Binance) and Deriv Market remain separate.</p>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-line/10 p-3"><p className="text-[10px] uppercase tracking-wider text-ink-3">{label}</p><p className="mt-1 text-sm font-semibold text-ink">{value}</p></div>;
}

function MoverList({ title, items, selected, onSelect, up }: { title: string; items: ExchangeTicker[]; selected: string; onSelect: (symbol: string) => void; up?: boolean }) {
  const Icon = up ? TrendingUp : TrendingDown;
  return <div className="hud-panel rounded-2xl border border-line/10 bg-surface/[0.03] p-5"><div className="mb-3 flex items-center gap-2"><Icon className={`h-4 w-4 ${up ? 'text-up' : 'text-down'}`} /><h3 className="text-sm font-semibold text-ink">{title}</h3></div><ul className="divide-y divide-line/10">{items.map((item, index) => <li key={item.symbol}><button type="button" onClick={() => onSelect(item.symbol)} className={selected === item.symbol ? 'flex w-full items-center justify-between gap-3 rounded-lg bg-accent/10 px-2 py-2.5 text-left ring-1 ring-accent/30' : 'flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-surface/[0.05]'}><span className="flex min-w-0 items-center gap-3"><span className="w-5 text-xs tabular-nums text-ink-3">{index + 1}</span><span className="truncate text-sm font-semibold text-ink">{item.base}/USDT</span></span><span className={`shrink-0 text-sm font-semibold tabular-nums ${item.changePct >= 0 ? 'text-up' : 'text-down'}`}>{item.changePct >= 0 ? '+' : ''}{item.changePct.toFixed(2)}%</span></button></li>)}{items.length === 0 && <li className="py-5 text-xs text-ink-3">Waiting for market data.</li>}</ul></div>;
}
