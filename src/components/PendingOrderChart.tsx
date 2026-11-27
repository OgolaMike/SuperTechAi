import { useEffect, useMemo, useRef, useState } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import type { Candle } from '@/lib/deriv';
import { formatPrice } from '@/lib/sma';

type Props = {
  candles: Candle[]; entry: number; stopLoss: number; takeProfit: number;
  currentPrice: number; digits: number; direction: 'BUY' | 'SELL'; symbol: string;
  zone: { startEpoch: number; endEpoch: number; low: number; high: number };
  patternType: 'TRIPLE BOTTOM' | 'TRIPLE TOP'; granularity?: number;
};
const HEIGHT = 300;
const PAD = { top: 24, right: 92, bottom: 28, left: 10 };
const RIGHT_CANDLE_SPACE = 2;

export function PendingOrderChart({ candles, entry, stopLoss, takeProfit, currentPrice, digits, direction, symbol, zone, patternType, granularity = 900 }: Props) {
  const [visibleCount, setVisibleCount] = useState(42);
  const [spacing, setSpacing] = useState(12);
  const [scrollPosition, setScrollPosition] = useState(100);
  const [containerWidth, setContainerWidth] = useState(680);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(entries => {
      const nextWidth = Math.floor(entries[0]?.contentRect.width ?? 680);
      if (nextWidth > 0) setContainerWidth(nextWidth);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const history = useMemo(() => {
    const base = candles.slice(-240);
    if (!base.length || !Number.isFinite(currentPrice) || currentPrice <= 0) return base;
    const liveEpoch = Math.floor(Date.now() / granularity) * granularity;
    const last = base[base.length - 1];
    if (last.epoch === liveEpoch) return [...base.slice(0, -1), { ...last, high: Math.max(last.high, currentPrice), low: Math.min(last.low, currentPrice), close: currentPrice }];
    if (last.epoch < liveEpoch) return [...base, { epoch: liveEpoch, open: last.close, high: Math.max(last.close, currentPrice), low: Math.min(last.close, currentPrice), close: currentPrice }].slice(-240);
    return base;
  }, [candles, currentPrice, granularity]);

  if (history.length < 2) return <div className="rounded-xl border border-line/10 bg-surface/[0.03] px-4 py-6 text-center text-xs text-ink-3">Chart snapshot will appear when candle history is available.</div>;

  const count = Math.min(visibleCount, history.length);
  const maxStart = Math.max(0, history.length - count);
  const start = Math.round(scrollPosition / 100 * maxStart);
  const data = history.slice(start, start + count);
  const values = data.flatMap(c => [c.high, c.low]).concat([entry, stopLoss, takeProfit, currentPrice, zone.low, zone.high]);
  const min = Math.min(...values), max = Math.max(...values);
  const range = Math.max(max - min, Math.abs(max) * 0.00001, 0.000001);
  const width = Math.max(320, containerWidth);
  const plotW = Math.max(150, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const slots = Math.max(data.length - 1, 1) + RIGHT_CANDLE_SPACE;
  const x = (i: number) => PAD.left + i / slots * plotW;
  const y = (price: number) => PAD.top + (max - price) / range * plotH;
  const bodyW = Math.max(2, Math.min(spacing, plotW / slots * 0.78, 12));
  const zoneIndex = data.findIndex(c => c.epoch >= zone.startEpoch);
  const zoneX = zone.startEpoch <= data[0].epoch ? PAD.left : zoneIndex >= 0 ? x(zoneIndex) : x(data.length - 1);
  const zoneY = y(zone.high);
  const zoneH = Math.max(3, y(zone.low) - zoneY);
  const zoneColor = direction === 'BUY' ? '#22c55e' : '#f43f5e';
  const lines = [
    { label: 'ENTRY', value: entry, color: '#60a5fa' },
    { label: 'STOP LOSS', value: stopLoss, color: '#fb7185' },
    { label: 'TAKE PROFIT', value: takeProfit, color: '#4ade80' },
    { label: 'MARKET', value: currentPrice, color: '#facc15' },
  ];
  const timeframe = granularity >= 86400 ? `D${Math.round(granularity / 86400)}` : granularity >= 3600 ? `H${Math.round(granularity / 3600)}` : `M${Math.round(granularity / 60)}`;

  return (
    <section className="min-w-0 w-full overflow-hidden rounded-xl border border-sky-400/15 bg-[#08111f] text-white shadow-[0_12px_32px_rgba(0,0,0,0.18)]" aria-label={`Price-action ${patternType} chart for ${symbol}`}>
      <div className="space-y-3 border-b border-white/10 px-3 py-3">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-bold tracking-wide text-slate-100">{symbol} <span className="text-slate-500">·</span> {timeframe}</p>
            <p className="mt-0.5 text-[10px] text-slate-400">PENDING ORDER CHART · PURE PRICE ACTION</p>
          </div>
          <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold ${direction === 'BUY' ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' : 'border-rose-400/30 bg-rose-400/10 text-rose-300'}`}>{patternType}</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[10px] tabular-nums text-slate-400">{data.length} candles shown <span className="text-slate-600">/</span> {history.length} loaded</span>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => setVisibleCount(v => Math.min(120, v + 10))} disabled={visibleCount >= 120} aria-label="Zoom out chart" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-200 transition hover:bg-white/10 disabled:opacity-35"><ZoomOut className="h-4 w-4" /></button>
            <span className="min-w-[4.5rem] text-center text-[10px] text-slate-300">Zoom</span>
            <button type="button" onClick={() => setVisibleCount(v => Math.max(15, v - 10))} disabled={visibleCount <= 15} aria-label="Zoom in chart" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-200 transition hover:bg-white/10 disabled:opacity-35"><ZoomIn className="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      <div ref={containerRef} className="w-full min-w-0 px-1">
        <svg viewBox={`0 0 ${width} ${HEIGHT}`} role="img" aria-label="Responsive candlestick chart showing entry, stop-loss, take-profit, market price and pattern zone" preserveAspectRatio="none" style={{ width: '100%', height: 'auto', aspectRatio: `${width} / ${HEIGHT}` }} className="block">
          {[0,1,2,3,4].map(step => {
            const gy = PAD.top + plotH * step / 4;
            const price = max - range * step / 4;
            return <g key={step}><line x1={PAD.left} x2={width-PAD.right} y1={gy} y2={gy} stroke="#94a3b8" strokeOpacity=".14" strokeDasharray="3 5" /><text x={width-PAD.right+7} y={gy+3} fill="#94a3b8" fontSize="9">{formatPrice(price,digits)}</text></g>;
          })}
          {[0,1,2,3,4,5].map(step => { const gx = PAD.left + plotW * step / 5; return <line key={step} x1={gx} x2={gx} y1={PAD.top} y2={HEIGHT-PAD.bottom} stroke="#94a3b8" strokeOpacity=".07" />; })}
          <rect x={zoneX} y={zoneY} width={Math.max(bodyW*2,width-PAD.right-zoneX)} height={zoneH} fill={zoneColor} fillOpacity=".10" stroke={zoneColor} strokeOpacity=".75" strokeDasharray="4 4" rx="3" />
          <text x={Math.min(zoneX+6,width-PAD.right-8)} y={Math.max(PAD.top+12,zoneY-5)} fill={zoneColor} fontSize="9" fontWeight="800">{direction} TEST ZONE</text>
          {data.map((c,i) => {
            const up=c.close>=c.open, color=up?'#22c55e':'#fb7185';
            const top=y(Math.max(c.open,c.close)), bottom=y(Math.min(c.open,c.close));
            return <g key={c.epoch}><line x1={x(i)} x2={x(i)} y1={y(c.high)} y2={y(c.low)} stroke={color} strokeWidth="1.2" /><rect x={x(i)-bodyW/2} y={top} width={bodyW} height={Math.max(1.5,bottom-top)} rx="1" fill={color} /></g>;
          })}
          {lines.map(line => <g key={line.label}>
            <line x1={PAD.left} x2={width-PAD.right} y1={y(line.value)} y2={y(line.value)} stroke={line.color} strokeWidth={line.label === 'MARKET' ? 1.8 : 1.35} strokeDasharray={line.label === 'MARKET' ? '2 3' : '6 4'} />
            <rect x={width-PAD.right+3} y={Math.max(PAD.top,Math.min(HEIGHT-PAD.bottom-17,y(line.value)-8))} width={PAD.right-8} height="16" rx="4" fill={line.color} />
            <text x={width-PAD.right/2+1} y={Math.max(PAD.top+11,Math.min(HEIGHT-PAD.bottom-5,y(line.value)+3))} fill="#07111e" fontSize="8" fontWeight="800" textAnchor="middle">{formatPrice(line.value,digits)}</text>
          </g>)}
          <text x={PAD.left+2} y={HEIGHT-7} fill="#64748b" fontSize="9">OLDER</text>
          <text x={width-PAD.right-3} y={HEIGHT-7} fill="#94a3b8" fontSize="9" textAnchor="end">LATEST</text>
        </svg>
      </div>

      <div className="space-y-3 border-t border-white/10 px-3 py-3">
        <label className="flex min-w-0 items-center gap-3 text-[10px] text-slate-400"><span className="w-16 shrink-0">Spacing</span><input aria-label="Candle spacing" type="range" min="6" max="20" value={spacing} onChange={e => setSpacing(Number(e.target.value))} className="min-w-0 flex-1 accent-sky-400" /><span className="w-8 text-right tabular-nums">{spacing}px</span></label>
        <label className="flex min-w-0 items-center gap-3 text-[10px] text-slate-400"><span className="w-16 shrink-0">History</span><input aria-label="Scroll chart history" type="range" min="0" max="100" value={scrollPosition} onChange={e => setScrollPosition(Number(e.target.value))} className="min-w-0 flex-1 accent-sky-400" /><span className="w-12 text-right">{scrollPosition===100?'Latest':'Earlier'}</span></label>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[10px]">
          {lines.map(line=><div key={line.label} className="flex min-w-0 items-center justify-between gap-2"><span className="flex min-w-0 items-center gap-1.5 text-slate-400"><i className="h-1.5 w-1.5 shrink-0 rounded-full" style={{backgroundColor:line.color}} />{line.label}</span><span className="truncate font-mono tabular-nums text-slate-200">{formatPrice(line.value,digits)}</span></div>)}
        </div>
      </div>
    </section>
  );
}
