import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDownRight, ArrowUpRight, Clock, Loader2, Minus, Target, X } from 'lucide-react';
import { EntryTime, LevelList, STATUS_TEXT, CurrentPrice, directionExplanation, statusTone } from '@/components/SignalParts';
import { getAiPatternScore, type SignalLearningModel } from '@/lib/aiLearning';
import { formatDateTime, type Asset, type TfState } from '@/lib/sma';
import type { Signal } from '@/lib/signals';
import type { Candle } from '@/lib/deriv';
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
  const [chartOpen, setChartOpen] = useState(false);
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
    <div role={signal ? 'group' : undefined} tabIndex={signal ? 0 : undefined} onClick={(event) => { if (signal && !(event.target as HTMLElement).closest('button')) setChartOpen(true); }} onKeyDown={(event) => { if (signal && !(event.target as HTMLElement).closest('button') && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setChartOpen(true); } }} aria-label={signal ? `Open live ${asset.fullName} ${tf.label} ${signal.direction} signal chart` : undefined} className={`hud-panel flex min-w-0 flex-col gap-4 overflow-hidden rounded-2xl border bg-surface/[0.03] p-4 transition-all duration-300 hover:bg-surface/[0.05] sm:p-5 ${signal ? 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2' : ''} ${
      isBuy ? 'border-up/30' : isSell ? 'border-down/30' : 'border-line/10'
    }`}>
      <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 max-w-full flex-1">
          <div className="mb-1 break-words whitespace-normal text-xs font-semibold uppercase tracking-wider text-accent" title={asset.fullName}>
            {asset.fullName} <span className="font-medium text-ink-3">({asset.symbol})</span>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-lg font-semibold text-ink">{tf.label}</span>
            <span className="break-words whitespace-normal text-xs uppercase tracking-wider text-ink-3">{tf.role}</span>
          </div>
          {signal && <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent/80">Tap anywhere to open live chart</p>}
        </div>
        {signal && (
          <span className={`max-w-full whitespace-normal break-words rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-relaxed sm:px-3 sm:text-xs ${statusTone(signal.outcome.status)}`}>
            {STATUS_TEXT[signal.outcome.status]}
          </span>
        )}
      </div>

      {signal ? (
        <>
          <div className="flex min-w-0 items-start gap-3">
            <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border ${
              isBuy ? 'border-up/40 bg-up/10' : 'border-down/40 bg-down/10'
            }`}>
              {isBuy ? <ArrowUpRight className="h-7 w-7 text-up" /> : <ArrowDownRight className="h-7 w-7 text-down" />}
            </div>
            <div className="min-w-0">
              <div className={`text-xl font-bold tracking-tight sm:text-2xl ${isBuy ? 'text-up' : 'text-down'}`}>
                {signal.direction === 'BUY' ? 'BUY — UP' : 'SELL — DOWN'}
              </div>
              <div className="min-w-0 break-words text-sm leading-relaxed text-ink-2">{directionExplanation(signal.direction)}</div>
            </div>
          </div>

          {confluenceCount !== undefined && (
            <div className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 px-4 py-3 ${gradeTone}`}>
              <div className="min-w-0 flex-1">
                <div className="break-words text-[10px] font-bold uppercase leading-relaxed tracking-[0.12em] opacity-80">8-timeframe signal grade</div>
                <div className="mt-0.5 text-xs opacity-80">{confluenceCount === 8 ? 'SUPER SIGNAL · All timeframes agree' : confluenceCount >= 6 ? 'Strong alignment' : confluenceCount >= 4 ? 'Moderate alignment' : 'Limited alignment'}</div>
              </div>
              <div className="text-3xl font-black tabular-nums">{confluenceCount}<span className="text-lg font-bold opacity-70">/8</span></div>
            </div>
          )}

          <div className="min-w-0 rounded-xl border border-line/10 bg-surface/[0.03] px-4 py-3">
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
          <SignalChartSnapshot candles={tf.chartCandles ?? tf.candles} levels={signal.levels} signalEpoch={signal.signalEpoch} direction={signal.direction} timeframe={tf.label} granularity={tf.granularity} digits={asset.digits} assetName={asset.fullName} symbol={asset.symbol} anchorId={`signal-chart-${encodeURIComponent(asset.symbol)}-${tf.granularity}`} livePrice={price} />

          {signal.outcome.tp3Epoch != null && (
            <div className="flex items-center gap-2 rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm font-semibold text-warn">
              <Target className="h-4 w-4 flex-shrink-0" />
              <span>TAKE PROFIT 3 reached at {formatDateTime(signal.outcome.tp3Epoch)}. This signal is complete.</span>
            </div>
          )}
        </>
      ) : tf.granularity === 86400 ? (
        <DailyCandlesEmptyState candles={tf.chartCandles?.length ? tf.chartCandles : tf.candles} assetName={asset.fullName} digits={asset.digits} loading={loading} livePrice={price} />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line/15 px-4 py-8 text-center">
          {loading ? <Loader2 className="h-6 w-6 animate-spin text-ink-3" /> : <Minus className="h-6 w-6 text-ink-3" />}
          <div className="text-base font-semibold text-ink-2">{loading ? 'Loading market data' : 'No new signal'}</div>
          <div className="text-sm text-ink-3">
            {loading ? 'Waiting for recent price data.' : 'A signal appears when price crosses its average after a candle closes.'}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-line/10 pt-3 text-xs leading-relaxed text-ink-2">
        <Clock className="h-3.5 w-3.5 flex-shrink-0 text-ink-3" />
        <span>Last update: {formatDateTime(tf.updatedEpoch)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/10 bg-[#0c1423] px-4 py-3 text-[10px] leading-relaxed text-slate-300"><span className="font-semibold text-cyan-200">NO CROSS SIGNAL</span><span>Market data remains active; BUY/SELL appears only after a confirmed candle-close crossover.</span></div>
      {chartOpen && signal && createPortal((
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#050914]/95 p-3 backdrop-blur-md sm:p-6" onClick={(event) => event.stopPropagation()}>
          <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/15 bg-[#0c1423] p-4 text-white shadow-2xl">
              <div className="min-w-0">
                <p className="break-words text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Live signal detail</p>
                <h2 className="mt-1 break-words text-lg font-bold sm:text-2xl">{asset.fullName} <span className="text-sm font-medium text-slate-400">({asset.symbol})</span></h2>
                <p className={`mt-1 text-sm font-bold ${isBuy ? 'text-blue-300' : 'text-rose-300'}`}>{signal.direction === 'BUY' ? 'BUY — UP' : 'SELL — DOWN'} · {tf.label}</p>
              </div>
              <button type="button" onClick={() => setChartOpen(false)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10" aria-label="Close live signal chart"><X className="h-4 w-4" /> Close</button>
            </div>
            <SignalChartSnapshot candles={tf.chartCandles ?? tf.candles} levels={signal.levels} signalEpoch={signal.signalEpoch} direction={signal.direction} timeframe={tf.label} granularity={tf.granularity} digits={asset.digits} assetName={asset.fullName} symbol={asset.symbol} anchorId={`signal-detail-chart-${encodeURIComponent(asset.symbol)}-${tf.granularity}`} livePrice={price} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-white/10 bg-[#0c1423] p-3 text-white"><p className="text-[10px] font-semibold uppercase text-slate-400">Entry</p><p className="mt-1 break-all font-mono text-sm font-bold tabular-nums">{signal.levels.entry.toFixed(asset.digits)}</p></div>
              <div className="rounded-xl border border-rose-400/20 bg-[#0c1423] p-3 text-white"><p className="text-[10px] font-semibold uppercase text-rose-300">Stop loss</p><p className="mt-1 break-all font-mono text-sm font-bold tabular-nums">{signal.levels.stopLoss.toFixed(asset.digits)}</p></div>
              <div className="rounded-xl border border-emerald-400/20 bg-[#0c1423] p-3 text-white"><p className="text-[10px] font-semibold uppercase text-emerald-300">Take profit 1</p><p className="mt-1 break-all font-mono text-sm font-bold tabular-nums">{signal.levels.tp1.toFixed(asset.digits)}</p></div>
              <div className="rounded-xl border border-emerald-400/20 bg-[#0c1423] p-3 text-white"><p className="text-[10px] font-semibold uppercase text-emerald-300">Take profit 3</p><p className="mt-1 break-all font-mono text-sm font-bold tabular-nums">{signal.levels.tp3.toFixed(asset.digits)}</p></div>
            </div>
            <p className="pb-4 text-center text-xs leading-relaxed text-slate-400">Live market data updates as new prices and candles arrive. A signal is not a guarantee of profit.</p>
          </div>
        </div>
      ), document.body)}
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


function DailyCandlesEmptyState({ candles, assetName, digits, loading, livePrice }: {
  candles: Candle[];
  assetName: string;
  digits: number;
  loading: boolean;
  livePrice?: number;
}) {
  if (candles.length < 2) {
    return (
      <div className="rounded-xl border border-line/20 bg-surface/[0.03] px-4 py-8 text-center text-xs text-ink-3">
        {loading ? 'Loading daily candle history…' : 'Daily candle history is not available yet.'}
      </div>
    );
  }

  return (
    <SignalChartSnapshot
      candles={candles}
      timeframe="D1"
      granularity={86400}
      digits={digits}
      assetName={assetName}
      symbol=""
      anchorId={`daily-chart-${encodeURIComponent(assetName)}`}
      livePrice={livePrice}
    />
  );
}
