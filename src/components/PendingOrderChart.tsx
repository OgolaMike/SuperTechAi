import { useMemo, useState } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import type { Candle } from '@/lib/deriv';
import { formatPrice } from '@/lib/sma';

type Props = {
  candles: Candle[]; entry: number; stopLoss: number; takeProfit: number;
  currentPrice: number; digits: number; direction: 'BUY' | 'SELL'; symbol: string;
  zone: { startEpoch: number; endEpoch: number; low: number; high: number };
  patternType: 'TRIPLE BOTTOM' | 'TRIPLE TOP'; granularity?: number;
};
const HEIGHT = 280;
const PAD = { top: 18, right: 104, bottom: 22, left: 12 };
const RIGHT_CANDLE_SPACE = 6;

export function PendingOrderChart({ candles, entry, stopLoss, takeProfit, currentPrice, digits, direction, symbol, zone, patternType, granularity = 900 }: Props) {
  const [visibleCount, setVisibleCount] = useState(60);
  const [spacing, setSpacing] = useState(12);
  const [scrollPosition, setScrollPosition] = useState(100);
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
  const plotW = Math.max(600, data.length * spacing);
  const width = PAD.left + plotW + PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const slots = Math.max(data.length - 1, 1) + RIGHT_CANDLE_SPACE;
  const x = (i: number) => PAD.left + i / slots * plotW;
  const y = (price: number) => PAD.top + (max - price) / range * plotH;
  const bodyW = Math.max(2, Math.min(plotW / slots * 0.72, 18));
  const zoneIndex = data.findIndex(c => c.epoch >= zone.startEpoch);
  const zoneX = zone.startEpoch <= data[0].epoch ? PAD.left : zoneIndex >= 0 ? x(zoneIndex) : x(data.length - 1);
  const zoneY = y(zone.high);
  const zoneH = Math.max(3, y(zone.low) - zoneY);
  const zoneColor = direction === 'BUY' ? '#22c55e' : '#f43f5e';
  const lines = [
    { label: 'ENTRY', value: entry, color: '#60a5fa' },
    { label: 'STOP LOSS', value: stopLoss, color: '#fb7185' },
    { label: 'TAKE PROFIT · 3R', value: takeProfit, color: '#4ade80' },
    { label: 'MARKET', value: currentPrice, color: '#facc15' },
  ];
  return (
    <section className="min-w-0 max-w-full overflow-hidden rounded-xl border border-line/15 bg-[#0b1220] text-white" aria-label={`Price-action ${patternType} chart for ${symbol}`}>
      <div className="flex flex-col gap-3 border-b border-white/10 px-3 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${direction === 'BUY' ? 'bg-emerald-400' : 'bg-rose-400'}`} /><span className="text-xs font-semibold tracking-wide">PRICE ACTION · {symbol}</span><span className={`rounded px-2 py-1 text-[10px] font-bold ${direction === 'BUY' ? 'bg-emerald-400/15 text-emerald-300' : 'bg-rose-400/15 text-rose-300'}`}>{patternType}</span></div>
          <span className="text-[10px] tabular-nums text-slate-400">{data.length} candles · {history.length} loaded</span>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={() => setVisibleCount(v => Math.min(120, v + 10))} disabled={visibleCount >= 120} aria-label="Zoom out chart" className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/15 bg-white/5 disabled:opacity-35"><ZoomOut className="h-3.5 w-3.5" /></button>
          <span className="min-w-16 text-center text-[10px] tabular-nums text-slate-300">{visibleCount} candles</span>
          <button type="button" onClick={() => setVisibleCount(v => Math.max(15, v - 10))} disabled={visibleCount <= 15} aria-label="Zoom in chart" className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/15 bg-white/5 disabled:opacity-35"><ZoomIn className="h-3.5 w-3.5" /></button>
        </div>
        <label className="flex items-center gap-3 text-[10px] text-slate-400"><span className="w-20 shrink-0">Candle spacing</span><input aria-label="Candle spacing" type="range" min="6" max="24" value={spacing} onChange={e => setSpacing(Number(e.target.value))} className="min-w-0 flex-1 accent-sky-400" /><span className="w-8 text-right tabular-nums">{spacing}px</span></label>
      </div>
      <div className="w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain touch-auto">
        <svg viewBox={`0 0 ${width} ${HEIGHT}`} role="img" aria-label="Candlestick chart with price-action zone, entry, stop-loss and three-R take-profit levels" style={{ width: `${width}px`, maxWidth: 'none', height: 'auto' }} className="block">
          {[0,1,2,3].map(step => { const gy = PAD.top + plotH * step / 3; const price = max - range * step / 3; return <g key={step}><line x1={PAD.left} x2={width-PAD.right} y1={gy} y2={gy} stroke="#94a3b8" strokeOpacity=".16" strokeDasharray="3 5" /><text x={width-PAD.right+7} y={gy+3} fill="#94a3b8" fontSize="10">{formatPrice(price,digits)}</text></g>; })}
          <rect x={zoneX} y={zoneY} width={Math.max(bodyW*2,width-PAD.right-zoneX)} height={zoneH} fill={zoneColor} fillOpacity=".14" stroke={zoneColor} strokeWidth="2.5" rx="3" />
          <text x={zoneX+7} y={Math.max(PAD.top+12,zoneY-6)} fill={zoneColor} fontSize="10" fontWeight="800">{direction} THIRD-TEST ZONE</text>
          {lines.map(line => <g key={line.label}><line x1={PAD.left} x2={width-PAD.right} y1={y(line.value)} y2={y(line.value)} stroke={line.color} strokeWidth={line.label === 'MARKET' ? 1.8 : 1.4} /><text x={PAD.left+4} y={Math.max(PAD.top+10,y(line.value)-4)} fill={line.color} fontSize="9" fontWeight="700">{line.label}</text></g>)}
          {data.map((c,i) => { const up=c.close>=c.open, color=up?'#22c55e':'#f43f5e', top=y(Math.max(c.open,c.close)), bottom=y(Math.min(c.open,c.close)); return <g key={c.epoch}><line x1={x(i)} x2={x(i)} y1={y(c.high)} y2={y(c.low)} stroke={color} strokeWidth="1.2" /><rect x={x(i)-bodyW/2} y={top} width={bodyW} height={Math.max(1.5,bottom-top)} rx=".6" fill={color} /></g>; })}
          <text x={PAD.left+2} y={HEIGHT-4} fill="#64748b" fontSize="9">SUPERTECH AI · PURE PRICE ACTION</text>
        </svg>
      </div>
      <div className="border-t border-white/10 px-3 py-3"><label className="flex items-center gap-3 text-[10px] text-slate-400"><span className="w-20 shrink-0">History slider</span><input aria-label="Scroll chart history" type="range" min="0" max="100" value={scrollPosition} onChange={e => setScrollPosition(Number(e.target.value))} className="min-w-0 flex-1 accent-sky-400" /><span className="w-14 text-right">{scrollPosition===100?'Latest':'History'}</span></label></div>
      <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-2 border-t border-white/10 px-3 py-2 text-[10px] text-slate-300">{lines.map(line=><span key={line.label}>{line.label}: {formatPrice(line.value,digits)}</span>)}</div>
    </section>
  );
}
