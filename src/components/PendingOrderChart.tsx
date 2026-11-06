import { useId, useMemo, useState } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import type { Candle } from '@/lib/deriv';
import { formatPrice } from '@/lib/sma';

type Props = {
  candles: Candle[];
  entry: number;
  stopLoss: number;
  takeProfit: number;
  currentPrice: number;
  digits: number;
  direction: 'BUY' | 'SELL';
  symbol: string;
};

const HEIGHT = 280;
const PAD = { top: 18, right: 104, bottom: 22, left: 12 };
const INDICATOR_PERIOD = 60;

function calculateBands(candles: Candle[]) {
  const closes = candles.map((candle) => candle.close);
  return closes.map((_, index) => {
    if (index < INDICATOR_PERIOD - 1) return null;
    const window = closes.slice(index - INDICATOR_PERIOD + 1, index + 1);
    const mean = window.reduce((sum, value) => sum + value, 0) / INDICATOR_PERIOD;
    const variance = window.reduce((sum, value) => sum + (value - mean) ** 2, 0) / INDICATOR_PERIOD;
    const deviation = Math.sqrt(variance);
    return { mean, upper: mean + deviation * 2.5, lower: mean - deviation * 2.5 };
  });
}

export function PendingOrderChart({ candles, entry, stopLoss, takeProfit, currentPrice, digits, direction, symbol }: Props) {
  const gradientId = `pending-band-${useId().replace(/:/g, '')}`;
  const [visibleCount, setVisibleCount] = useState(60);
  const [spacing, setSpacing] = useState(12);
  const [scrollPosition, setScrollPosition] = useState(100);
  const [showSma, setShowSma] = useState(true);
  const [showBands, setShowBands] = useState(true);
  const history = useMemo(() => candles.slice(-240), [candles]);
  const indicators = useMemo(() => calculateBands(history), [history]);

  if (history.length < 2) {
    return <div className="rounded-xl border border-line/10 bg-surface/[0.03] px-4 py-6 text-center text-xs text-ink-3">Chart snapshot will appear when M15 candle history is available.</div>;
  }

  const count = Math.min(visibleCount, history.length);
  const maxStart = Math.max(0, history.length - count);
  const start = Math.round((scrollPosition / 100) * maxStart);
  const data = history.slice(start, start + count);
  const stats = indicators.slice(start, start + count);
  const values = data.flatMap((candle, index) => [
    candle.high,
    candle.low,
    ...(showBands && stats[index] ? [stats[index]!.upper, stats[index]!.lower] : []),
    ...(showSma && stats[index] ? [stats[index]!.mean] : []),
  ]).concat([entry, stopLoss, takeProfit, currentPrice]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, Math.abs(max) * 0.00001, 0.000001);
  const plotW = Math.max(600, data.length * spacing);
  const width = PAD.left + plotW + PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (index: number) => PAD.left + (index / Math.max(data.length - 1, 1)) * plotW;
  const y = (price: number) => PAD.top + ((max - price) / range) * plotH;
  const bodyW = Math.max(2, Math.min(spacing * 0.72, 18));
  const pathFor = (key: 'mean' | 'upper' | 'lower') => stats
    .map((item, index) => item ? `${index === 0 || !stats[index - 1] ? 'M' : 'L'} ${x(index)} ${y(item[key])}` : '')
    .filter(Boolean).join(' ');
  const upperPath = pathFor('upper');
  const lowerPath = stats.slice().reverse().map((item, reverseIndex) => {
    if (!item) return '';
    const index = stats.length - 1 - reverseIndex;
    return `${reverseIndex === 0 || !stats[index + 1] ? 'M' : 'L'} ${x(index)} ${y(item.lower)}`;
  }).filter(Boolean).join(' ');
  const orderLines = [
    { label: 'ENTRY', value: entry, color: '#60a5fa', dash: '4 3' },
    { label: 'STOP LOSS', value: stopLoss, color: '#fb7185', dash: '4 3' },
    { label: 'TAKE PROFIT', value: takeProfit, color: '#4ade80', dash: '4 3' },
    { label: 'MARKET', value: currentPrice, color: '#facc15', dash: '2 3' },
  ];

  return (
    <section className="min-w-0 max-w-full overflow-hidden rounded-xl border border-line/15 bg-[#0b1220] text-white" aria-label={`Interactive M15 pending order chart for ${symbol}`}>
      <div className="flex flex-col gap-3 border-b border-white/10 px-3 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${direction === 'BUY' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
            <span className="text-xs font-semibold tracking-wide text-white">M15 ORDER SNAPSHOT</span>
            <span className={`max-w-full break-words rounded px-2 py-1 text-[10px] font-bold ${direction === 'BUY' ? 'bg-emerald-400/15 text-emerald-300' : 'bg-rose-400/15 text-rose-300'}`}>{direction} · {symbol}</span>
          </div>
          <span className="max-w-full break-words text-[10px] tabular-nums text-slate-400">{data.length} candles shown · {history.length} loaded</span>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-3 text-[10px] text-slate-300">
            <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={showSma} onChange={(event) => setShowSma(event.target.checked)} className="accent-amber-400" /> SMA 60</label>
            <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={showBands} onChange={(event) => setShowBands(event.target.checked)} className="accent-sky-400" /> Bollinger ±2.5σ</label>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setVisibleCount((value) => Math.min(120, value + 10))} disabled={visibleCount >= 120} aria-label="Zoom out chart" title="Zoom out" className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/15 bg-white/5 text-slate-200 hover:bg-white/10 disabled:opacity-35"><ZoomOut className="h-3.5 w-3.5" /></button>
            <span className="min-w-16 text-center text-[10px] tabular-nums text-slate-300">{visibleCount} candles</span>
            <button type="button" onClick={() => setVisibleCount((value) => Math.max(15, value - 10))} disabled={visibleCount <= 15} aria-label="Zoom in chart" title="Zoom in" className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/15 bg-white/5 text-slate-200 hover:bg-white/10 disabled:opacity-35"><ZoomIn className="h-3.5 w-3.5" /></button>
          </div>
        </div>
        <label className="flex items-center gap-3 text-[10px] text-slate-400">
          <span className="w-20 shrink-0">Candle spacing</span>
          <input aria-label="Candle spacing" type="range" min="6" max="24" step="1" value={spacing} onChange={(event) => setSpacing(Number(event.target.value))} className="min-w-0 flex-1 accent-sky-400" />
          <span className="w-8 text-right tabular-nums">{spacing}px</span>
        </label>
      </div>
      <div className="w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain touch-pan-x">
        <svg viewBox={`0 0 ${width} ${HEIGHT}`} role="img" aria-label="Scrollable candlestick chart with SMA, Bollinger Bands, order levels and market price" style={{ width: `${width}px`, maxWidth: 'none', height: 'auto' }} className="block">
          <defs><linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#60a5fa" stopOpacity="0.16" /><stop offset="100%" stopColor="#60a5fa" stopOpacity="0.02" /></linearGradient></defs>
          {[0, 1, 2, 3].map((step) => {
            const gy = PAD.top + (plotH * step) / 3;
            const price = max - (range * step) / 3;
            return <g key={step}><line x1={PAD.left} x2={width - PAD.right} y1={gy} y2={gy} stroke="#94a3b8" strokeOpacity="0.16" strokeDasharray="3 5" /><text x={width - PAD.right + 7} y={gy + 3} fill="#94a3b8" fontSize="10">{formatPrice(price, digits)}</text></g>;
          })}
          {showBands && upperPath && lowerPath && <path d={`${upperPath} ${lowerPath.replace(/^M/, 'L')} Z`} fill={`url(#${gradientId})`} />}
          {showBands && <><path d={upperPath} fill="none" stroke="#f87171" strokeWidth="1.8" /><path d={lowerPath} fill="none" stroke="#60a5fa" strokeWidth="1.8" /></>}
          {showSma && <path d={pathFor('mean')} fill="none" stroke="#facc15" strokeWidth="2.2" />}
          {orderLines.map((line) => <g key={line.label}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(line.value)} y2={y(line.value)} stroke={line.color} strokeWidth="1.5" strokeDasharray={line.dash} />
            <text x={PAD.left + 4} y={Math.max(PAD.top + 10, y(line.value) - 4)} fill={line.color} fontSize="9" fontWeight="700">{line.label}</text>
          </g>)}
          {data.map((candle, index) => {
            const up = candle.close >= candle.open;
            const color = up ? '#22c55e' : '#f43f5e';
            const top = y(Math.max(candle.open, candle.close));
            const bottom = y(Math.min(candle.open, candle.close));
            return <g key={candle.epoch}><line x1={x(index)} x2={x(index)} y1={y(candle.high)} y2={y(candle.low)} stroke={color} strokeWidth="1.2" /><rect x={x(index) - bodyW / 2} y={top} width={bodyW} height={Math.max(1.5, bottom - top)} rx="0.6" fill={color} /></g>;
          })}
          <text x={PAD.left + 2} y={HEIGHT - 4} fill="#64748b" fontSize="9">SUPERTECH AI · M15 PRICE ACTION</text>
        </svg>
      </div>
      <div className="border-t border-white/10 px-3 py-3">
        <label className="flex items-center gap-3 text-[10px] text-slate-400">
          <span className="w-20 shrink-0">History slider</span>
          <input aria-label="Scroll chart history" type="range" min="0" max="100" step="1" value={scrollPosition} onChange={(event) => setScrollPosition(Number(event.target.value))} className="min-w-0 flex-1 accent-sky-400" />
          <span className="w-14 text-right">{scrollPosition === 100 ? 'Latest' : 'History'}</span>
        </label>
      </div>
      <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-2 border-t border-white/10 px-3 py-2 text-[10px] text-slate-300">
        {orderLines.map((line) => <span key={line.label} className="flex items-center gap-1.5"><i className="h-0.5 w-3" style={{ backgroundColor: line.color }} />{line.label}: {formatPrice(line.value, digits)}</span>)}
        {showSma && <span className="flex items-center gap-1.5"><i className="h-0.5 w-3 bg-yellow-400" />SMA 60</span>}
        {showBands && <><span className="flex items-center gap-1.5"><i className="h-0.5 w-3 bg-rose-400" />Upper band</span><span className="flex items-center gap-1.5"><i className="h-0.5 w-3 bg-blue-400" />Lower band</span></>}
      </div>
    </section>
  );
}
