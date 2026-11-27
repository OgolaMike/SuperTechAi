import { useState } from 'react';
import type { SignalLearningModel } from '@/lib/aiLearning';
import { ArrowDownRight, ArrowUpRight, BellRing, BarChart3, BrainCircuit, CircleDot, Compass, Wallet, VolumeX } from 'lucide-react';
import { SignalCard } from '@/components/SignalCard';
import type { TimeframeStates } from '@/hooks/useDerivSignals';
import { TIMEFRAMES, emptyTfState, type Asset } from '@/lib/sma';
import type { View } from '@/components/ViewNav';
import type { SuperSignal } from '@/lib/intelligence';
import { buildBreakRetestSetups, type BreakRetestSetup } from '@/lib/breakRetest';

type Props = {
  selectedSymbols: string[];
  assetMap: Map<string, Asset>;
  states: Record<string, TimeframeStates>;
  prices: Record<string, number>;
  loaded: boolean;
  soundsEnabled: boolean;
  aiModel?: SignalLearningModel;
  unifiedSignals: SuperSignal[];
  onNavigate: (view: View) => void;
};

export function DashboardView({ selectedSymbols, assetMap, states, prices, loaded, soundsEnabled, unifiedSignals, onNavigate }: Props) {
  const [selectedTimeframe, setSelectedTimeframe] = useState('H4');
  const [showAllTimeframes, setShowAllTimeframes] = useState(false);
  const unifiedSignal = unifiedSignals.find((signal) => signal.symbol === selectedSymbols[0]) ?? null;
  const totalSignals = unifiedSignal ? 1 : 0;

  const shortcuts: { label: string; detail: string; view: View; icon: typeof Compass }[] = [
    { label: 'AI Asset Analysis', detail: 'Get a complete trading decision', view: 'analysis', icon: BrainCircuit },
    { label: 'All signals', detail: 'Explore every timeframe', view: 'records', icon: BarChart3 },
    { label: 'Crypto markets', detail: 'Movers and opportunities', view: 'crypto', icon: Compass },
    { label: 'Trading accounts', detail: 'Connect or manage trading', view: 'binance', icon: CircleDot },
    { label: 'My account', detail: 'Referrals and earnings', view: 'referrals', icon: Wallet },
  ];

  return (
    <>
      <style>{`@keyframes timeframe-slide-in { from { opacity: 0; transform: translateX(18px); filter: blur(3px); } to { opacity: 1; transform: translateX(0); filter: blur(0); } }`}</style>
      <section className="mt-7 overflow-hidden rounded-3xl border border-line/15 bg-gradient-to-br from-accent/[0.13] via-surface/[0.055] to-surface/[0.015] p-5 shadow-lg sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-accent">YOUR MARKET OVERVIEW</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">See the market. Find your moment.</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-2">Your signals, market activity and trading tools — together in one place.</p>
          </div>
          <div className="flex items-center gap-2 self-start rounded-full border border-line/15 bg-canvas/50 px-3 py-2 text-xs text-ink-2 sm:self-auto">
            {soundsEnabled ? <BellRing className="h-4 w-4 text-accent" /> : <VolumeX className="h-4 w-4" />}
            {soundsEnabled ? 'Signal alerts on' : 'Signal alerts off'}
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-line/10 bg-canvas/55 p-4">
            <p className="text-xs text-ink-3">Active dashboard asset</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-ink">{selectedSymbols.length}</p>
          </div>
          <div className="rounded-2xl border border-line/10 bg-canvas/55 p-4">
            <p className="text-xs text-ink-3">Unified decisions</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-ink">{totalSignals}</p>
          </div>
          <div className="rounded-2xl border border-line/10 bg-canvas/55 p-4">
            <p className="flex items-center gap-1 text-xs text-ink-3"><ArrowUpRight className="h-3.5 w-3.5 text-emerald-500" /> BUY aligned</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-500">{unifiedSignal?.direction === 'BUY' ? 1 : 0}</p>
          </div>
          <div className="rounded-2xl border border-line/10 bg-canvas/55 p-4">
            <p className="flex items-center gap-1 text-xs text-ink-3"><ArrowDownRight className="h-3.5 w-3.5 text-rose-500" /> SELL aligned</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-rose-500">{unifiedSignal?.direction === 'SELL' ? 1 : 0}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-3">
          <span>{loaded ? 'Market feed connected · Signal data updating' : 'Connecting to market feed…'}</span>
        </div>
      </section>

      <section className="mt-7">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">QUICK ACCESS</p>
            <h3 className="mt-1 text-lg font-semibold tracking-tight text-ink">Everything you need</h3>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {shortcuts.map(({ label, detail, view, icon: Icon }) => (
            <button key={view} type="button" onClick={() => onNavigate(view)} className="group flex min-h-[112px] flex-col justify-between rounded-2xl border border-line/15 bg-surface/[0.045] p-4 text-left transition-all hover:-translate-y-0.5 hover:border-accent/35 hover:bg-surface/[0.08]">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent"><Icon className="h-[18px] w-[18px]" /></span>
              <span className="mt-3 block text-sm font-semibold text-ink">{label}</span>
              <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-3">{detail}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">MARKET INTELLIGENCE</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-ink">One Intelligence. Every Timeframe.</h2>
          <p className="mt-1 max-w-2xl text-sm font-medium tracking-wide text-ink-2">SEE THE SIGNAL. OWN THE MOMENT.</p>
        </div>
      </div>

      {unifiedSignal ? <section className="hud-panel mt-6 rounded-2xl border-2 border-accent/40 bg-accent/[0.06] p-5" aria-live="polite"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-accent">Unified dual-engine decision · Super 13 intelligence</p><h3 className={`mt-1 text-2xl font-black ${unifiedSignal.direction === 'BUY' ? 'text-up' : 'text-down'}`}>{unifiedSignal.direction} · {unifiedSignal.name}</h3><p className="mt-1 text-sm text-ink-2">{unifiedSignal.gradePercent}% alignment · {unifiedSignal.agreeing}/13 timeframes aligned</p></div><span className="rounded-full border border-accent/30 px-3 py-1.5 text-xs font-bold text-accent">ONE ACTIVE DECISION</span></div><p className="mt-3 text-sm leading-relaxed text-ink-2">{unifiedSignal.explanation}</p><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"><Metric label="Entry" value={unifiedSignal.levels.entry.toFixed(unifiedSignal.digits)} /><Metric label="Stop-loss" value={unifiedSignal.levels.stopLoss.toFixed(unifiedSignal.digits)} /><Metric label="Target 1" value={unifiedSignal.levels.tp1.toFixed(unifiedSignal.digits)} /><Metric label="Target 3" value={unifiedSignal.levels.tp3.toFixed(unifiedSignal.digits)} /></div><button type="button" onClick={() => onNavigate('super')} className="mt-4 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-canvas">View full unified signal</button></section> : <section className="mt-6 rounded-2xl border border-dashed border-line/20 bg-surface/[0.025] p-5"><p className="text-xs font-bold uppercase tracking-wider text-accent">Unified decision</p><p className="mt-1 text-sm text-ink-2">Waiting for all 13 timeframes to validate one direction. Each timeframe keeps its own entry, stop-loss and three targets below. H4 supplies the primary unified trade levels; the other timeframe levels remain separate context, never averaged together.</p></section>}
      {selectedSymbols.map((symbol) => {
        const asset = assetMap.get(symbol) ?? { symbol, name: symbol, fullName: symbol, digits: 4 };
        const assetStates = states[symbol] ?? {};
        const selectedDefinition = TIMEFRAMES.find((item) => item.label === selectedTimeframe) ?? TIMEFRAMES.find((item) => item.label === 'H4') ?? TIMEFRAMES[0];
        const selectedState = assetStates[selectedDefinition.granularity] ?? emptyTfState(selectedDefinition);
        const otherTimeframes = TIMEFRAMES.filter((item) => item.label !== selectedDefinition.label);
        const latestBreakRetest = buildBreakRetestSetups([asset], { [symbol]: assetStates })[0] ?? null;
        return (
          <section id={`asset-dashboard-${encodeURIComponent(symbol)}`} key={symbol} className="mt-7">
            <div className="mb-3 flex items-center gap-3">
              <div className="h-px flex-1 bg-line/10" />
              <h3 className="text-xs font-semibold uppercase tracking-[.16em] text-ink-2">{asset.fullName}</h3>
              <div className="h-px flex-1 bg-line/10" />
            </div>
            <div className="hud-panel rounded-2xl border border-accent/25 bg-gradient-to-br from-accent/[0.10] via-surface/[0.05] to-surface/[0.02] p-4 shadow-[0_12px_40px_rgba(0,0,0,0.16)] sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><p className="text-xs font-bold uppercase tracking-[.16em] text-accent">Select timeframe</p><p className="mt-1 text-xs text-ink-3">Choose one view. Every timeframe keeps its own signal levels.</p></div>
                <span className="rounded-full border border-accent/25 px-3 py-1 text-[10px] font-semibold text-accent">13 timeframes monitored</span>
              </div>
              <div className="mt-4 overflow-hidden rounded-xl border border-[#293244] bg-[#111722] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_8px_24px_rgba(0,0,0,0.18)]"><div className="mb-2 flex items-center justify-between gap-2 px-1"><span className="text-[10px] font-bold uppercase tracking-[.18em] text-slate-400">Chart interval</span><span className="rounded-md border border-amber-300/30 bg-amber-300/10 px-2 py-1 text-[10px] font-bold text-amber-200">{selectedTimeframe} selected</span></div><div className="flex snap-x gap-1 overflow-x-auto pb-1 [scrollbar-width:thin]" role="group" aria-label={`Select ${asset.fullName} timeframe`}>
                {TIMEFRAMES.map((timeframe) => (
                  <button key={timeframe.granularity} type="button" onClick={() => setSelectedTimeframe(timeframe.label)} aria-pressed={selectedTimeframe === timeframe.label}
                    className={`magic-selector min-w-10 shrink-0 snap-start rounded-lg border px-3 py-2 text-xs font-bold tracking-wide transition-all duration-300 ease-out hover:-translate-y-0.5 active:scale-95 ${selectedTimeframe === timeframe.label ? 'border-amber-300/70 bg-gradient-to-b from-amber-300 to-yellow-500 text-[#111827] shadow-[0_0_16px_rgba(245,190,65,0.25)]' : 'border-transparent bg-transparent text-slate-300 hover:border-slate-500/60 hover:bg-white/[0.06] hover:text-white'}`}>{timeframe.label}</button>
                ))}
              </div></div>
            </div>
            <div key={`${symbol}-${selectedTimeframe}`} className="mt-4 hud-panel animate-[timeframe-slide-in_420ms_cubic-bezier(0.2,0.8,0.2,1)] rounded-2xl"><SignalCard asset={asset} tf={selectedState} loaded={loaded} price={prices[symbol]} unifiedOnly /></div>
            {latestBreakRetest && <BreakRetestLevelStrip setup={latestBreakRetest} digits={asset.digits} />}
            <div className="magic-card mt-4 overflow-hidden rounded-2xl border border-line/15 bg-surface/[0.025]">
              <button type="button" onClick={() => setShowAllTimeframes((value) => !value)} aria-expanded={showAllTimeframes}
                className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-surface/[0.04]">
                <span><span className="block text-sm font-semibold text-ink">All timeframe insights</span><span className="mt-1 block text-xs text-ink-3">See the other {otherTimeframes.length} readings, direction and their individual trade levels.</span></span>
                <span className="shrink-0 rounded-lg border border-accent/25 px-3 py-2 text-xs font-semibold text-accent">{showAllTimeframes ? 'Hide details' : 'View insights'}</span>
              </button>
              {showAllTimeframes && <div className="grid gap-3 border-t border-line/10 p-3 sm:grid-cols-2 lg:grid-cols-3">
                {otherTimeframes.map((timeframe) => {
                  const tf = assetStates[timeframe.granularity] ?? emptyTfState(timeframe);
                  const signal = tf.latestSignal;
                  const buy = signal?.direction === 'BUY';
                  return <button key={timeframe.granularity} type="button" onClick={() => { setSelectedTimeframe(timeframe.label); setShowAllTimeframes(false); }}
                    className="hud-panel min-w-0 rounded-xl border border-line/15 bg-canvas/35 p-3 text-left transition-colors hover:border-accent/35">
                    <div className="flex items-center justify-between gap-2"><span className="text-sm font-bold text-ink">{timeframe.label}</span><span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${signal ? (buy ? 'border-up/30 bg-up/10 text-up' : 'border-down/30 bg-down/10 text-down') : 'border-line/20 text-ink-3'}`}>{signal ? signal.direction : 'NO SIGNAL'}</span></div>
                    {signal ? <><p className="mt-2 text-[10px] uppercase tracking-wider text-ink-3">{signal.outcome.closed ? 'Completed setup' : 'Latest tracked setup'} · {signal.outcome.status}</p><div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                      <span className="text-ink-3">Entry <b className="ml-1 font-mono text-ink">{signal.levels.entry.toFixed(asset.digits)}</b></span>
                      <span className="text-ink-3">Stop <b className="ml-1 font-mono text-down">{signal.levels.stopLoss.toFixed(asset.digits)}</b></span>
                      <span className="text-ink-3">TP1 <b className="ml-1 font-mono text-up">{signal.levels.tp1.toFixed(asset.digits)}</b></span>
                      <span className="text-ink-3">TP3 <b className="ml-1 font-mono text-up">{signal.levels.tp3.toFixed(asset.digits)}</b></span>
                    </div></> : <p className="mt-2 text-xs text-ink-3">No confirmed crossover yet. Market data continues updating.</p>}
                    <p className="mt-3 text-[10px] font-semibold text-accent">Open {timeframe.label} details →</p>
                  </button>;
                })}
              </div>}
            </div>
          </section>
        );
      })}
    </>
  );
}

function BreakRetestLevelStrip({ setup, digits }: { setup: BreakRetestSetup; digits: number }) {
  const low = Math.min(setup.stopLoss, setup.target);
  const high = Math.max(setup.stopLoss, setup.target);
  const span = Math.max(high - low, Math.abs(setup.entry) * 0.000001, 1e-9);
  const position = (value: number) => Math.max(0, Math.min(100, ((value - low) / span) * 100));
  const zoneLeft = position(setup.zoneLow);
  const zoneRight = position(setup.zoneHigh);
  const zoneWidth = Math.max(1.5, zoneRight - zoneLeft);
  const buy = setup.direction === 'BUY';
  return (
    <section className="mt-3 rounded-xl border border-line/15 bg-surface/[0.025] px-3 py-3 sm:px-4" aria-label="Most recent break and retest levels">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[.16em] text-ink-3">Latest break &amp; retest · {setup.timeframe}</p>
          <p className="mt-0.5 text-xs text-ink-2">Most recent confirmed price-action level</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${buy ? 'border-up/30 bg-up/10 text-up' : 'border-down/30 bg-down/10 text-down'}`}>{setup.direction}</span>
      </div>
      <div className="relative mt-4 h-3 rounded-full bg-line/20">
        <div className="absolute top-0 h-3 rounded-full bg-amber-400/35 ring-1 ring-inset ring-amber-300/70" style={{ left: `${zoneLeft}%`, width: `${zoneWidth}%` }} />
        <div className="absolute -top-1 h-5 w-[2px] rounded bg-amber-300" style={{ left: `${position((setup.zoneLow + setup.zoneHigh) / 2)}%` }} title="Break level" />
        <div className={`absolute -top-1 h-5 w-[2px] rounded ${buy ? 'bg-emerald-400' : 'bg-rose-400'}`} style={{ left: `${position(setup.entry)}%` }} title="Entry" />
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 text-[10px] text-ink-3">
        <span>Stop {setup.stopLoss.toFixed(digits)}</span>
        <span className="text-amber-500">Break / retest zone</span>
        <span>Target {setup.target.toFixed(digits)}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="rounded-lg bg-canvas/35 px-2.5 py-2"><p className="text-[9px] uppercase tracking-wider text-ink-3">Break level</p><p className="mt-1 break-all font-mono text-xs font-semibold text-ink">{((setup.zoneLow + setup.zoneHigh) / 2).toFixed(digits)}</p></div>
        <div className="rounded-lg bg-canvas/35 px-2.5 py-2"><p className="text-[9px] uppercase tracking-wider text-ink-3">Retest zone</p><p className="mt-1 break-all font-mono text-xs font-semibold text-ink">{setup.zoneLow.toFixed(digits)} – {setup.zoneHigh.toFixed(digits)}</p></div>
        <div className="col-span-2 rounded-lg bg-canvas/35 px-2.5 py-2 sm:col-span-1"><p className="text-[9px] uppercase tracking-wider text-ink-3">Entry level</p><p className="mt-1 break-all font-mono text-xs font-semibold text-ink">{setup.entry.toFixed(digits)}</p></div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-line/10 bg-canvas/40 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">{label}</p><p className="mt-1 break-all font-mono text-sm font-bold text-ink">{value}</p></div>; }
