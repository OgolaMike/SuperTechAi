import { useEffect, useMemo, useState } from 'react';
import { Activity, BrainCircuit, CheckCircle2, Clock3, ShieldAlert, Sparkles } from 'lucide-react';
import { TIMEFRAMES, isStale, formatDateTime, type Asset, type TfState } from '@/lib/sma';
import type { SuperSignal } from '@/lib/intelligence';
import type { StopOrderIdea } from '@/lib/stopOrders';
import { flattenSignals } from '@/lib/signals';
import { buildIndependentStrategyAssessments } from '@/lib/independentStrategies';
import type { StrategyAssessment } from '@/lib/strategyConfluence';
import { evaluateStrategyOutcome, summarizeStrategyPerformance, type StrategyOutcome } from '@/lib/strategyOutcomes';
import { appendIndependentStrategyOutcomeEvents, fetchIndependentStrategyOutcomeEvents } from '@/lib/independentApi';

type Props = { assets: Asset[]; states: Record<string, Record<number, TfState>>; prices: Record<string, number>; superSignals: SuperSignal[]; pendingOrderIdeas: StopOrderIdea[]; loaded: boolean; nowEpoch: number; initialSymbol?: string };

export function AnalysisPanel({ assets, states, prices, superSignals, pendingOrderIdeas, loaded, nowEpoch, initialSymbol }: Props) {
  const [symbol, setSymbol] = useState(initialSymbol ?? assets[0]?.symbol ?? '');
  const [timeframe, setTimeframe] = useState('H4');
  const [persistedOutcomes, setPersistedOutcomes] = useState<StrategyOutcome[]>([]);
  const [historySync, setHistorySync] = useState<'loading' | 'synced' | 'local' | 'unavailable'>('loading');
  const asset = assets.find((item) => item.symbol === symbol) ?? assets[0];
  const activeSymbol = asset?.symbol ?? symbol;
  const assetStates = states[activeSymbol] ?? {};
  const price = prices[activeSymbol];
  const signal = superSignals.find((item) => item.symbol === activeSymbol);
  const pendingIdea = pendingOrderIdeas.find((item) => item.symbol === activeSymbol && item.status === 'WAITING');
  const selectedTf = TIMEFRAMES.find((item) => item.label === timeframe) ?? TIMEFRAMES.find((item) => item.label === 'H4')!;
  const selectedState = assetStates[selectedTf.granularity];
  const h4 = assetStates[TIMEFRAMES.find((item) => item.label === 'H4')!.granularity];
  const h4Signal = h4?.latestSignal && !h4.latestSignal.outcome.closed ? h4.latestSignal : null;

  const strategyAssessments = useMemo(() => buildIndependentStrategyAssessments(
    assets, states, flattenSignals(assets, states), pendingOrderIdeas, superSignals, nowEpoch,
  ), [assets, states, pendingOrderIdeas, superSignals, nowEpoch]);
  const latestAssessment = (id: string): StrategyAssessment | undefined => strategyAssessments
    .filter((item) => item.symbol === activeSymbol && item.strategyId === id)
    .sort((a, b) => b.signalEpoch - a.signalEpoch)[0];
  const assessmentStatus = (item?: StrategyAssessment) => !item
    ? 'No fresh setup'
    : `${item.status === 'SIGNAL' ? item.direction : item.status} · ${formatDateTime(item.signalEpoch)}`;

  const outcomes = useMemo(() => strategyAssessments
    .filter((item) => item.symbol === activeSymbol)
    .map((item) => evaluateStrategyOutcome(item, item.granularity == null ? undefined : assetStates[item.granularity], nowEpoch)),
  [strategyAssessments, activeSymbol, assetStates, nowEpoch]);
  useEffect(() => {
    let cancelled = false;
    const events = outcomes.filter((item) => item.status !== 'UNTRACKED').map((item) => ({
      event_key: [item.key, item.status, item.entryEpoch ?? 0, item.resolvedEpoch ?? 0].join('|'),
      event_epoch: item.resolvedEpoch ?? item.entryEpoch ?? item.signalEpoch,
      payload: item as unknown as Record<string, unknown>,
    }));
    (async () => {
      try {
        const remote = await fetchIndependentStrategyOutcomeEvents();
        if (cancelled) return;
        const history = remote.events
          .filter((event) => event.payload && typeof event.payload === 'object')
          .sort((a, b) => a.event_epoch - b.event_epoch)
          .map((event) => event.payload as unknown as StrategyOutcome);
        setPersistedOutcomes(history);
        if (events.length) await appendIndependentStrategyOutcomeEvents(events);
        if (cancelled) return;
        setPersistedOutcomes((current) => {
          const latest = new Map<string, StrategyOutcome>();
          current.forEach((item) => latest.set(item.key, item));
          outcomes.forEach((item) => { if (item.status !== 'UNTRACKED') latest.set(item.key, item); });
          return [...latest.values()];
        });
        setHistorySync('synced');
      } catch {
        if (!cancelled) setHistorySync('unavailable');
      }
    })();
    return () => { cancelled = true; };
  }, [outcomes]);
  const allOutcomes = useMemo(() => {
    const latest = new Map<string, StrategyOutcome>();
    persistedOutcomes.forEach((item) => latest.set(item.key, item));
    outcomes.forEach((item) => latest.set(item.key, item));
    return [...latest.values()];
  }, [persistedOutcomes, outcomes]);
  const performance = useMemo(() => summarizeStrategyPerformance(allOutcomes), [allOutcomes]);
  const latestOutcome = (id: string): StrategyOutcome | undefined => allOutcomes
    .filter((item) => item.strategyId === id)
    .sort((a, b) => b.signalEpoch - a.signalEpoch)[0];
  const performanceText = (id: string) => {
    const item = performance.find((row) => row.strategyId === id);
    if (!item || item.sample === 0) return 'No resolved candle outcomes yet';
    return `${item.wins} wins / ${item.losses} losses · ${item.winRate!.toFixed(0)}% · ${item.averageR!.toFixed(2)}R avg · n=${item.sample}`;
  };
  const outcomeText = (id: string) => {
    const outcome = latestOutcome(id);
    return outcome ? `${outcome.status} · ${outcome.note}` : 'No evaluated setup';
  };

  const report = useMemo(() => {
    const reads = TIMEFRAMES.map((item) => {
      const state = assetStates[item.granularity];
      const fresh = !!state && !isStale(state, nowEpoch) && state.lastClose != null && state.currentSma != null;
      const bias = !fresh ? 'Unavailable' : state!.lastClose! > state!.currentSma! ? 'Bullish' : state!.lastClose! < state!.currentSma! ? 'Bearish' : 'Neutral';
      return { ...item, fresh, bias };
    });
    const valid = reads.filter((item) => item.fresh);
    const candles = selectedState?.candles ?? [];
    const recent = candles.slice(-30);
    const closes = candles.slice(-6).map((item) => item.close);
    return {
      reads,
      valid: valid.length,
      bullish: valid.filter((item) => item.bias === 'Bullish').length,
      bearish: valid.filter((item) => item.bias === 'Bearish').length,
      support: recent.length ? Math.min(...recent.map((item) => item.low)) : null,
      resistance: recent.length ? Math.max(...recent.map((item) => item.high)) : null,
      momentum: closes.length >= 2 ? closes[closes.length - 1] - closes[0] : null,
    };
  }, [assetStates, selectedState, nowEpoch]);

  const decision = signal?.direction ?? pendingIdea?.type ?? 'WAIT';
  const levels = signal?.levels ?? null;
  const entryValue = levels?.entry ?? pendingIdea?.entry ?? null;
  const stopValue = levels?.stopLoss ?? pendingIdea?.stopLoss ?? null;
  const targetOne = levels?.tp1 ?? pendingIdea?.takeProfit ?? null;
  const targetTwo = levels?.tp2 ?? pendingIdea?.takeProfit ?? null;
  const digits = asset?.digits ?? 4;
  const fmt = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : value.toFixed(digits);
  const tone = decision === 'BUY' || decision === 'BUY LIMIT' ? 'text-emerald-400' : decision === 'SELL' || decision === 'SELL LIMIT' ? 'text-rose-400' : 'text-amber-300';

  return <main className="mt-7 space-y-5">
    <section className="relative overflow-hidden rounded-3xl border border-accent/30 bg-gradient-to-br from-[#10243b] via-[#0a1424] to-[#080e19] p-5 shadow-[0_24px_80px_rgba(0,0,0,.28)] sm:p-7">
      <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-accent/15 blur-3xl" />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.24em] text-accent"><BrainCircuit className="h-4 w-4" /> SuperTech Intelligence</p><h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">Asset Analysis</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">Choose a market. Review the evidence. Get one coordinated decision with clear levels and conditions.</p></div>
        <div className="grid w-full gap-2 sm:grid-cols-[1fr_130px] lg:w-[430px]">
          <label className="text-xs font-semibold text-slate-300">Choose asset<select value={activeSymbol} onChange={(event) => setSymbol(event.target.value)} className="mt-1.5 h-12 w-full rounded-xl border border-white/15 bg-[#0a1424] px-3 text-sm text-white outline-none focus:border-accent">{assets.map((item) => <option key={item.symbol} value={item.symbol}>{item.name} · {item.symbol}</option>)}</select></label>
          <label className="text-xs font-semibold text-slate-300">Focus timeframe<select value={timeframe} onChange={(event) => setTimeframe(event.target.value)} className="mt-1.5 h-12 w-full rounded-xl border border-white/15 bg-[#0a1424] px-3 text-sm text-white outline-none focus:border-accent">{TIMEFRAMES.map((item) => <option key={item.label} value={item.label}>{item.label}</option>)}</select></label>
        </div>
      </div>
      <div className="relative mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric label="Live price" value={loaded ? fmt(price) : 'Connecting'} /><Metric label="Fresh timeframes" value={`${report.valid}/${TIMEFRAMES.length}`} /><Metric label="Bullish reads" value={String(report.bullish)} /><Metric label="Bearish reads" value={String(report.bearish)} /></div>
    </section>

    <section className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
      <article className="rounded-3xl border border-line/15 bg-surface/[.04] p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-accent">SuperTech recommendation</p><h2 className="mt-1 text-xl font-bold text-ink">What should you do?</h2></div><span className={`rounded-full border border-current/25 px-3 py-1.5 text-xs font-black tracking-wider ${tone}`}>{decision}</span></div>
        <p className="mt-3 text-sm leading-relaxed text-ink-2">{signal ? 'The H4 primary signal has passed the platform multi-timeframe confirmation rules.' : pendingIdea ? `${pendingIdea.patternType} is approaching its ${pendingIdea.type} zone. This is a pending idea, not a market entry.` : h4Signal ? 'An H4 trigger exists, but complete multi-timeframe confirmation is not yet satisfied. Wait.' : 'No fresh, fully confirmed setup is available. Wait for a valid candle close and confirmation.'}</p>
        {entryValue != null && stopValue != null && targetOne != null ? <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric label={pendingIdea && !signal ? 'Pending entry' : 'Entry'} value={fmt(entryValue)} /><Metric label="Stop loss" value={fmt(stopValue)} /><Metric label="Target 1" value={fmt(targetOne)} /><Metric label="Target 2" value={fmt(targetTwo)} /></div> : <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/[.05] p-4 text-sm text-ink-2"><ShieldAlert className="mr-2 inline h-4 w-4 text-amber-300" />No confirmed trade levels. SuperTech will not invent an entry, stop or target.</div>}
        {signal && <p className="mt-4 text-xs text-ink-3">Confluence: {signal.agreeing}/{signal.validReads} timeframes · {signal.gradePercent}% supporting alignment · {signal.classification}</p>}
        <div className="mt-5 flex items-start gap-2 rounded-xl border border-line/10 bg-surface/[.025] p-3 text-xs leading-relaxed text-ink-3"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-accent" />Manual-trading guidance only. Confirm live price, spread, execution conditions and position risk. This analysis does not place trades.</div>
      </article>
      <article className="rounded-3xl border border-line/15 bg-surface/[.04] p-5 sm:p-6"><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-accent" /><h2 className="font-bold text-ink">Market structure</h2></div><div className="mt-4 grid grid-cols-2 gap-3"><Metric label="Recent support" value={fmt(report.support)} /><Metric label="Recent resistance" value={fmt(report.resistance)} /><Metric label="Selected timeframe" value={timeframe} /><Metric label="Recent momentum" value={report.momentum == null ? 'Insufficient data' : report.momentum > 0 ? 'Positive' : report.momentum < 0 ? 'Negative' : 'Flat'} /></div><p className="mt-4 text-xs leading-relaxed text-ink-3">Support and resistance are the lowest and highest prices across the latest 30 confirmed candles. They are reference zones, not guaranteed reversal points.</p></article>
    </section>

    <section className="rounded-3xl border border-line/15 bg-surface/[.035] p-5 sm:p-6"><div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-accent">Strategy evidence</p><h2 className="mt-1 text-xl font-bold text-ink">Every timeframe, one picture</h2></div><p className="text-xs text-ink-3">Confirmed candles only · M30 minimum</p></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">{report.reads.map((read) => <div key={read.label} className="rounded-xl border border-line/10 bg-surface/[.035] p-3"><div className="flex items-center justify-between"><span className="text-sm font-bold text-ink">{read.label}</span>{read.fresh ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Clock3 className="h-4 w-4 text-amber-300" />}</div><p className={`mt-2 text-sm font-semibold ${read.bias === 'Bullish' ? 'text-emerald-400' : read.bias === 'Bearish' ? 'text-rose-400' : 'text-ink-3'}`}>{read.bias}</p><p className="mt-1 text-[10px] text-ink-3">{read.fresh ? 'Fresh market read' : 'Unavailable / stale'}</p></div>)}</div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Strategy name="SMA / Bollinger crossover" detail="Independent candle-close crossover. The strategy uses its own H4/M30 entry, stop and TP3." status={h4Signal ? `H4 ${h4Signal.direction} trigger · ${h4Signal.outcome.status}` : 'No active H4 trigger'} performance={performanceText('bollinger-cross')} outcome={outcomeText('bollinger-cross')} />
        <Strategy name="Multi-timeframe Super Signal" detail="H4-led confirmation across the supporting timeframes. Alignment is not counted as a separate trade outcome." status={signal ? `Confirmed · ${signal.agreeing}/${signal.validReads} aligned` : 'Confirmation not complete'} />
        <Strategy name="Break & Retest" detail={latestAssessment('break-retest')?.reason ?? 'Independent confirmed break, retest and rejection scan.'} status={assessmentStatus(latestAssessment('break-retest'))} performance={performanceText('break-retest')} outcome={outcomeText('break-retest')} />
        <Strategy name="Triple Top" detail={latestAssessment('triple-top')?.reason ?? 'Three-touch resistance limit setup.'} status={assessmentStatus(latestAssessment('triple-top'))} performance={performanceText('triple-top')} outcome={outcomeText('triple-top')} />
        <Strategy name="Triple Bottom" detail={latestAssessment('triple-bottom')?.reason ?? 'Three-touch support limit setup.'} status={assessmentStatus(latestAssessment('triple-bottom'))} performance={performanceText('triple-bottom')} outcome={outcomeText('triple-bottom')} />
        <Strategy name="Market Structure SAR" detail={latestAssessment('market-structure-sar')?.reason ?? 'Confirmed M30 swing structure and Parabolic SAR flip.'} status={assessmentStatus(latestAssessment('market-structure-sar'))} performance={performanceText('market-structure-sar')} outcome={outcomeText('market-structure-sar')} />
        <Strategy name="3H Wick Intelligence" detail={latestAssessment('three-hour-wick')?.reason ?? 'H4 wick rejection requires a fresh Unified Signal confirmation.'} status={assessmentStatus(latestAssessment('three-hour-wick'))} performance={performanceText('three-hour-wick')} outcome={outcomeText('three-hour-wick')} />
      </div>
      <p className="mt-4 text-[11px] leading-relaxed text-ink-3">Performance uses confirmed-candle replay plus the member's Appwrite outcome-event history when the strategy outcome table is configured. Stop is counted first when stop and target touch in the same candle. Open and unfilled setups are excluded from win rate. These are simulated candle outcomes, never broker fills. ${historySync === 'synced' ? 'History sync connected.' : historySync === 'unavailable' ? 'History sync unavailable; showing this device’s candle history only.' : 'Connecting outcome history…'}</p>
    </section>
  </main>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-xl border border-line/10 bg-surface/[.035] p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">{label}</p><p className="mt-1 break-words text-base font-bold tabular-nums text-ink">{value}</p></div>;
}
function Strategy({ name, detail, status, performance, outcome }: { name: string; detail: string; status: string; performance?: string; outcome?: string }) {
  return <div className="rounded-xl border border-line/10 bg-surface/[.035] p-4"><div className="flex items-start gap-2"><Activity className="mt-0.5 h-4 w-4 shrink-0 text-accent" /><div className="min-w-0"><p className="text-sm font-semibold text-ink">{name}</p><p className="mt-1 text-xs leading-relaxed text-ink-3">{detail}</p><p className="mt-2 text-xs font-semibold text-accent">{status}</p>{outcome && <p className="mt-2 text-xs leading-relaxed text-ink-2">Latest outcome: {outcome}</p>}{performance && <p className="mt-2 text-[11px] leading-relaxed text-ink-3">Resolved performance: {performance}</p>}</div></div></div>;
}
