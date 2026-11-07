import { ArrowDownRight, ArrowUpRight, Clock, Loader2, Minus, Target } from 'lucide-react';
import { EntryTime, LevelList, STATUS_TEXT, CurrentPrice, directionExplanation, statusTone } from '@/components/SignalParts';
import { getAiPatternScore, type SignalLearningModel } from '@/lib/aiLearning';
import { formatDateTime, type Asset, type TfState } from '@/lib/sma';
import type { Signal } from '@/lib/signals';
import { SignalChartSnapshot } from '@/components/SignalChartSnapshot';

type Props = {
  asset: Asset;
  tf: TfState;
  loaded: boolean;
  price: number | undefined;
  aiModel: SignalLearningModel;
  confluenceCount?: number;
};

export function SignalCard({ asset, tf, loaded, price, aiModel, confluenceCount }: Props) {
  const signal = tf.latestSignal;
  const loading = !loaded || tf.candles.length === 0;
  const isBuy = signal?.direction === 'BUY';
  const isSell = signal?.direction === 'SELL';
  const aiScore = signal ? getAiPatternScore(aiModel, tf.granularity, signal.direction, signal.levels) : null;
  const gradeTone = confluenceCount === 8
    ? 'border-up/60 bg-up/15 text-up shadow-[0_0_22px_rgba(34,197,94,0.18)]'
    : confluenceCount !== undefined && confluenceCount >= 6
      ? 'border-accent/50 bg-accent/10 text-accent'
      : confluenceCount !== undefined && confluenceCount >= 4
        ? 'border-warn/40 bg-warn/10 text-warn'
        : 'border-line/20 bg-surface/[0.04] text-ink-2';

  return (
    <div className={`hud-panel flex min-w-0 flex-col gap-4 overflow-hidden rounded-2xl border bg-surface/[0.03] p-4 transition-all duration-300 hover:bg-surface/[0.05] sm:p-5 ${
      isBuy ? 'border-up/30' : isSell ? 'border-down/30' : 'border-line/10'
    }`}>
      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="mb-1 break-words whitespace-normal text-xs font-semibold uppercase tracking-wider text-accent" title={asset.fullName}>
            {asset.fullName} <span className="font-medium text-ink-3">({asset.symbol})</span>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-lg font-semibold text-ink">{tf.label}</span>
            <span className="break-words whitespace-normal text-xs uppercase tracking-wider text-ink-3">{tf.role}</span>
          </div>
        </div>
        {signal && (
          <span className={`max-w-full rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-snug sm:px-3 sm:text-xs ${statusTone(signal.outcome.status)}`}>
            {STATUS_TEXT[signal.outcome.status]}
          </span>
        )}
      </div>

      {signal ? (
        <>
          <div className="flex items-center gap-3">
            <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border ${
              isBuy ? 'border-up/40 bg-up/10' : 'border-down/40 bg-down/10'
            }`}>
              {isBuy ? <ArrowUpRight className="h-7 w-7 text-up" /> : <ArrowDownRight className="h-7 w-7 text-down" />}
            </div>
            <div className="min-w-0">
              <div className={`text-xl font-bold tracking-tight sm:text-2xl ${isBuy ? 'text-up' : 'text-down'}`}>
                {signal.direction === 'BUY' ? 'BUY — UP' : 'SELL — DOWN'}
              </div>
              <div className="text-sm text-ink-2">{directionExplanation(signal.direction)}</div>
            </div>
          </div>

          {confluenceCount !== undefined && (
            <div className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 px-4 py-3 ${gradeTone}`}>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] opacity-80">8-timeframe signal grade</div>
                <div className="mt-0.5 text-xs opacity-80">{confluenceCount === 8 ? 'SUPER SIGNAL · All timeframes agree' : confluenceCount >= 6 ? 'Strong alignment' : confluenceCount >= 4 ? 'Moderate alignment' : 'Limited alignment'}</div>
              </div>
              <div className="text-3xl font-black tabular-nums">{confluenceCount}<span className="text-lg font-bold opacity-70">/8</span></div>
            </div>
          )}

          <div className="rounded-xl border border-line/10 bg-surface/[0.03] px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-ink-3">AI pattern score</div>
            {aiScore === null ? (
              <p className="mt-1 text-sm text-ink-2">AI is still learning from completed signals. No score yet.</p>
            ) : (
              <>
                <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-2xl font-bold text-accent">{aiScore}/100</span>
                  <span className="text-xs text-ink-3">match with past results</span>
                </div>
                <p className="mt-1 text-xs text-ink-3">This is a pattern score, not a promise or a guaranteed chance of profit.</p>
              </>
            )}
          </div>

          <EntryTime epoch={signal.signalEpoch} direction={signal.direction} />
          <CurrentPrice price={price} entry={signal.levels.entry} direction={signal.direction} digits={asset.digits} />
          <LevelList rows={buildRows(signal)} digits={asset.digits} />
          <SignalChartSnapshot candles={tf.candles} levels={signal.levels} signalEpoch={signal.signalEpoch} direction={signal.direction} timeframe={tf.label} digits={asset.digits} assetName={asset.fullName} symbol={asset.symbol} anchorId={`signal-chart-${encodeURIComponent(asset.symbol)}-${tf.granularity}`} />

          {signal.outcome.tp3Epoch != null && (
            <div className="flex items-center gap-2 rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm font-semibold text-warn">
              <Target className="h-4 w-4 flex-shrink-0" />
              <span>TAKE PROFIT 3 reached at {formatDateTime(signal.outcome.tp3Epoch)}. This signal is complete.</span>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line/15 px-4 py-8 text-center">
          {loading ? <Loader2 className="h-6 w-6 animate-spin text-ink-3" /> : <Minus className="h-6 w-6 text-ink-3" />}
          <div className="text-base font-semibold text-ink-2">{loading ? 'Loading market data' : 'No new signal'}</div>
          <div className="text-sm text-ink-3">
            {loading ? 'Waiting for recent price data.' : 'A signal appears when price crosses its average after a candle closes.'}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-line/10 pt-3 text-xs text-ink-2">
        <Clock className="h-3.5 w-3.5 flex-shrink-0 text-ink-3" />
        <span>Last update: {formatDateTime(tf.updatedEpoch)}</span>
      </div>
    </div>
  );
}

function buildRows(signal: Signal) {
  const { levels, outcome } = signal;
  return [
    { label: 'Suggested entry', hint: 'Price where the signal started.', value: levels.entry, hitEpoch: null, tone: 'text-ink' },
    { label: 'Stop-loss', hint: 'Exit here to limit the loss.', value: levels.stopLoss, hitEpoch: outcome.slEpoch, tone: 'text-down' },
    { label: 'Take-profit 1', hint: 'First profit level.', value: levels.tp1, hitEpoch: outcome.tp1Epoch, tone: 'text-up' },
    { label: 'Take-profit 2', hint: 'Second profit level.', value: levels.tp2, hitEpoch: outcome.tp2Epoch, tone: 'text-up' },
    { label: 'TAKE PROFIT 3', hint: 'Third profit target.', value: levels.tp3, hitEpoch: outcome.tp3Epoch, tone: 'text-up' },
  ];
}
