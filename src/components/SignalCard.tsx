import { useEffect, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Clock, Loader2, Minus, Target, ZoomIn, ZoomOut } from 'lucide-react';
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
          <SignalChartSnapshot candles={tf.chartCandles ?? tf.candles} levels={signal.levels} signalEpoch={signal.signalEpoch} direction={signal.direction} timeframe={tf.label} granularity={tf.granularity} digits={asset.digits} assetName={asset.fullName} symbol={asset.symbol} anchorId={`signal-chart-${encodeURIComponent(asset.symbol)}-${tf.granularity}`} />

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

      <div className="flex items-center gap-2 border-t border-line/10 pt-3 text-xs text-ink-2">
        <Clock className="h-3.5 w-3.5 flex-shrink-0 text-ink-3" />
        <span>Last update: {formatDateTime(tf.updatedEpoch)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/10 bg-[#0c1423] px-4 py-3 text-[10px] text-slate-300"><span className="font-semibold text-cyan-200">NO CROSS SIGNAL</span><span>Market data remains active; BUY/SELL appears only after a confirmed candle-close crossover.</span></div>
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
  const [nowEpoch, setNowEpoch] = useState(() => Math.floor(Date.now() / 1000));
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const timer = window.setInterval(() => setNowEpoch(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const history = candles;
  const start = Math.max(0, history.length - 60);
  const data = history.slice(start);
  const stats = data.map((_, index) => {
    const end = start + index;
    if (end < 59) return null;
    const closes = history.slice(end - 59, end + 1).map(c => c.close);
    const mean = closes.reduce((sum, value) => sum + value, 0) / 60;
    const variance = closes.reduce((sum, value) => sum + (value - mean) ** 2, 0) / 60;
    const deviation = Math.sqrt(variance);
    return { mean, upper: mean + deviation * 2.5, lower: mean - deviation * 2.5 };
  });
  const latestStats = stats[stats.length - 1];
  const latest = data[data.length - 1];
  const secondsRemaining = latest ? Math.max(0, latest.epoch + 86400 - nowEpoch) : 0;
  const hours = Math.floor(secondsRemaining / 3600);
  const minutes = Math.floor((secondsRemaining % 3600) / 60);
  const seconds = secondsRemaining % 60;

  if (data.length < 2) {
    return (
      <div className="overflow-hidden rounded-xl border border-line/10 bg-[#080d18] text-white">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-200">Daily candles · D1</p>
            <p className="mt-1 text-xs text-slate-400">{assetName}</p>
          </div>
          <span className="text-[10px] font-semibold text-slate-400">NO SIGNAL · PRICE CHART</span>
        </div>
        <div className="grid min-h-40 place-items-center px-4 py-8 text-center text-xs text-slate-400">
          {loading ? 'Loading daily candle history…' : 'Daily candle history is not available yet.'}
        </div>
      </div>
    );
  }

  const W = 1200;
  const H = 340;
  const PAD = { top: 24, right: 112, bottom: 40, left: 24 };
  const values = data.flatMap((candle, index) => [candle.high, candle.low, stats[index]?.upper ?? candle.high, stats[index]?.lower ?? candle.low]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, Math.abs(max) * 0.00001, 0.000001);
  const plotWidth = W - PAD.left - PAD.right;
  const slots = Math.max(1, data.length - 1) + 7;
  const x = (index: number) => PAD.left + index / slots * plotWidth;
  const y = (price: number) => PAD.top + (max - price) / range * (H - PAD.top - PAD.bottom);
  const bodyWidth = Math.max(5, Math.min(18, plotWidth / data.length * 0.62));
  const grid = Array.from({ length: 6 }, (_, index) => max - range * index / 5);
  const indicatorPath = (key: 'mean' | 'upper' | 'lower') => stats.map((item, index) => item ? `${index === 0 || !stats[index - 1] ? 'M' : 'L'} ${x(index)} ${y(item[key])}` : '').filter(Boolean).join(' ');
  const dateLabel = (epoch: number) => new Date(epoch * 1000).toLocaleDateString([], { day: '2-digit', month: 'short' });
  const priceLabel = (value: number) => value.toFixed(digits);
  const marketBias = latestStats ? (latest!.close > latestStats.mean ? 'Above SMA 60 · upward bias' : latest!.close < latestStats.mean ? 'Below SMA 60 · downward bias' : 'At SMA 60 · neutral') : 'SMA 60 warming up';

  return (
    <div className="overflow-hidden rounded-xl border border-line/10 bg-[#080d18] text-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#0c1423] px-4 py-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-200">Daily candles · D1</p>
          <p className="mt-1 text-[11px] text-slate-400">{assetName} · latest 60 candles · live market analysis</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setZoom(value => Math.max(1, value - 0.5))} disabled={zoom <= 1} aria-label="Zoom out daily chart" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/20 bg-white/[0.04] text-slate-200 disabled:opacity-30"><ZoomOut className="h-4 w-4" /></button>
          <span className="min-w-8 text-center text-[10px] tabular-nums text-slate-300">{zoom.toFixed(1)}×</span>
          <button type="button" onClick={() => setZoom(value => Math.min(3, value + 0.5))} disabled={zoom >= 3} aria-label="Zoom in daily chart" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/20 bg-white/[0.04] text-slate-200 disabled:opacity-30"><ZoomIn className="h-4 w-4" /></button>
          <div className="rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-right">
          <p className="text-[9px] font-bold uppercase tracking-wider text-cyan-200/70">Daily candle closes in</p>
          <p className="mt-0.5 font-mono text-sm font-black tabular-nums text-cyan-100">
            {secondsRemaining > 0 ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : 'Updating…'}
          </p>
          </div>
        </div>
      </div>
      {latest && <div className="grid grid-cols-2 gap-2 border-b border-white/10 bg-[#0a1220] p-3 sm:grid-cols-4">
        <div className="rounded-lg border border-white/10 bg-white/[0.035] p-2"><p className="text-[9px] uppercase tracking-wider text-slate-400">Current price</p><p className="mt-1 text-sm font-bold tabular-nums text-white">{priceLabel(livePrice ?? latest.close)}</p></div>
        <div className="rounded-lg border border-amber-300/20 bg-amber-300/[0.06] p-2"><p className="text-[9px] uppercase tracking-wider text-amber-200/70">SMA 60</p><p className="mt-1 text-sm font-bold tabular-nums text-amber-100">{latestStats ? priceLabel(latestStats.mean) : 'Warming up'}</p></div>
        <div className="rounded-lg border border-rose-300/20 bg-rose-300/[0.06] p-2"><p className="text-[9px] uppercase tracking-wider text-rose-200/70">Upper band +2.5σ</p><p className="mt-1 text-sm font-bold tabular-nums text-rose-100">{latestStats ? priceLabel(latestStats.upper) : 'Warming up'}</p></div>
        <div className="rounded-lg border border-blue-300/20 bg-blue-300/[0.06] p-2"><p className="text-[9px] uppercase tracking-wider text-blue-200/70">Lower band −2.5σ</p><p className="mt-1 text-sm font-bold tabular-nums text-blue-100">{latestStats ? priceLabel(latestStats.lower) : 'Warming up'}</p></div>
      </div>}
      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Latest 60 daily candlesticks for ${assetName}; no active signal`} style={{ width: `${zoom * 100}%`, minWidth: '560px', height: 'auto', display: 'block' }}>
          {grid.map((value, index) => <g key={index}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(value)} y2={y(value)} stroke="#94a3b8" strokeOpacity=".16" strokeDasharray="3 7" />
            <text x={W - PAD.right + 8} y={y(value) + 4} fill="#94a3b8" fontSize="12">{priceLabel(value)}</text>
          </g>)}
          {indicatorPath('upper') && <path d={indicatorPath('upper')} fill="none" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" />}
          {indicatorPath('mean') && <path d={indicatorPath('mean')} fill="none" stroke="#facc15" strokeWidth="3" strokeLinecap="round" />}
          {indicatorPath('lower') && <path d={indicatorPath('lower')} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" />}
          {data.map((candle, index) => {
            const bullish = candle.close >= candle.open;
            const color = bullish ? '#34d399' : '#fb7185';
            const top = y(Math.max(candle.open, candle.close));
            const bottom = y(Math.min(candle.open, candle.close));
            return <g key={candle.epoch}>
              <line x1={x(index)} x2={x(index)} y1={y(candle.high)} y2={y(candle.low)} stroke={color} strokeWidth="2" />
              <rect x={x(index) - bodyWidth / 2} y={top} width={bodyWidth} height={Math.max(2, bottom - top)} rx="1.2" fill={color} />
            </g>;
          })}
          {[...new Set([0, Math.floor((data.length - 1) / 2), data.length - 1])].map(index => <text key={index} x={x(index)} y={H - 12} textAnchor="middle" fill="#94a3b8" fontSize="11">{dateLabel(data[index].epoch)}</text>)}
          {latestStats && <><text x={PAD.left + 8} y={PAD.top + 14} fill="#facc15" fontSize="10" fontWeight="700">SMA 60</text><text x={PAD.left + 72} y={PAD.top + 14} fill="#f87171" fontSize="10" fontWeight="700">BB HIGH</text><text x={PAD.left + 145} y={PAD.top + 14} fill="#60a5fa" fontSize="10" fontWeight="700">BB LOW</text></>}
          <rect x={W - PAD.right + 4} y={y(latest!.close) - 12} width="104" height="24" rx="4" fill="#e2e8f0" />
          <text x={W - PAD.right + 56} y={y(latest!.close) + 4} textAnchor="middle" fill="#0f172a" fontSize="12" fontWeight="800">{priceLabel(latest!.close)}</text>
        </svg>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-[#0c1423] px-4 py-3 text-[10px] text-slate-300"><span className="font-semibold text-cyan-200">NO CROSS SIGNAL</span><span>{marketBias} · BUY/SELL only after a confirmed candle-close cross.</span></div>
    </div>
  );
}
