import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, TrendingDown, TrendingUp } from 'lucide-react';
import { BinanceStream, fetchBinanceCandles } from '@/lib/binance';
import type { Candle } from '@/lib/deriv';
import { computeTfState, mergeCandle, TIMEFRAMES, type TfState, type Timeframe } from '@/lib/sma';
import { formatPrice } from '@/lib/sma';

type Props = {
  symbol: string;
  name: string;
  changePct: number;
  close: number;
  isMonitored: boolean;
  canMonitor: boolean;
  onMonitor: () => void;
};

const CHART_HEIGHT = 280;
const PADDING = { top: 18, right: 84, bottom: 24, left: 14 };

function describeMarket(state: TfState) {
  const price = state.lastClose;
  const sma = state.currentSma;
  const deviation = state.stdDev;
  if (price == null || sma == null || deviation == null || state.candles.length < 60) {
    return {
      bias: 'Building analysis',
      detail: 'More confirmed candles are needed before the market structure can be assessed.',
      momentum: 'Not enough data',
      band: 'Not available',
      volatility: 'Not available',
      structure: 'Waiting for candle history',
    };
  }
  const recent = state.candles.slice(-6);
  const first = recent[0]?.close ?? price;
  const momentumPct = first !== 0 ? ((price - first) / first) * 100 : 0;
  const upper = sma + deviation * 2.5;
  const lower = sma - deviation * 2.5;
  const bias = price > sma ? 'Bullish bias' : price < sma ? 'Bearish bias' : 'Neutral bias';
  const band = price >= upper ? 'At / above upper band' : price <= lower ? 'At / below lower band' : 'Inside Bollinger Bands';
  const volatilityPct = price !== 0 ? (deviation * 2.5 / price) * 100 : 0;
  const structureCandles = state.candles.slice(-20);
  const support = Math.min(...structureCandles.map((candle) => candle.low));
  const resistance = Math.max(...structureCandles.map((candle) => candle.high));
  const momentum = momentumPct > 0.15 ? `Positive · +${momentumPct.toFixed(2)}% over 6 candles`
    : momentumPct < -0.15 ? `Negative · ${momentumPct.toFixed(2)}% over 6 candles`
    : `Flat · ${momentumPct.toFixed(2)}% over 6 candles`;
  return {
    bias,
    detail: price > sma
      ? 'Price is trading above its 60-period average. Watch for sustained closes and pullbacks before treating the move as a confirmed entry.'
      : price < sma
      ? 'Price is trading below its 60-period average. Watch for sustained closes and rebounds before treating the move as a confirmed entry.'
      : 'Price is close to its 60-period average; direction is not yet established.',
    momentum,
    band,
    volatility: `${volatilityPct.toFixed(2)}% band distance from the mean`,
    structure: `20-candle support ${formatPrice(support, 6)} · resistance ${formatPrice(resistance, 6)}`,
  };
}

