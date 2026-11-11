import { useEffect, useId, useRef, useState } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import type { Candle } from '@/lib/deriv';
import type { SignalLevels } from '@/lib/signals';

type Props = {
  candles: Candle[];
  levels: SignalLevels;
  signalEpoch: number;
  direction: 'BUY' | 'SELL';
  timeframe: string;
  granularity: number;
  digits: number;
  assetName: string;
  symbol: string;
  anchorId: string;
};

const WIDTH = 1440;
const HEIGHT = 620;
const PAD = { top: 30, right: 116, bottom: 48, left: 24 };
const PERIOD = 60;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.5;
// Keep a small projection area after the newest live candle, like TradingView.
const RIGHT_CANDLE_SPACE = 7;

function rolling(values: number[], index: number) {
  if (index < PERIOD - 1) return null;
  const window = values.slice(index - PERIOD + 1, index + 1);
  const mean = window.reduce((sum, value) => sum + value, 0) / PERIOD;
  const variance = window.reduce((sum, value) => sum + (value - mean) ** 2, 0) / PERIOD;
  const deviation = Math.sqrt(variance);
  return { mean, upper: mean + deviation * 2.5, lower: mean - deviation * 2.5 };
}

function timeLabel(epoch: number) {
  const date = new Date(epoch * 1000);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function SignalChartSnapshot({ candles, levels, signalEpoch, direction, timeframe, granularity, digits, assetName, symbol, anchorId }: Props) {
  const gradientId = `signal-cloud-${useId().replace(/:/g, '')}`;
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [clockEpoch, setClockEpoch] = useState(() => Math.floor(Date.now() / 1000));
  const chartViewportRef = useRef<HTMLDivElement>(null);

  // Retain the full candle history for SMA/BB warm-up; display the latest 60 candles.
  const history = candles;
  const historyCloses = history.map((item) => item.close);
  const visibleStart = Math.max(0, history.length - PERIOD);
  const data = history.slice(visibleStart);
  // Recalculate only the visible candles; the preceding history is used solely for SMA warm-up.
  const stats = data.map((_, index) => rolling(historyCloses, visibleStart + index));

  useEffect(() => {
    const timer = window.setInterval(() => setClockEpoch(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const viewport = chartViewportRef.current;
    if (viewport && zoom > MIN_ZOOM) viewport.scrollLeft = viewport.scrollWidth;
  }, [zoom]);

  if (data.length < 2) {
    return (
      <div className="rounded-xl border border-line/20 bg-surface/[0.03] px-4 py-8 text-center text-xs text-ink-3">
        Chart will appear when enough live candle data is available.
      </div>
    );
  }

  const values = data.flatMap((candle, index) => [
    candle.high,
    candle.low,
    stats[index]?.upper ?? candle.high,
    stats[index]?.lower ?? candle.low,
  ]);
  values.push(levels.entry, levels.stopLoss, levels.tp1, levels.tp2, levels.tp3);

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, Math.abs(max) * 0.00001, 0.000001);
  const plotW = (WIDTH - PAD.left - PAD.right) * zoom;
  const svgWidth = PAD.left + plotW + PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const candleSlots = Math.max(data.length - 1, 1) + RIGHT_CANDLE_SPACE;
  const x = (index: number) => PAD.left + (index / candleSlots) * plotW;
  const y = (price: number) => PAD.top + ((max - price) / range) * plotH;
  const candleSpacing = plotW / candleSlots;
  const bodyW = Math.max(5, Math.min(42, candleSpacing * 0.68));

  const linePath = (key: 'mean' | 'upper' | 'lower') => stats
    .map((item, index) => item ? `${index === 0 || !stats[index - 1] ? 'M' : 'L'} ${x(index)} ${y(item[key])}` : '')
    .filter(Boolean)
    .join(' ');

  const bandPoints: Array<[number, number, number] | null> = stats.map((item, index) =>
    item ? [x(index), y(item.upper), y(item.lower)] : null
  );
  const upperPath = bandPoints
    .map((item, index) => item ? `${index === 0 || !bandPoints[index - 1] ? 'M' : 'L'} ${item[0]} ${item[1]}` : '')
    .filter(Boolean)
    .join(' ');
  const lowerPath = bandPoints.slice().reverse().map((item, reverseIndex) => {
    if (!item) return '';
    const index = bandPoints.length - 1 - reverseIndex;
    return `${reverseIndex === 0 || !bandPoints[index + 1] ? 'M' : 'L'} ${item[0]} ${item[2]}`;
  }).filter(Boolean).join(' ');

  const signalIndex = data.findIndex((candle) => candle.epoch === signalEpoch);
  const transitionIndex = signalIndex >= 0 ? signalIndex : Math.max(0, data.length - 8);
  const transitionX = x(transitionIndex);
  const leftRegime = direction === 'BUY' ? '#ef4444' : '#2563eb';
  const rightRegime = direction === 'BUY' ? '#2563eb' : '#ef4444';
  const latest = data[data.length - 1];
  const secondsRemaining = Math.max(0, latest.epoch + granularity - clockEpoch);
  const days = Math.floor(secondsRemaining / 86400);
  const hours = Math.floor((secondsRemaining % 86400) / 3600);
  const minutes = Math.floor((secondsRemaining % 3600) / 60);
  const seconds = secondsRemaining % 60;
  const countdown = `${days > 0 ? `${days}d ` : ''}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const latestStats = stats[stats.length - 1];
  const gridPrices = Array.from({ length: 6 }, (_, index) => max - (range * index) / 5);

  const levelsToDraw = [
    { label: 'ENTRY', value: levels.entry, color: '#f8fafc', dash: '7 5', width: 1.8 },
    { label: 'STOP LOSS', value: levels.stopLoss, color: '#fb7185', dash: '5 5', width: 1.5 },
    { label: 'TAKE PROFIT 1', value: levels.tp1, color: '#4ade80', dash: '5 5', width: 1.4 },
    { label: 'TAKE PROFIT 2', value: levels.tp2, color: '#22c55e', dash: '5 5', width: 1.4 },
    { label: 'TAKE PROFIT 3', value: levels.tp3, color: '#16a34a', dash: '5 5', width: 1.4 },
  ];

  return (
    <section id={anchorId} className="scroll-mt-[50vh] overflow-hidden rounded-2xl border border-white/20 bg-[#080d18] text-white shadow-[0_18px_55px_-28px_rgba(0,0,0,.9)]" aria-label={`Premium ${timeframe} market chart`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#0c1423] px-4 py-3 sm:px-5">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <span className={`h-2.5 w-2.5 rounded-full ${direction === 'BUY' ? 'bg-blue-400' : 'bg-rose-400'} shadow-[0_0_12px_currentColor]`} />
          <span className="text-xs font-bold tracking-[0.16em] text-white">{timeframe} · MARKET STRUCTURE</span>
          <span className="rounded-md border border-amber-300/30 bg-amber-300/10 px-2 py-1 text-[10px] font-semibold tracking-wide text-amber-200">SMA 60 · BB ±2.5σ</span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-2.5 py-1.5 font-mono text-[11px] font-bold tabular-nums text-cyan-100" aria-label="Current candle countdown">CLOSES IN {countdown}</span>
          <span className="mr-1 text-[10px] tabular-nums text-slate-400">{data.length} candles</span>
          <button type="button" onClick={() => setZoom((current) => Math.max(MIN_ZOOM, current - ZOOM_STEP))} disabled={zoom === MIN_ZOOM} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/20 bg-white/[0.04] text-slate-200 hover:border-amber-200/60 hover:bg-white/10 disabled:opacity-30" aria-label="Zoom out chart" title="Zoom out chart"><ZoomOut className="h-4 w-4" /></button>
          <span className="min-w-10 text-center text-[10px] tabular-nums text-slate-300">{zoom.toFixed(1)}×</span>
          <button type="button" onClick={() => setZoom((current) => Math.min(MAX_ZOOM, current + ZOOM_STEP))} disabled={zoom === MAX_ZOOM} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/20 bg-white/[0.04] text-slate-200 hover:border-amber-200/60 hover:bg-white/10 disabled:opacity-30" aria-label="Zoom in chart" title="Zoom in chart"><ZoomIn className="h-4 w-4" /></button>
        </div>
      </div>

      <div ref={chartViewportRef} className="w-full overflow-x-auto overscroll-x-contain touch-auto">
        <svg viewBox={`0 0 ${svgWidth} ${HEIGHT}`} role="img" aria-label="Candlestick chart with directional market cloud, upper and lower volatility bands, moving average, entry, stop-loss and take-profit levels" style={{ width: zoom === 1 ? '100%' : `${svgWidth}px`, minWidth: zoom === 1 ? '720px' : undefined, maxWidth: 'none', height: 'auto', display: 'block' }}>
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#93c5fd" stopOpacity="0.24" />
              <stop offset="50%" stopColor="#bfdbfe" stopOpacity="0.10" />
              <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.20" />
            </linearGradient>
            <linearGradient id={`${gradientId}-left`} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor={leftRegime} stopOpacity="0.42" />
              <stop offset="100%" stopColor={leftRegime} stopOpacity="0.20" />
            </linearGradient>
            <linearGradient id={`${gradientId}-right`} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor={rightRegime} stopOpacity="0.24" />
              <stop offset="100%" stopColor={rightRegime} stopOpacity="0.42" />
            </linearGradient>
          </defs>

          <rect x={PAD.left} y={PAD.top} width={Math.max(0, transitionX - PAD.left)} height={plotH} fill={`url(#${gradientId}-left)`} />
          <rect x={transitionX} y={PAD.top} width={Math.max(0, svgWidth - PAD.right - transitionX)} height={plotH} fill={`url(#${gradientId}-right)`} />

          {gridPrices.map((price, index) => {
            const gy = y(price);
            return <g key={index}>
              <line x1={PAD.left} x2={svgWidth - PAD.right} y1={gy} y2={gy} stroke="#cbd5e1" strokeOpacity="0.16" strokeDasharray="3 7" />
              <text x={svgWidth - PAD.right + 10} y={gy + 4} fill="#cbd5e1" fontSize="13" fontWeight="500">{price.toFixed(digits)}</text>
            </g>;
          })}

          {upperPath && lowerPath && <path d={`${upperPath} ${lowerPath.replace(/^M/, 'L')} Z`} fill={`url(#${gradientId})`} />}
          {upperPath && <path d={upperPath} fill="none" stroke="#ef4444" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />}
          {lowerPath && <path d={lowerPath} fill="none" stroke="#2563eb" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />}
          {linePath('mean') && <path d={linePath('mean')} fill="none" stroke="#facc15" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />}

          {levelsToDraw.map((level) => <g key={level.label}>
            <line x1={PAD.left} x2={svgWidth - PAD.right} y1={y(level.value)} y2={y(level.value)} stroke={level.color} strokeWidth={level.width} strokeDasharray={level.dash} strokeOpacity="0.92" />
            <rect x={PAD.left + 8} y={Math.max(PAD.top + 3, y(level.value) - 19)} width={level.label.length * 7 + 18} height="18" rx="4" fill="#0b1220" fillOpacity="0.82" stroke={level.color} strokeOpacity="0.7" />
            <text x={PAD.left + 16} y={Math.max(PAD.top + 16, y(level.value) - 6)} fill={level.color} fontSize="10" fontWeight="700" letterSpacing="0.6">{level.label}</text>
          </g>)}

          {data.map((candle, index) => {
            const up = candle.close >= candle.open;
            const color = up ? '#2563eb' : '#ef4444';
            const top = y(Math.max(candle.open, candle.close));
            const bottom = y(Math.min(candle.open, candle.close));
            const bodyHeight = Math.max(2, bottom - top);
            return <g key={candle.epoch}>
              <line x1={x(index)} x2={x(index)} y1={y(candle.high)} y2={y(candle.low)} stroke={color} strokeWidth="2" />
              <rect x={x(index) - bodyW / 2} y={top} width={bodyW} height={bodyHeight} rx="1.2" fill={color} stroke={up ? '#93c5fd' : '#fda4af'} strokeWidth="0.8" />
            </g>;
          })}

          {signalIndex >= 0 && <g>
            <line x1={transitionX} x2={transitionX} y1={PAD.top} y2={HEIGHT - PAD.bottom} stroke={direction === 'BUY' ? '#93c5fd' : '#fda4af'} strokeWidth="2" strokeDasharray="5 6" />
            <rect x={Math.min(svgWidth - PAD.right - 112, transitionX + 12)} y={Math.max(PAD.top + 8, y(data[signalIndex].close) - 42)} width="96" height="27" rx="6" fill={direction === 'BUY' ? '#1d4ed8' : '#be123c'} stroke="#fff" strokeOpacity="0.65" />
            <text x={Math.min(svgWidth - PAD.right - 64, transitionX + 60)} y={Math.max(PAD.top + 26, y(data[signalIndex].close) - 24)} textAnchor="middle" fill="#fff" fontSize="12" fontWeight="800">{direction}</text>
            <circle cx={transitionX} cy={y(data[signalIndex].close)} r="7" fill={direction === 'BUY' ? '#60a5fa' : '#fb7185'} stroke="#fff" strokeWidth="2" />
          </g>}

          {latestStats && <>
            <rect x={svgWidth - PAD.right + 5} y={Math.max(PAD.top, y(latestStats.upper) - 12)} width="104" height="23" rx="4" fill="#ef4444" />
            <text x={svgWidth - PAD.right + 57} y={Math.max(PAD.top + 16, y(latestStats.upper) + 4)} textAnchor="middle" fill="#fff" fontSize="12" fontWeight="700">{latestStats.upper.toFixed(digits)}</text>
            <rect x={svgWidth - PAD.right + 5} y={Math.max(PAD.top, y(latestStats.mean) - 12)} width="104" height="23" rx="4" fill="#eab308" />
            <text x={svgWidth - PAD.right + 57} y={Math.max(PAD.top + 16, y(latestStats.mean) + 4)} textAnchor="middle" fill="#111827" fontSize="12" fontWeight="700">{latestStats.mean.toFixed(digits)}</text>
            <rect x={svgWidth - PAD.right + 5} y={Math.max(PAD.top, y(latestStats.lower) - 12)} width="104" height="23" rx="4" fill="#2563eb" />
            <text x={svgWidth - PAD.right + 57} y={Math.max(PAD.top + 16, y(latestStats.lower) + 4)} textAnchor="middle" fill="#fff" fontSize="12" fontWeight="700">{latestStats.lower.toFixed(digits)}</text>
          </>}

          <rect x={svgWidth - PAD.right + 5} y={Math.min(HEIGHT - PAD.bottom - 25, Math.max(PAD.top, y(latest.close) - 12))} width="104" height="24" rx="4" fill="#f8fafc" />
          <text x={svgWidth - PAD.right + 57} y={Math.min(HEIGHT - PAD.bottom - 8, Math.max(PAD.top + 16, y(latest.close) + 5))} textAnchor="middle" fill="#0f172a" fontSize="12" fontWeight="800">{latest.close.toFixed(digits)}</text>

          {[0, 1, 2, 3, 4].map((step) => {
            const index = Math.round((data.length - 1) * step / 4);
            return <g key={step}>
              <line x1={x(index)} x2={x(index)} y1={HEIGHT - PAD.bottom} y2={HEIGHT - PAD.bottom + 5} stroke="#94a3b8" strokeOpacity="0.6" />
              <text x={x(index)} y={HEIGHT - 14} textAnchor="middle" fill="#94a3b8" fontSize="12">{timeLabel(data[index].epoch)}</text>
            </g>;
          })}
          <text x={PAD.left + 2} y={HEIGHT - 14} fill="#cbd5e1" fontSize="10" fontWeight="700" letterSpacing="1.4">SUPERTECH AI · MARKET INTELLIGENCE</text>
        </svg>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t border-white/10 bg-[#0c1423] px-4 py-3 text-[10px] text-slate-300 sm:px-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="flex items-center gap-2"><i className="h-1 w-5 rounded-full bg-rose-500" /> Upper band</span>
          <span className="flex items-center gap-2"><i className="h-1 w-5 rounded-full bg-yellow-400" /> SMA 60</span>
          <span className="flex items-center gap-2"><i className="h-1 w-5 rounded-full bg-blue-500" /> Lower band</span>
          <span className="flex items-center gap-2"><i className="h-2 w-2 rounded-sm bg-blue-500" /> Bullish candle</span>
          <span className="flex items-center gap-2"><i className="h-2 w-2 rounded-sm bg-rose-500" /> Bearish candle</span>
        </div>
        <span className="min-w-0 break-words whitespace-normal font-semibold tracking-[0.08em] text-amber-200/90" title={`${assetName} (${symbol})`}>{assetName} <span className="text-white/60">·</span> {symbol}</span>
      </div>
    </section>
  );
}
