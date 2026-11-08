import { ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, Info, Loader2, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { EntryTime, LevelList, CurrentPrice, directionExplanation } from '@/components/SignalParts';
import { getAiPatternScore, type SignalLearningModel } from '@/lib/aiLearning';
import type { Classification, SuperSignal } from '@/lib/intelligence';
import type { TfState } from '@/lib/sma';
import { SignalChartSnapshot } from '@/components/SignalChartSnapshot';

type Props = {
  signals: SuperSignal[];
  prices: Record<string, number>;
  loaded: boolean;
  aiModel: SignalLearningModel;
  states: Record<string, Record<number, TfState>>;
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

export function SuperSignalPanel({ signals, prices, loaded, aiModel, states }: Props) {
  const sliderRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const updateSliderControls = useCallback(() => {
    const slider = sliderRef.current;
    if (!slider) return;
    setCanScrollLeft(slider.scrollLeft > 4);
    setCanScrollRight(slider.scrollLeft + slider.clientWidth < slider.scrollWidth - 4);
  }, []);
  useEffect(() => {
    updateSliderControls();
    window.addEventListener('resize', updateSliderControls);
    return () => window.removeEventListener('resize', updateSliderControls);
  }, [loaded, signals.length, updateSliderControls]);
  const scrollSlider = (direction: -1 | 1) => {
    const slider = sliderRef.current;
    if (!slider) return;
    const card = slider.querySelector<HTMLElement>('[data-super-signal-card]');
    slider.scrollBy({ left: direction * (card ? card.offsetWidth + 16 : slider.clientWidth * 0.85), behavior: 'smooth' });
  };
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
          We only show a Super Signal when all 8 timeframes (M1, M5, M15, M30, H1, H4, H8 and D1) point up together or down together. If they disagree, we wait.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="mb-2 flex items-center justify-end gap-2">
        <span className="mr-auto text-xs font-medium uppercase tracking-[0.16em] text-ink-3">Signal carousel</span>
        <button type="button" onClick={() => scrollSlider(-1)} disabled={!canScrollLeft} aria-label="Previous Super Signal" className="slider-arrow">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => scrollSlider(1)} disabled={!canScrollRight} aria-label="Next Super Signal" className="slider-arrow">
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
      <div ref={sliderRef} onScroll={updateSliderControls} className="super-signal-slider flex w-full min-w-0 snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain pb-3 touch-auto">
      {signals.map((signal) => (
        <SuperSignalCard
          key={`${signal.symbol}-${signal.signalEpoch}`}
          signal={signal}
          price={prices[signal.symbol]}
          aiModel={aiModel}
          candles={states[signal.symbol]?.[900]?.candles ?? []}
        />
      ))}
      </div>
      <p className="flex items-start gap-2 text-sm text-ink-3">
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
  candles,
}: {
  signal: SuperSignal;
  candles: import('@/lib/deriv').Candle[];
  price: number | undefined;
  aiModel: SignalLearningModel;
}) {
  const isBuy = signal.direction === 'BUY';
  const DirectionIcon = isBuy ? ArrowUpRight : ArrowDownRight;
  const { levels } = signal;
  const aiScore = getAiPatternScore(aiModel, 900, signal.direction, levels);

  return (
    <article
      data-super-signal-card
      className={`hud-panel flex w-full min-w-full max-w-full snap-start snap-always flex-col gap-4 overflow-hidden rounded-2xl border bg-surface/[0.03] p-4 transition-colors duration-300 sm:min-w-full sm:max-w-full sm:p-5 ${
        isBuy ? 'border-up/25 hover:border-up/50' : 'border-down/25 hover:border-down/50'
      }`}
    >
      <header className="flex flex-col items-start gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="break-words text-xl font-semibold text-ink">{signal.name}</h3>
          <p className="mt-0.5 text-sm text-ink-3">{signal.symbol}</p>
        </div>
        <span
          className={`inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-bold tracking-wide sm:flex-shrink-0 sm:text-base sm:tracking-wider ${
            isBuy ? 'border-up/40 bg-up/10 text-up' : 'border-down/40 bg-down/10 text-down'
          }`}
        >
          <DirectionIcon className="h-4 w-4" />
          {signal.direction === 'BUY' ? 'BUY — UP' : 'SELL — DOWN'}
        </span>
      </header>

      <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-up/60 bg-up/10 px-4 py-3 text-up shadow-[0_0_22px_rgba(34,197,94,0.16)]"><div><div className="text-[10px] font-bold uppercase tracking-[0.18em]">8-timeframe signal grade</div><div className="text-xs font-semibold">SUPER SIGNAL · All timeframes agree</div></div><div className="text-3xl font-black tabular-nums">8<span className="text-lg opacity-70">/8</span></div></div>

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

      <SignalChartSnapshot candles={candles} levels={levels} signalEpoch={signal.signalEpoch} direction={signal.direction} timeframe="M15" digits={signal.digits} assetName={signal.name} symbol={signal.symbol} anchorId={`super-signal-chart-${signal.symbol}`} />

      <div className="flex flex-col items-start gap-3 rounded-xl border border-line/10 bg-surface/[0.02] p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:p-4">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wider text-ink-3">Why this signal?</div>
          <p className="mt-1 text-sm leading-relaxed text-ink-2">
            All 8 timeframes agree. This means the short and long charts are pointing in the same direction.
          </p>
          <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-up">8/8 · SUPER SIGNAL CONFIRMED</p>
        </div>
        <span className={`max-w-full rounded-full border px-3 py-1 text-xs font-semibold sm:flex-shrink-0 sm:text-sm ${STRENGTH_STYLE[signal.classification]}`}>
          {STRENGTH_LABEL[signal.classification]}
        </span>
      </div>
    </article>
  );
}
