import { BellRing, VolumeX } from 'lucide-react';
import { SignalCard } from '@/components/SignalCard';
import { Just4YouBonus } from '@/components/Just4YouBonus';
import type { TimeframeStates } from '@/hooks/useDerivSignals';
import type { SignalLearningModel } from '@/lib/aiLearning';
import { TIMEFRAMES, emptyTfState, type Asset } from '@/lib/sma';

type Props = {
  selectedSymbols: string[];
  assetMap: Map<string, Asset>;
  states: Record<string, TimeframeStates>;
  prices: Record<string, number>;
  loaded: boolean;
  soundsEnabled: boolean;
  aiModel: SignalLearningModel;
};

export function DashboardView({ selectedSymbols, assetMap, states, prices, loaded, soundsEnabled, aiModel }: Props) {
  return (
    <>
      <Just4YouBonus />
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">COMMAND THE MARKET.</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-ink">8 Timeframes. One Intelligence.</h2>
          <p className="mt-1 max-w-2xl text-sm font-medium tracking-wide text-ink-2">SEE THE SIGNAL. OWN THE MOMENT.</p>
          <p className="mt-1 text-xs text-ink-3">
            {aiModel.ready
              ? `AI has learned from ${aiModel.sampleCount} completed signals (${aiModel.wins} reached the final target, ${aiModel.losses} hit stop-loss).`
              : `AI is collecting completed signals. It needs at least 30 results, including wins and losses, before showing a pattern score. Current completed results: ${aiModel.sampleCount}.`}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-ink-2">
          {soundsEnabled ? <BellRing className="h-4 w-4 text-accent" /> : <VolumeX className="h-4 w-4" />}
          <span>{soundsEnabled ? 'Signal sounds on' : 'Signal sounds off'}</span>
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
                  <div id={`signal-chart-${encodeURIComponent(symbol)}-${encodeURIComponent(timeframe.label)}`} key={`${symbol}-${timeframe.granularity}`} className="min-w-0 xl:min-h-[calc(100vh-13rem)] xl:flex xl:flex-col xl:justify-center">
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
