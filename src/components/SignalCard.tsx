import { ArrowDownRight, ArrowUpRight, Clock, Loader2, Minus, Target } from 'lucide-react';
import { EntryTime, LevelList, STATUS_TEXT, CurrentPrice, directionExplanation, statusTone } from '@/components/SignalParts';
import { formatDateTime, type Asset, type TfState } from '@/lib/sma';
import type { Signal } from '@/lib/signals';

type Props = {
  asset: Asset;
  tf: TfState;
  loaded: boolean;
  price: number | undefined;
};

export function SignalCard({ asset, tf, loaded, price }: Props) {
  const signal = tf.latestSignal;
  const loading = !loaded || tf.candles.length === 0;
  const isBuy = signal?.direction === 'BUY';
  const isSell = signal?.direction === 'SELL';

  return (
    <div
      className={`hud-panel flex flex-col gap-4 overflow-hidden rounded-2xl border bg-surface/[0.03] p-5 transition-all duration-300 hover:bg-surface/[0.05] ${
        isBuy ? 'border-up/30' : isSell ? 'border-down/30' : 'border-line/10'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="mb-1 truncate text-xs font-semibold uppercase tracking-wider text-accent" title={asset.fullName}>
            {asset.fullName} <span className="font-medium text-ink-3">({asset.symbol})</span>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-lg font-semibold text-ink">{tf.label}</span>
            <span className="truncate text-xs uppercase tracking-wider text-ink-3">{tf.role}</span>
          </div>
        </div>
        {signal && (
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(signal.outcome.status)}`}>
            {STATUS_TEXT[signal.outcome.status]}
          </span>
        )}
      </div>

      {signal ? (
        <>
          <div className="flex items-center gap-3">
            <div
              className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border ${
                isBuy ? 'border-up/40 bg-up/10' : 'border-down/40 bg-down/10'
              }`}
            >
              {isBuy ? <ArrowUpRight className="h-7 w-7 text-up" /> : <ArrowDownRight className="h-7 w-7 text-down" />}
            </div>
            <div className="min-w-0">
              <div className={`text-2xl font-bold tracking-tight ${isBuy ? 'text-up' : 'text-down'}`}>{signal.direction}</div>
              <div className="text-sm text-ink-2">{directionExplanation(signal.direction)}</div>
            </div>
          </div>

          <EntryTime epoch={signal.signalEpoch} direction={signal.direction} />
          <CurrentPrice price={price} entry={signal.levels.entry} direction={signal.direction} digits={asset.digits} />
          <LevelList rows={buildRows(signal)} digits={asset.digits} />

          {signal.outcome.tp3Epoch != null && (
            <div className="flex items-center gap-2 rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm font-semibold text-warn">
              <Target className="h-4 w-4 flex-shrink-0" />
              <span>Target 3 reached at {formatDateTime(signal.outcome.tp3Epoch)}. The trade is complete.</span>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line/15 px-4 py-8 text-center">
          {loading ? <Loader2 className="h-6 w-6 animate-spin text-ink-3" /> : <Minus className="h-6 w-6 text-ink-3" />}
          <div className="text-base font-semibold text-ink-2">{loading ? 'Reading history' : 'No signal yet'}</div>
          <div className="text-sm text-ink-3">
            {loading ? 'Loading the latest candles.' : 'A signal appears when price crosses its average on this timeframe.'}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-line/10 pt-3 text-xs text-ink-2">
        <Clock className="h-3.5 w-3.5 flex-shrink-0 text-ink-3" />
        <span>Updated {formatDateTime(tf.updatedEpoch)}</span>
      </div>
    </div>
  );
}

function buildRows(signal: Signal) {
  const { levels, outcome } = signal;
  return [
    { label: 'Entry', hint: 'Open the trade at this price.', value: levels.entry, hitEpoch: null, tone: 'text-ink' },
    { label: 'Stop-loss', hint: 'Exit here to limit the loss.', value: levels.stopLoss, hitEpoch: outcome.slEpoch, tone: 'text-down' },
    { label: 'Target 1', hint: 'First take-profit level.', value: levels.tp1, hitEpoch: outcome.tp1Epoch, tone: 'text-up' },
    { label: 'Target 2', hint: 'Second take-profit level.', value: levels.tp2, hitEpoch: outcome.tp2Epoch, tone: 'text-up' },
    { label: 'Target 3', hint: 'Final take-profit level.', value: levels.tp3, hitEpoch: outcome.tp3Epoch, tone: 'text-up' },
  ];
}
