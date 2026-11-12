import { ArrowDownRight, ArrowUpRight, BellRing, BarChart3, CircleDot, Compass, Wallet, VolumeX } from 'lucide-react';
import { SignalCard } from '@/components/SignalCard';
import { Just4YouBonus } from '@/components/Just4YouBonus';
import type { TimeframeStates } from '@/hooks/useDerivSignals';
import type { SignalLearningModel } from '@/lib/aiLearning';
import { TIMEFRAMES, emptyTfState, type Asset } from '@/lib/sma';
import type { View } from '@/components/ViewNav';

type Props = {
  selectedSymbols: string[];
  assetMap: Map<string, Asset>;
  states: Record<string, TimeframeStates>;
  prices: Record<string, number>;
  loaded: boolean;
  soundsEnabled: boolean;
  aiModel: SignalLearningModel;
  onNavigate: (view: View) => void;
};

export function DashboardView({ selectedSymbols, assetMap, states, prices, loaded, soundsEnabled, aiModel, onNavigate }: Props) {
  const signalSummary = selectedSymbols.reduce((summary, symbol) => {
    for (const timeframe of TIMEFRAMES) {
      const direction = states[symbol]?.[timeframe.granularity]?.latestSignal?.direction;
      if (direction === 'BUY') summary.buy += 1;
      if (direction === 'SELL') summary.sell += 1;
    }
    return summary;
  }, { buy: 0, sell: 0 });
  const totalSignals = signalSummary.buy + signalSummary.sell;

  const shortcuts: { label: string; detail: string; view: View; icon: typeof Compass }[] = [
    { label: 'All signals', detail: 'Explore every timeframe', view: 'records', icon: BarChart3 },
    { label: 'Crypto markets', detail: 'Movers and opportunities', view: 'crypto', icon: Compass },
    { label: 'Trading accounts', detail: 'Connect or manage trading', view: 'binance', icon: CircleDot },
    { label: 'My account', detail: 'Referrals and earnings', view: 'referrals', icon: Wallet },
  ];

  return (
    <>
      <Just4YouBonus />
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
            <p className="text-xs text-ink-3">Monitored assets</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-ink">{selectedSymbols.length}</p>
          </div>
          <div className="rounded-2xl border border-line/10 bg-canvas/55 p-4">
            <p className="text-xs text-ink-3">Current signals</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-ink">{totalSignals}</p>
          </div>
          <div className="rounded-2xl border border-line/10 bg-canvas/55 p-4">
            <p className="flex items-center gap-1 text-xs text-ink-3"><ArrowUpRight className="h-3.5 w-3.5 text-emerald-500" /> Buy signals</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-500">{signalSummary.buy}</p>
          </div>
          <div className="rounded-2xl border border-line/10 bg-canvas/55 p-4">
            <p className="flex items-center gap-1 text-xs text-ink-3"><ArrowDownRight className="h-3.5 w-3.5 text-rose-500" /> Sell signals</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-rose-500">{signalSummary.sell}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-3">
          <span>{loaded ? 'Market feed connected · Signal data updating' : 'Connecting to market feed…'}</span>
          <span>{aiModel.ready ? `AI learning from ${aiModel.sampleCount} completed signals` : `AI learning · ${aiModel.sampleCount} completed results collected`}</span>
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
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-ink">8 Timeframes. One Intelligence.</h2>
          <p className="mt-1 max-w-2xl text-sm font-medium tracking-wide text-ink-2">SEE THE SIGNAL. OWN THE MOMENT.</p>
          <p className="mt-1 text-xs text-ink-3">
            {aiModel.ready
              ? `AI has learned from ${aiModel.sampleCount} completed signals (${aiModel.wins} reached the final target, ${aiModel.losses} hit stop-loss).`
              : `AI is collecting completed signals. It needs at least 30 results, including wins and losses, before showing a pattern score. Current completed results: ${aiModel.sampleCount}.`}
          </p>
        </div>
      </div>

      {selectedSymbols.map((symbol) => {
        const asset = assetMap.get(symbol) ?? { symbol, name: symbol, fullName: symbol, digits: 4 };
        const assetStates = states[symbol] ?? {};
        return (
          <section key={symbol} className="mt-7">
            <div className="mb-3 flex items-center gap-3">
              <div className="h-px flex-1 bg-line/10" />
              <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-2">{asset.fullName}</h3>
              <div className="h-px flex-1 bg-line/10" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-1 xl:gap-6">
              {TIMEFRAMES.map((timeframe) => {
                const tf = assetStates[timeframe.granularity] ?? emptyTfState(timeframe);
                const direction = tf.latestSignal?.direction;
                const confluenceCount = direction
                  ? TIMEFRAMES.filter((item) => assetStates[item.granularity]?.latestSignal?.direction === direction).length
                  : undefined;
                return (
                  <div key={`${symbol}-${timeframe.granularity}`} className="min-w-0">
                    <SignalCard asset={asset} tf={tf} loaded={loaded} price={prices[symbol]} aiModel={aiModel} confluenceCount={confluenceCount} />
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}
