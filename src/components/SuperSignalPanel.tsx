import { ArrowDownRight, ArrowUpRight, Info, Loader2, Sparkles } from 'lucide-react';
import { EntryTime, LevelList, CurrentPrice, directionExplanation } from '@/components/SignalParts';
import { getAiPatternScore, type SignalLearningModel } from '@/lib/aiLearning';
import type { Classification, SuperSignal } from '@/lib/intelligence';

type Props = {
  signals: SuperSignal[];
  prices: Record<string, number>;
  loaded: boolean;
  aiModel: SignalLearningModel;
};

const STRENGTH_STYLE: Record<Classification, string> = {
  'Strong alignment': 'border-up/30 bg-up/10 text-up',
  'Moderate alignment': 'border-accent/30 bg-accent/10 text-accent',
  'Early signal': 'border-warn/30 bg-warn/10 text-warn',
  'Counter-trend': 'border-down/30 bg-down/10 text-down',
};

const STRENGTH_LABEL: Record<Classification, string> = {
  'Strong alignment': 'All 8 agree',
  'Moderate alignment': 'Good',
  'Early signal': 'Early',
  'Counter-trend': 'Mixed',
};

export function SuperSignalPanel({ signals, prices, loaded, aiModel }: Props) {
  if (!loaded) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-line/10 bg-surface/[0.03] p-6 text-sm text-ink-2">
        <Loader2 className="h-4 w-4 animate-spin text-accent" />
        Checking the market…
      </div>
    );
  }

  if (signals.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-line/10 bg-surface/[0.03] px-6 py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-accent/30 bg-accent/10">
          <Sparkles className="h-5 w-5 text-accent" />
        </div>
        <h3 className="text-lg font-semibold text-ink">No Super Signal right now</h3>
        <p className="max-w-md text-sm leading-relaxed text-ink-2">
          We only show a Super Signal when all 8 timeframes (M1, M5, M15, M30, H1, H2, H4 and D1) point up together or down together. If they disagree, we wait.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {signals.map((signal) => (
        <SuperSignalCard
          key={`${signal.symbol}-${signal.signalEpoch}`}
          signal={signal}
          price={prices[signal.symbol]}
          aiModel={aiModel}
        />
      ))}
      <p className="flex items-start gap-2 text-sm text-ink-3 lg:col-span-2">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
        These are market alerts, not automatic trades. Always check the price and risk before acting.
      </p>
    </div>
  );
}

function SuperSignalCard({
  signal,
  price,
  aiModel,
}: {
  signal: SuperSignal;
  price: number | undefined;
  aiModel: SignalLearningModel;
}) {
  const isBuy = signal.direction === 'BUY';
  const DirectionIcon = isBuy ? ArrowUpRight : ArrowDownRight;
  const { levels } = signal;
  const aiScore = getAiPatternScore(aiModel, 900, signal.direction, levels);

  return (
    <article
      className={`hud-panel flex flex-col gap-4 rounded-2xl border bg-surface/[0.03] p-5 transition-colors duration-300 ${
        isBuy ? 'border-up/25 hover:border-up/50' : 'border-down/25 hover:border-down/50'
      }`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words text-xl font-semibold text-ink">{signal.name}</h3>
          <p className="mt-0.5 text-sm text-ink-3">{signal.symbol}</p>
        </div>
        <span
          className={`flex flex-shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-base font-bold tracking-wider ${
            isBuy ? 'border-up/40 bg-up/10 text-up' : 'border-down/40 bg-down/10 text-down'
          }`}
        >
          <DirectionIcon className="h-4 w-4" />
          {signal.direction === 'BUY' ? 'BUY — UP' : 'SELL — DOWN'}
        </span>
      </header>

      <p className="text-sm leading-relaxed text-ink-2">{directionExplanation(signal.direction)}</p>

      <div className="rounded-xl border border-line/10 bg-surface/[0.03] px-4 py-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-ink-3">AI pattern score</div>
        {aiScore === null ? (
          <p className="mt-1 text-sm text-ink-2">AI is still learning from completed signals. No score yet.</p>
        ) : (
          <>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-accent">{aiScore}/100</span>
              <span className="text-xs text-ink-3">match with past results</span>
            </div>
            <p className="mt-1 text-xs text-ink-3">This is a pattern score, not a promise of profit.</p>
          </>
        )}
      </div>

      <EntryTime epoch={signal.signalEpoch} direction={signal.direction} />
      <CurrentPrice price={price} entry={levels.entry} direction={signal.direction} digits={signal.digits} />

      <LevelList
        digits={signal.digits}
        rows={[
          { label: 'Suggested entry', hint: 'Price where the signal started.', value: levels.entry, hitEpoch: null, tone: 'text-ink' },
          { label: 'Stop-loss', hint: 'Exit here to limit the loss.', value: levels.stopLoss, hitEpoch: null, tone: 'text-down' },
          { label: 'Take-profit 1', hint: 'First profit level.', value: levels.tp1, hitEpoch: null, tone: 'text-up' },
          { label: 'Take-profit 2', hint: 'Second profit level.', value: levels.tp2, hitEpoch: null, tone: 'text-up' },
          { label: 'Take-profit 3', hint: 'Final profit level.', value: levels.tp3, hitEpoch: null, tone: 'text-up' },
        ]}
      />

      <div className="flex items-center justify-between gap-3 rounded-xl border border-line/10 bg-surface/[0.02] p-4">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wider text-ink-3">Why this signal?</div>
          <p className="mt-1 text-sm leading-relaxed text-ink-2">
            All 8 timeframes agree. This means the short and long charts are pointing in the same direction.
          </p>
          <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-up">8 of 8 timeframes agree</p>
        </div>
        <span className={`flex-shrink-0 rounded-full border px-3 py-1 text-sm font-semibold ${STRENGTH_STYLE[signal.classification]}`}>
          {STRENGTH_LABEL[signal.classification]}
        </span>
      </div>
    </article>
  );
}
