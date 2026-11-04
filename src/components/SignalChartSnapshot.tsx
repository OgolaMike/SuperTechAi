import { useId, useState } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import type { Candle } from '@/lib/deriv';
import type { SignalLevels } from '@/lib/signals';

type Props = {
  candles: Candle[];
  levels: SignalLevels;
  signalEpoch: number;
  direction: 'BUY' | 'SELL';
  timeframe: string;
  digits: number;
};

const WIDTH = 1440;
const HEIGHT = 250;
const PAD = { top: 18, right: 56, bottom: 24, left: 14 };
const PERIOD = 60;
const FOCUS_OPTIONS = [5, 15, 30, 90] as const;
const MAX_HISTORY_CANDLES = 1440;

function rolling(values: number[], index: number) {
  if (index < PERIOD - 1) return null;
  const window = values.slice(index - PERIOD + 1, index + 1);
  const mean = window.reduce((sum, value) => sum + value, 0) / PERIOD;
  const variance = window.reduce((sum, value) => sum + (value - mean) ** 2, 0) / PERIOD;
  const deviation = Math.sqrt(variance);
  return { mean, upper: mean + deviation * 2.5, lower: mean - deviation * 2.5 };
}

export function SignalChartSnapshot({ candles, levels, signalEpoch, direction, timeframe, digits }: Props) {
  const gradientId = `signal-band-fill-${useId().replace(/:/g, '')}`;
  const [focusCount, setFocusCount] = useState<number>(90);
  const visibleCount = focusCount === MAX_HISTORY_CANDLES ? MAX_HISTORY_CANDLES : focusCount;
  const startIndex = Math.max(0, candles.length - visibleCount);
  const data = candles.slice(startIndex);
  const fullCloses = candles.map((item) => item.close);
  const fullStats = candles.map((_, index) => rolling(fullCloses, index));
  const stats = fullStats.slice(startIndex);
  if (data.length < 2) {
    return (
      <div className="rounded-xl border border-line/10 bg-surface/[0.03] px-4 py-6 text-center text-xs text-ink-3">
        Chart snapshot will appear when enough candle data is available.
      </div>
    );
  }

  const closes = data.map((item) => item.close);
  const values = data.flatMap((candle, index) => [
    candle.high, candle.low,
    stats[index]?.upper ?? candle.high,
    stats[index]?.lower ?? candle.low,
  ]);
  values.push(levels.entry, levels.stopLoss, levels.tp3);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, Math.abs(max) * 0.00001, 0.000001);
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (index: number) => PAD.left + (index / Math.max(data.length - 1, 1)) * plotW;
  const y = (price: number) => PAD.top + ((max - price) / range) * plotH;
  const candleSpacing = plotW / Math.max(data.length - 1, 1);
  const bodyW = Math.max(3, Math.min(48, candleSpacing * 0.78));
  const linePath = (key: 'mean' | 'upper' | 'lower') => stats
    .map((item, index) => item ? `${index === 0 || !stats[index - 1] ? 'M' : 'L'} ${x(index)} ${y(item[key])}` : '')
    .filter(Boolean).join(' ');
  const bandPoints: Array<[number, number, number] | null> = stats.map((item, index) => item ? [x(index), y(item.upper), y(item.lower)] : null);
  const upperPath = bandPoints.map((item, index) => item ? `${index === 0 || !bandPoints[index - 1] ? 'M' : 'L'} ${item[0]} ${item[1]}` : '').filter(Boolean).join(' ');
  const lowerPath = bandPoints.slice().reverse().map((item, reverseIndex) => {
    if (!item) return '';
    const index = bandPoints.length - 1 - reverseIndex;
    return `${reverseIndex === 0 || !bandPoints[index + 1] ? 'M' : 'L'} ${item[0]} ${item[2]}`;
  }).filter(Boolean).join(' ');
  const signalIndex = data.findIndex((candle) => candle.epoch === signalEpoch);
  const levelsToDraw = [
    { label: 'ENTRY', value: levels.entry, color: '#64748b', dash: '4 4' },
    { label: 'STOP', value: levels.stopLoss, color: '#ef4444', dash: '5 4' },
    { label: 'TARGET', value: levels.tp3, color: '#16a34a', dash: '5 4' },
  ];

  return (
    <section className="overflow-hidden rounded-xl border border-line/15 bg-[#0b1220] text-white" aria-label={`Chart snapshot for ${timeframe} signal`}>
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${direction === 'BUY' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
          <span className="text-xs font-semibold tracking-wide text-white">{timeframe} MARKET SNAPSHOT</span>
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-slate-300">2.5σ bands</span>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <span className="text-[10px] tabular-nums text-slate-400">{data.length} candles</span>
          <button
            type="button"
            onClick={() => {
              const currentIndex = FOCUS_OPTIONS.indexOf(focusCount as (typeof FOCUS_OPTIONS)[number]);
              setFocusCount(currentIndex > 0 ? FOCUS_OPTIONS[currentIndex - 1] : MAX_HISTORY_CANDLES);
            }}
            className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[10px] font-semibold text-slate-200 transition-colors hover:bg-white/10"
            aria-label="Zoom out one level"
            title="Zoom out one level"
            disabled={focusCount === MAX_HISTORY_CANDLES}
          >
            <ZoomOut className="h-3 w-3" />
          </button>
          <div className="flex items-center gap-1">
            {[...FOCUS_OPTIONS].map((count) => (
              <button
                key={count}
                type="button"
                onClick={() => setFocusCount(count)}
                aria-pressed={focusCount === count}
                className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-colors ${focusCount === count ? 'border-sky-400 bg-sky-400/20 text-sky-200' : 'border-white/15 bg-white/5 text-slate-300 hover:bg-white/10'}`}
                title={`Show latest ${count} candles`}
              >
                {count}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              const currentIndex = FOCUS_OPTIONS.indexOf(focusCount as (typeof FOCUS_OPTIONS)[number]);
              setFocusCount(currentIndex >= 0 && currentIndex < FOCUS_OPTIONS.length - 1 ? FOCUS_OPTIONS[currentIndex + 1] : MAX_HISTORY_CANDLES);
            }}
            className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[10px] font-semibold text-slate-200 transition-colors hover:bg-white/10"
            aria-label="Zoom in one level"
            title="Zoom in one level"
            disabled={focusCount === MAX_HISTORY_CANDLES}
          >
            <ZoomIn className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => setFocusCount(MAX_HISTORY_CANDLES)}
            className={`rounded-md border px-2 py-1 text-[10px] font-semibold ${focusCount === MAX_HISTORY_CANDLES ? 'border-sky-400 bg-sky-400/20 text-sky-200' : 'border-white/15 bg-white/5 text-slate-300 hover:bg-white/10'}`}
            aria-pressed={focusCount === MAX_HISTORY_CANDLES}
            title="Show full chart history"
          >
            All
          </button>
        </div>
      </div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Candlestick chart with moving average, volatility bands, entry, stop-loss and target levels" className="block h-auto w-full">
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.13" />
            <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((step) => {
          const gy = PAD.top + (plotH * step) / 3;
          const price = max - (range * step) / 3;
          return <g key={step}><line x1={PAD.left} x2={WIDTH - PAD.right} y1={gy} y2={gy} stroke="#94a3b8" strokeOpacity="0.13" strokeDasharray="3 5" /><text x={WIDTH - PAD.right - 2} y={gy - 4} fill="#94a3b8" fontSize="10" textAnchor="end">{price.toFixed(digits)}</text></g>;
        })}
        {upperPath && lowerPath && <path d={`${upperPath} ${lowerPath.replace(/^M/, 'L')} Z`} fill={`url(#${gradientId})`} />}
        {upperPath && <path d={upperPath} fill="none" stroke="#f87171" strokeWidth="2" strokeOpacity="0.9" />}
        {lowerPath && <path d={lowerPath} fill="none" stroke="#f87171" strokeWidth="2" strokeOpacity="0.9" />}
        {linePath('mean') && <path d={linePath('mean')} fill="none" stroke="#facc15" strokeWidth="2.5" />}
        {levelsToDraw.map((level) => <g key={level.label}>
          <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(level.value)} y2={y(level.value)} stroke={level.color} strokeWidth="1.4" strokeDasharray={level.dash} />
          <text x={PAD.left + 4} y={Math.max(PAD.top + 10, y(level.value) - 4)} fill={level.color} fontSize="9" fontWeight="700">{level.label} {level.value.toFixed(digits)}</text>
        </g>)}
        {data.map((candle, index) => {
          const up = candle.close >= candle.open;
          const color = up ? '#22c55e' : '#f43f5e';
          const top = y(Math.max(candle.open, candle.close));
          const bottom = y(Math.min(candle.open, candle.close));
          const height = Math.max(1.5, bottom - top);
          return <g key={candle.epoch}>
            <line x1={x(index)} x2={x(index)} y1={y(candle.high)} y2={y(candle.low)} stroke={color} strokeWidth="1.3" />
            <rect x={x(index) - bodyW / 2} y={top} width={bodyW} height={height} rx="0.7" fill={color} stroke={color} strokeWidth="0.7" />
          </g>;
        })}
        {signalIndex >= 0 && <g>
          <line x1={x(signalIndex)} x2={x(signalIndex)} y1={PAD.top} y2={HEIGHT - PAD.bottom} stroke={direction === 'BUY' ? '#34d399' : '#fb7185'} strokeWidth="1.5" strokeDasharray="3 3" />
          <circle cx={x(signalIndex)} cy={y(data[signalIndex].close)} r="5" fill={direction === 'BUY' ? '#34d399' : '#fb7185'} stroke="#0b1220" strokeWidth="2" />
          <text x={Math.min(WIDTH - 65, x(signalIndex) + 7)} y={Math.max(PAD.top + 12, y(data[signalIndex].close) - 9)} fill={direction === 'BUY' ? '#6ee7b7' : '#fda4af'} fontSize="10" fontWeight="700">{direction}</text>
        </g>}
        <text x={PAD.left + 2} y={HEIGHT - 6} fill="#64748b" fontSize="10">SUPERTECH AI · PRICE ACTION</text>
      </svg>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/10 px-3 py-2 text-[10px] text-slate-300">
        <span className="flex items-center gap-1"><i className="h-0.5 w-3 bg-yellow-400" /> Average</span>
        <span className="flex items-center gap-1"><i className="h-0.5 w-3 bg-rose-400" /> Upper/lower bands</span>
        <span className="flex items-center gap-1"><i className="h-0.5 w-3 bg-emerald-400" /> BUY / target</span>
        <span className="flex items-center gap-1"><i className="h-0.5 w-3 bg-rose-500" /> Stop / SELL</span>
      </div>
    </section>
  );
}
