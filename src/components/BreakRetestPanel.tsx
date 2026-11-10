import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Maximize2, RefreshCw, Target, Waves, X } from 'lucide-react';
import type { Asset, TfState } from '@/lib/sma';
import type { Candle } from '@/lib/deriv';
import { buildBreakRetestSetups, type BreakRetestSetup } from '@/lib/breakRetest';
import { formatPrice } from '@/lib/sma';

type Props = {
  assets: Asset[];
  states: Record<string, Record<number, TfState>>;
  prices: Record<string, number>;
  selectedSetupKey?: string;
}

function PriceActionChart({ setup, candles, fullscreen = false, onExpand }: {
  setup: BreakRetestSetup;
  candles: Candle[];
  fullscreen?: boolean;
  onExpand?: () => void;
}) {
  const data = candles.slice(-72);
  if (data.length < 2) return <div className="grid h-56 place-items-center text-sm text-slate-400">Waiting for candle history…</div>;
  const W = 1200;
  const H = fullscreen ? 650 : 340;
  const P = { top: 28, right: 112, bottom: 34, left: 22 };
  const values = data.flatMap(c => [c.high, c.low]).concat([setup.zoneLow, setup.zoneHigh, setup.stopLoss, setup.target, setup.entry]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, Math.abs(max) * 0.00001, 0.000001);
  const x = (i: number) => P.left + i / Math.max(1, data.length - 1) * (W - P.left - P.right);
  const y = (v: number) => P.top + (max - v) / range * (H - P.top - P.bottom);
  const body = Math.max(5, Math.min(18, (W - P.left - P.right) / data.length * 0.62));
  const breakIndex = Math.max(0, data.findIndex(c => c.epoch >= setup.breakEpoch));
  const retestIndex = Math.max(0, data.findIndex(c => c.epoch >= setup.retestEpoch));
  const confirmIndex = Math.max(0, data.findIndex(c => c.epoch >= setup.confirmationEpoch));
  const zoneX = x(breakIndex);
  const zoneY = y(setup.zoneHigh);
  const zoneH = Math.max(3, y(setup.zoneLow) - zoneY);
  const bullish = setup.direction === 'BUY';
  const accent = bullish ? '#34d399' : '#fb7185';
  const grid = Array.from({ length: 6 }, (_, i) => max - range * i / 5);
  const fmt = (n: number) => formatPrice(n, 5);
  return <div className="relative w-full overflow-x-auto bg-[#080e19]">
    {!fullscreen && <button type="button" onClick={onExpand} className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-[#111c2c]/90 px-3 py-2 text-xs font-semibold text-white shadow-lg hover:border-amber-300/60" aria-label="Open chart full screen"><Maximize2 className="h-3.5 w-3.5" /> Full screen</button>}
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Pure price action chart showing ${setup.direction} break and retest, rejection, structure confirmation and 5R risk/reward target`} style={{ width: fullscreen ? '100%' : '100%', minWidth: fullscreen ? '760px' : '560px', height: 'auto', display: 'block' }}>
      <defs>
        <linearGradient id={`zone-${setup.key.replace(/[^a-zA-Z0-9]/g,'')}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={accent} stopOpacity=".25"/><stop offset="100%" stopColor={accent} stopOpacity=".07"/></linearGradient>
      </defs>
      {grid.map((v,i)=><g key={i}><line x1={P.left} x2={W-P.right} y1={y(v)} y2={y(v)} stroke="#94a3b8" strokeOpacity=".13" strokeDasharray="3 8"/><text x={W-P.right+9} y={y(v)+4} fill="#94a3b8" fontSize="13">{fmt(v)}</text></g>)}
      <rect x={zoneX} y={zoneY} width={Math.max(12,W-P.right-zoneX)} height={zoneH} fill={`url(#zone-${setup.key.replace(/[^a-zA-Z0-9]/g,'')})`} stroke={accent} strokeWidth="2" rx="3"/>
      <text x={Math.min(W-P.right-150,zoneX+8)} y={Math.max(P.top+15,zoneY-8)} fill={accent} fontSize="13" fontWeight="800">{bullish ? 'BROKEN RESISTANCE → SUPPORT' : 'BROKEN SUPPORT → RESISTANCE'}</text>
      <line x1={P.left} x2={W-P.right} y1={y(setup.stopLoss)} y2={y(setup.stopLoss)} stroke="#fb7185" strokeWidth="2" strokeDasharray="8 6"/>
      <rect x={W-P.right+4} y={y(setup.stopLoss)-12} width="104" height="24" rx="4" fill="#be123c"/><text x={W-P.right+56} y={y(setup.stopLoss)+4} textAnchor="middle" fill="#fff" fontSize="12" fontWeight="800">STOP {fmt(setup.stopLoss)}</text>
      <line x1={P.left} x2={W-P.right} y1={y(setup.target)} y2={y(setup.target)} stroke="#fbbf24" strokeWidth="2" strokeDasharray="8 6"/>
      <rect x={W-P.right+4} y={y(setup.target)-12} width="104" height="24" rx="4" fill="#b7791f"/><text x={W-P.right+56} y={y(setup.target)+4} textAnchor="middle" fill="#fff" fontSize="12" fontWeight="800">TARGET {fmt(setup.target)}</text>
      {data.map((c,i)=>{const up=c.close>=c.open;const color=up?'#34d399':'#fb7185';const top=y(Math.max(c.open,c.close));const bottom=y(Math.min(c.open,c.close));return <g key={c.epoch}><line x1={x(i)} x2={x(i)} y1={y(c.high)} y2={y(c.low)} stroke={color} strokeWidth="2"/><rect x={x(i)-body/2} y={top} width={body} height={Math.max(2,bottom-top)} rx="1.2" fill={color}/></g>;})}
      {[[breakIndex,'BREAK'],[retestIndex,'RETEST'],[confirmIndex,bullish?'HIGHER HIGH':'LOWER LOW']].map(([idx,label],i)=>{const index=Number(idx);const c=data[index];if(!c)return null;const cy=y(i===2?setup.confirmationPrice:(bullish?c.low:c.high));const above=cy>H*.5;return <g key={String(label)}><line x1={x(index)} x2={x(index)} y1={P.top} y2={H-P.bottom} stroke={i===2?accent:'#e2e8f0'} strokeOpacity=".45" strokeDasharray="4 6"/><circle cx={x(index)} cy={cy} r={6} fill={i===2?accent:'#f8fafc'} stroke="#08111f" strokeWidth="2"/><rect x={Math.max(P.left,Math.min(W-P.right-120,x(index)-55))} y={above?cy-30:cy+12} width={i===2?120:82} height="21" rx="5" fill={i===2?accent:'#334155'}/><text x={Math.max(P.left,Math.min(W-P.right-120,x(index)-55))+(i===2?60:41)} y={(above?cy-30:cy+12)+14} textAnchor="middle" fill={i===2?'#07111d':'#fff'} fontSize="10" fontWeight="800">{String(label)}</text></g>;})}
      <line x1={P.left} x2={W-P.right} y1={y(setup.entry)} y2={y(setup.entry)} stroke="#e2e8f0" strokeWidth="1.5" strokeDasharray="3 5" opacity=".8"/>
      <text x={P.left+6} y={H-10} fill="#64748b" fontSize="11" fontWeight="700">SUPERTECH AI · PURE PRICE ACTION · {setup.timeframe}</text>
    </svg>
  </div>;
}

export function BreakRetestPanel({ assets, states, prices, selectedSetupKey }: Props) {
  const [direction, setDirection] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [expanded, setExpanded] = useState<BreakRetestSetup | null>(null);
  const setups = useMemo(() => buildBreakRetestSetups(assets, states), [assets, states]);
  const visible = setups.filter(item => direction === 'ALL' || item.direction === direction);
  useEffect(() => {
    if (!selectedSetupKey) return;
    const match = setups.find(item => item.key === selectedSetupKey);
    if (match) setExpanded(match);
  }, [selectedSetupKey, setups]);
  const timeframes = new Set(Object.values(states).flatMap(byTf => Object.values(byTf).filter(s => s.candles.length > 0).map(s => s.granularity))).size;
  const assetCount = new Set(Object.keys(states)).size;
  const candlesFor = (item: BreakRetestSetup) => states[item.symbol]?.[item.granularity]?.candles ?? [];
  return <section id="break-retest-panel" className="mt-8 space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Pure price action scanner</p><h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Break &amp; Retest Setups</h2><p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-2">Clean candlestick charts only. No moving averages, Bollinger Bands, oscillators or indicator overlays. Every call requires a break, retest, rejection and fresh structure confirmation.</p></div>
      <div className="flex items-center gap-2 rounded-xl border border-line/10 bg-surface/[0.04] px-3 py-2 text-xs text-ink-2"><RefreshCw className="h-3.5 w-3.5 text-accent"/> Live scan · all loaded markets</div>
    </div>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-line/10 bg-surface/[0.04] p-4"><p className="text-xs text-ink-2">Markets scanned</p><p className="mt-1 text-2xl font-semibold text-ink">{assetCount}</p></div>
      <div className="rounded-xl border border-line/10 bg-surface/[0.04] p-4"><p className="text-xs text-ink-2">Timeframes active</p><p className="mt-1 text-2xl font-semibold text-ink">{timeframes}/8</p></div>
      <div className="col-span-2 rounded-xl border border-line/10 bg-surface/[0.04] p-4 sm:col-span-1"><p className="text-xs text-ink-2">Confirmed setups</p><p className="mt-1 text-2xl font-semibold text-ink">{setups.length}</p></div>
    </div>
    <div className="flex flex-wrap gap-2">{(['ALL','BUY','SELL'] as const).map(value=><button key={value} onClick={()=>setDirection(value)} className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${direction===value?'border-accent/50 bg-accent/10 text-ink':'border-line/10 text-ink-2 hover:text-ink'}`}>{value==='ALL'?'All setups':value}</button>)}</div>
    {visible.length===0?<div className="rounded-2xl border border-dashed border-line/20 bg-surface/[0.025] px-5 py-12 text-center"><Waves className="mx-auto h-8 w-8 text-ink-2"/><h3 className="mt-3 font-semibold text-ink">No confirmed setups yet</h3><p className="mx-auto mt-2 max-w-md text-sm text-ink-2">The scanner keeps watching the available assets and timeframes. A zone touch alone will never trigger a trade call.</p></div>:<div className="grid gap-5 xl:grid-cols-2">
      {visible.map(item=>{const price=prices[item.symbol]??item.entry;const Icon=item.direction==='BUY'?ArrowUpRight:ArrowDownRight;return <article key={item.key} className="min-w-0 overflow-hidden rounded-2xl border border-line/15 bg-surface/[0.045] shadow-sm">
        <div className="flex items-start justify-between gap-3 p-4"><div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-md px-2 py-1 text-xs font-bold ${item.direction==='BUY'?'bg-emerald-500/10 text-emerald-500':'bg-rose-500/10 text-rose-500'}`}><Icon className="mr-1 inline h-3.5 w-3.5"/>{item.direction} MARKET</span><span className="text-xs text-ink-2">{item.exchange} · {item.timeframe}</span></div><h3 className="mt-2 text-lg font-semibold text-ink">{item.assetName}</h3><p className="text-xs text-ink-2">{item.symbol}</p></div><span className="rounded-full border border-emerald-500/20 px-2.5 py-1 text-[11px] font-semibold text-emerald-500">CONFIRMED</span></div>
        <PriceActionChart setup={item} candles={candlesFor(item)} onExpand={()=>setExpanded(item)}/>
        <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4"><div className="rounded-lg bg-surface/[0.06] p-3"><p className="text-[11px] text-ink-2">Market</p><p className="mt-1 text-sm font-semibold tabular-nums text-ink">{formatPrice(price,5)}</p></div><div className="rounded-lg bg-surface/[0.06] p-3"><p className="text-[11px] text-ink-2">Retest zone</p><p className="mt-1 text-sm font-semibold tabular-nums text-ink">{formatPrice(item.zoneLow,5)}–{formatPrice(item.zoneHigh,5)}</p></div><div className="rounded-lg bg-surface/[0.06] p-3"><p className="text-[11px] text-ink-2">Stop loss · outside zone</p><p className="mt-1 text-sm font-semibold tabular-nums text-rose-500">{formatPrice(item.stopLoss,5)}</p></div><div className="rounded-lg bg-surface/[0.06] p-3"><p className="text-[11px] text-ink-2"><Target className="mr-1 inline h-3 w-3"/>Target · 5R</p><p className="mt-1 text-sm font-semibold tabular-nums text-emerald-500">{formatPrice(item.target,5)}</p></div></div>
        <p className="px-4 pb-4 text-xs text-ink-2">Break → retest → rejection → {item.direction==='BUY'?'higher high':'lower low'}. Market entry after confirmation.</p>
      </article>;})}
    </div>}
    {expanded&&<div className="fixed inset-0 z-[100] flex flex-col bg-[#050a12] text-white" role="dialog" aria-modal="true" aria-label={`Full-screen ${expanded.assetName} price action chart`}>
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-6"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">Break &amp; Retest · Pure Price Action</p><h2 className="truncate text-lg font-bold">{expanded.assetName} <span className="text-sm font-medium text-slate-400">· {expanded.timeframe} · {expanded.direction}</span></h2></div><button type="button" onClick={()=>setExpanded(null)} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/5 hover:bg-white/10" aria-label="Close full-screen chart"><X className="h-5 w-5"/></button></div>
      <div className="flex-1 overflow-auto p-2 sm:p-5"><div className="mx-auto max-w-[1800px]"><PriceActionChart setup={expanded} candles={candlesFor(expanded)} fullscreen/><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-xl border border-white/10 bg-white/[0.04] p-3"><p className="text-xs text-slate-400">Entry / current</p><p className="mt-1 font-semibold tabular-nums">{formatPrice(prices[expanded.symbol]??expanded.entry,5)}</p></div><div className="rounded-xl border border-white/10 bg-white/[0.04] p-3"><p className="text-xs text-slate-400">Retest zone</p><p className="mt-1 font-semibold tabular-nums">{formatPrice(expanded.zoneLow,5)} – {formatPrice(expanded.zoneHigh,5)}</p></div><div className="rounded-xl border border-white/10 bg-white/[0.04] p-3"><p className="text-xs text-slate-400">Stop loss · outside zone</p><p className="mt-1 font-semibold tabular-nums text-rose-300">{formatPrice(expanded.stopLoss,5)}</p></div><div className="rounded-xl border border-white/10 bg-white/[0.04] p-3"><p className="text-xs text-slate-400">Target · 5R</p><p className="mt-1 font-semibold tabular-nums text-emerald-300">{formatPrice(expanded.target,5)}</p></div><div className="rounded-xl border border-white/10 bg-white/[0.04] p-3"><p className="text-xs text-slate-400">Confirmation</p><p className="mt-1 font-semibold">{expanded.direction==='BUY'?'Higher high':'Lower low'}</p></div></div></div></div>
    </div>}
  </section>;
}
