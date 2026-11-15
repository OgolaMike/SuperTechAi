import { ArrowRight, BrainCircuit, CircleDot, Sparkles } from 'lucide-react';
import { TIMEFRAMES, isStale } from '@/lib/sma';
import type { TimeframeStates } from '@/hooks/useDerivSignals';
import type { View } from '@/components/ViewNav';

type Props = {
  selectedSymbols: string[];
  states: Record<string, TimeframeStates>;
  loaded: boolean;
  onNavigate: (view: View) => void;
};

export function DailyMarketBriefing({ selectedSymbols, states, loaded, onNavigate }: Props) {
  const nowEpoch = Math.floor(Date.now() / 1000);
  const summary = selectedSymbols.reduce((result, symbol) => {
    for (const timeframe of TIMEFRAMES) {
      const timeframeState = states[symbol]?.[timeframe.granularity];
      const signal = timeframeState?.latestSignal;
      if (!timeframeState || isStale(timeframeState, nowEpoch) || !signal) continue;
      if (signal.direction === 'BUY') result.buy += 1;
      if (signal.direction === 'SELL') result.sell += 1;
    }
    return result;
  }, { buy: 0, sell: 0 });

  const total = summary.buy + summary.sell;
  const leading = summary.buy === summary.sell ? 'mixed' : summary.buy > summary.sell ? 'BUY' : 'SELL';
  const headline = !loaded
    ? 'Preparing your market briefing'
    : total === 0
      ? 'No confirmed crossover signals to report yet'
      : leading === 'mixed'
        ? 'The market is showing mixed directions'
        : leading + ' signals are currently leading';

  const detail = !loaded
    ? 'Connecting to the market feed and checking your selected assets.'
    : total === 0
      ? 'Your selected markets are being monitored. We will show a direction when a confirmed signal is available.'
      : 'We found ' + total + ' current timeframe signal readings across ' + selectedSymbols.length + ' selected assets. Review the charts before making a decision.';

  return (
    <section aria-live="polite" className="relative mt-5 overflow-hidden rounded-3xl border border-accent/25 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-5 text-white shadow-xl sm:p-6">
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-amber-300/10 blur-3xl" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-200/25 bg-amber-200/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-100">
            <Sparkles className="h-3.5 w-3.5" /> Your market briefing
          </div>
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{headline}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">{detail}</p>
          <p className="mt-3 flex items-center gap-2 text-xs text-slate-400">
            <CircleDot className={'h-3.5 w-3.5 ' + (loaded ? 'text-emerald-300' : 'text-amber-200')} />
            {loaded ? 'Market data is available' : 'Waiting for market data'}
          </p>
        </div>
        <div className="relative grid w-full shrink-0 grid-cols-2 gap-2 sm:w-48">
          <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.08] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-200">BUY</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{summary.buy}</p>
            <p className="text-[10px] text-slate-400">Readings</p>
          </div>
          <div className="rounded-2xl border border-rose-300/20 bg-rose-300/[0.08] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-200">SELL</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{summary.sell}</p>
            <p className="text-[10px] text-slate-400">Readings</p>
          </div>
        </div>
      </div>
      <div className="relative mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4">
        <button type="button" onClick={() => onNavigate('super')} className="inline-flex items-center gap-2 rounded-xl bg-amber-200 px-4 py-2.5 text-xs font-bold text-slate-950 transition hover:bg-amber-100">
          Explore Super Signals <ArrowRight className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => onNavigate('academy')} className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-white/[0.1]">
          <BrainCircuit className="h-3.5 w-3.5" /> Learn with Academy AI
        </button>
      </div>
    </section>
  );
}