export function CryptoMoverAnalysis({ symbol, name, changePct, close, isMonitored, canMonitor, onMonitor }: Props) {
  const [timeframe, setTimeframe] = useState<Timeframe>(TIMEFRAMES.find((item) => item.label === 'M15') ?? TIMEFRAMES[2]);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(80);
  const [spacing, setSpacing] = useState(12);
  const [showSma, setShowSma] = useState(true);
  const [showBands, setShowBands] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const stream = new BinanceStream();
    fetchBinanceCandles(symbol, timeframe, 500)
      .then((rows) => {
        if (cancelled) return;
        setCandles(rows);
        stream.start([symbol], [timeframe], (_granularity, candle) => {
          if (!cancelled) setCandles((previous) => mergeCandle(previous, candle));
        });
      })
      .catch((reason: Error) => {
        if (!cancelled) {
          setCandles([]);
          setError(reason.message || 'Market candles are temporarily unavailable.');
          // Keep the live stream available even if the REST history endpoint is temporarily unavailable.
          stream.start([symbol], [timeframe], (_granularity, candle) => {
            if (!cancelled) setCandles((previous) => mergeCandle(previous, candle));
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; stream.stop(); };
  }, [symbol, timeframe]);

  const state = useMemo(() => computeTfState(timeframe, candles, Math.floor(Date.now() / 1000)), [timeframe, candles]);
  const analysis = useMemo(() => describeMarket(state), [state]);
  const data = useMemo(() => state.candles.slice(-Math.min(visibleCount, state.candles.length)), [state.candles, visibleCount]);
  const stats = useMemo(() => {
    const closes = state.candles.map((item) => item.close);
    return state.candles.map((_, index) => {
      if (index < 59) return null;
      const window = closes.slice(index - 59, index + 1);
      const mean = window.reduce((sum, value) => sum + value, 0) / 60;
      const variance = window.reduce((sum, value) => sum + (value - mean) ** 2, 0) / 60;
      const deviation = Math.sqrt(variance);
      return { mean, upper: mean + 2.5 * deviation, lower: mean - 2.5 * deviation };
    });
  }, [state.candles]);
  const visibleStats = useMemo(() => stats.slice(-data.length), [stats, data.length]);

  const latestSignal = state.latestSignal;
  const signalFresh = latestSignal != null && Math.floor(Date.now() / 1000) - (latestSignal.signalEpoch + timeframe.granularity) <= 2 * timeframe.granularity;

  const chart = useMemo(() => {
    if (data.length < 2) return null;
    const values = data.flatMap((candle, index) => [
      candle.high, candle.low,
      ...(showBands && visibleStats[index] ? [visibleStats[index]!.upper, visibleStats[index]!.lower] : []),
      ...(showSma && visibleStats[index] ? [visibleStats[index]!.mean] : []),
    ]).concat(latestSignal ? [latestSignal.levels.entry, latestSignal.levels.stopLoss, latestSignal.levels.tp3] : []);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = Math.max(max - min, Math.abs(max) * 0.00001, 0.000001);
    const plotWidth = Math.max(600, data.length * spacing);
    const plotHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;
    const x = (index: number) => PADDING.left + index * spacing;
    const y = (price: number) => PADDING.top + ((max - price) / range) * plotHeight;
    const path = (key: 'mean' | 'upper' | 'lower') => visibleStats
      .map((item, index) => item ? `${index === 0 || !visibleStats[index - 1] ? 'M' : 'L'} ${x(index)} ${y(item[key])}` : '')
      .filter(Boolean).join(' ');
    return { min, max, x, y, path, width: PADDING.left + plotWidth + PADDING.right, bodyWidth: Math.max(2, Math.min(28, spacing * 0.72)) };
  }, [data, visibleStats, showBands, showSma, spacing, latestSignal]);

  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-line/10 bg-surface/[0.03]">
      <div className="flex flex-col gap-3 border-b border-line/10 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-ink">{name}/USDT market analysis</h3>
            <span className="rounded-md bg-accent/10 px-2 py-1 text-[10px] font-semibold text-accent">BINANCE SPOT</span>
          </div>
          <p className="mt-1 text-xs text-ink-3">24-hour move {changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}% · Latest daily snapshot close {formatPrice(close, 6)}</p>
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
          {isMonitored ? (
            <span className="rounded-lg border border-up/30 bg-up/10 px-3 py-2 text-xs font-semibold text-up">In monitored assets</span>
          ) : (
            <button type="button" onClick={onMonitor} disabled={!canMonitor}
              className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-xs font-semibold text-accent disabled:cursor-not-allowed disabled:opacity-50">
              {canMonitor ? 'Add to monitored assets' : '10/10 assets monitored'}
            </button>
          )}
        </div>
        {!isMonitored && !canMonitor && (
          <p className="px-4 pb-3 text-xs text-ink-3">Your 10 monitoring slots are full. Remove an asset from the top selector before adding this pair for configured alerts.</p>
        )}
        {isMonitored && (
          <p className="px-4 pb-3 text-xs text-ink-3">This pair is in your monitored assets and is eligible for your configured signal and pending-order alerts.</p>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-3 p-8 text-sm text-ink-2"><Loader2 className="h-4 w-4 animate-spin text-accent" />Loading {timeframe.label} chart and analysis…</div>
      ) : error ? (
        <div className="flex items-center gap-2 p-5 text-sm text-down"><AlertTriangle className="h-4 w-4" />{error}</div>
      ) : (
        <>
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-xl border border-line/10 p-3">
              <p className="text-[10px] uppercase tracking-wider text-ink-3">Market bias</p>
              <p className="mt-1 text-sm font-semibold text-ink">{analysis.bias}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-2">{analysis.detail}</p>
            </div>
            <div className="rounded-xl border border-line/10 p-3">
              <p className="text-[10px] uppercase tracking-wider text-ink-3">Momentum</p>
              <p className="mt-1 text-sm font-semibold text-ink">{analysis.momentum}</p>
            </div>
            <div className="rounded-xl border border-line/10 p-3">
              <p className="text-[10px] uppercase tracking-wider text-ink-3">Bollinger position</p>
              <p className="mt-1 text-sm font-semibold text-ink">{analysis.band}</p>
            </div>
            <div className="rounded-xl border border-line/10 p-3">
              <p className="text-[10px] uppercase tracking-wider text-ink-3">Volatility</p>
              <p className="mt-1 text-sm font-semibold text-ink">{analysis.volatility}</p>
            </div>
            <div className="rounded-xl border border-line/10 p-3">
              <p className="text-[10px] uppercase tracking-wider text-ink-3">Market structure</p>
              <p className="mt-1 text-xs font-semibold leading-relaxed text-ink">{analysis.structure}</p>
            </div>
          </div>

          <div className="mx-4 mb-4 rounded-xl border border-line/10 bg-canvas/60 p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3 text-xs text-ink-2">
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={showSma} onChange={(event) => setShowSma(event.target.checked)} /> SMA 60</label>
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={showBands} onChange={(event) => setShowBands(event.target.checked)} /> Bollinger ±2.5σ</label>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setVisibleCount((value) => Math.min(200, value + 20))} className="rounded-lg border border-line/15 px-2 py-1 text-xs text-ink-2">Zoom out</button>
                <span className="text-[10px] tabular-nums text-ink-3">{data.length} candles</span>
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
                <svg viewBox={`0 0 ${chart.width} ${CHART_HEIGHT}`} role="img" aria-label={`${name} ${timeframe.label} candlestick chart with SMA 60 and Bollinger Bands`} style={{ width: `${chart.width}px`, maxWidth: "none", height: "auto" }} className="block">
                  {[0,1,2,3].map((step) => {
                    const y = PADDING.top + ((CHART_HEIGHT - PADDING.top - PADDING.bottom) * step) / 3;
                    const value = chart.max - ((chart.max - chart.min) * step) / 3;
                    return <g key={step}><line x1={PADDING.left} x2={chart.width - PADDING.right} y1={y} y2={y} stroke="currentColor" opacity="0.12" strokeDasharray="3 5" /><text x={chart.width - 6} y={y - 4} textAnchor="end" fill="currentColor" opacity="0.6" fontSize="11">{value.toPrecision(6)}</text></g>;
                  })}
                  {showBands && <><path d={chart.path('upper')} fill="none" stroke="#ef7777" strokeWidth="2" /><path d={chart.path('lower')} fill="none" stroke="#60a5fa" strokeWidth="2" /></>}
                  {showSma && <path d={chart.path('mean')} fill="none" stroke="#eab308" strokeWidth="2" />}
                  {latestSignal && [
                    { label: 'ENTRY', value: latestSignal.levels.entry, color: '#60a5fa' },
                    { label: 'STOP', value: latestSignal.levels.stopLoss, color: '#fb7185' },
                    { label: 'TP3', value: latestSignal.levels.tp3, color: '#4ade80' },
                  ].map((level) => (
                    <g key={level.label}>
                      <line x1={PADDING.left} x2={chart.width - PADDING.right} y1={chart.y(level.value)} y2={chart.y(level.value)} stroke={level.color} strokeDasharray="5 4" strokeWidth="1.5" />
                      <text x={PADDING.left + 4} y={Math.max(PADDING.top + 10, chart.y(level.value) - 4)} fill={level.color} fontSize="10" fontWeight="700">{level.label}</text>
                    </g>
                  ))}
                  {data.map((candle, index) => {
                    const up = candle.close >= candle.open;
                    const color = up ? '#22c55e' : '#f43f5e';
                    const top = chart.y(Math.max(candle.open, candle.close));
                    const bottom = chart.y(Math.min(candle.open, candle.close));
                    return <g key={candle.epoch}><line x1={chart.x(index)} x2={chart.x(index)} y1={chart.y(candle.high)} y2={chart.y(candle.low)} stroke={color} strokeWidth="1.5" /><rect x={chart.x(index) - chart.bodyWidth / 2} y={top} width={chart.bodyWidth} height={Math.max(1.5, bottom - top)} fill={color} rx="1" /></g>;
                  })}
                </svg>
              </div>
            ) : <p className="py-8 text-center text-xs text-ink-3">Waiting for enough confirmed candles to draw this chart.</p>}
          </div>


          <div className="border-t border-line/10 p-4">
            {latestSignal ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  {latestSignal.direction === 'BUY' ? <TrendingUp className="h-4 w-4 text-up" /> : <TrendingDown className="h-4 w-4 text-down" />}
                  <div>
                    <p className="text-sm font-semibold text-ink">{signalFresh ? 'Latest confirmed signal' : 'Previous signal · not a fresh entry'}</p>
                    <p className="text-xs text-ink-2">{latestSignal.direction} · {latestSignal.outcome.status} · {timeframe.label} candle-close confirmation</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                  <span className="text-ink-2">Entry <b className="text-ink">{formatPrice(latestSignal.levels.entry, 6)}</b></span>
                  <span className="text-ink-2">Stop <b className="text-ink">{formatPrice(latestSignal.levels.stopLoss, 6)}</b></span>
                  <span className="text-ink-2">TP1 <b className="text-ink">{formatPrice(latestSignal.levels.tp1, 6)}</b></span>
                  <span className="text-ink-2">TP3 <b className="text-ink">{formatPrice(latestSignal.levels.tp3, 6)}</b></span>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-sm font-semibold text-ink">No confirmed {timeframe.label} signal</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-2">The chart and technical analysis are still available above. Wait for a candle-close confirmation; no BUY or SELL entry is being suggested right now.</p>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
