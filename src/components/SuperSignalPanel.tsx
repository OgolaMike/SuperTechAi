import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Check, Clock3, Info, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { formatDateTime, formatPrice } from '@/lib/sma';
import { getAiPatternScore, type SignalLearningModel } from '@/lib/aiLearning';
import type { SuperSignal } from '@/lib/intelligence';
import type { SuperSignalRecord } from '@/hooks/useSuperSignalRecords';
import type { TfState } from '@/lib/sma';
import { SignalChartSnapshot } from '@/components/SignalChartSnapshot';

type Props = {
  selectedSignalKey?: string;
  signals: SuperSignal[];
  records: SuperSignalRecord[];
  recordsLoading: boolean;
  recordsError: string | null;
  onRefreshRecords: () => void;
  prices: Record<string, number>;
  loaded: boolean;
  aiModel: SignalLearningModel;
  states: Record<string, Record<number, TfState>>;
};

const TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'H8', 'D1'];

function statesForRecord(record: SuperSignalRecord, states: Record<string, Record<number, TfState>>) {
  return states[record.symbol]?.[900]?.candles ?? [];
}

function signalKey(signal: Pick<SuperSignal, 'symbol' | 'direction' | 'signalEpoch'>) {
  return `${signal.symbol}|900|${signal.signalEpoch}|${signal.direction}`;
}

function fromLiveSignal(signal: SuperSignal): SuperSignalRecord {
  return {
    signal_key: signalKey(signal),
    symbol: signal.symbol,
    asset_name: signal.name,
    digits: signal.digits,
    direction: signal.direction,
    signal_epoch: signal.signalEpoch,
    entry: signal.levels.entry,
    stop_loss: signal.levels.stopLoss,
    tp1: signal.levels.tp1,
    tp2: signal.levels.tp2,
    tp3: signal.levels.tp3,
    band_mean: signal.levels.mean,
    band_deviation: signal.levels.deviation,
    daily_bias: signal.dailyBias,
    reads: signal.reads,
    explanation: signal.explanation,
    grade_percent: signal.gradePercent,
    confirmation_timeframe: signal.confirmationTimeframe,
    confirmation_epoch: signal.confirmationEpoch,
    status: 'Open',
    tp1_hit_epoch: null,
    tp2_hit_epoch: null,
    tp3_hit_epoch: null,
    sl_hit_epoch: null,
    closed: false,
    created_at: new Date(signal.signalEpoch * 1000).toISOString(),
  };
}

export function SuperSignalPanel({
  selectedSignalKey,
  signals, records, recordsLoading, recordsError, onRefreshRecords,
  prices, loaded, aiModel, states,
}: Props) {
  const [selectedKey, setSelectedKey] = useState('');

  const allRecords = useMemo(() => {
    const byKey = new Map(records.map((record) => [record.signal_key, record]));
    for (const signal of signals) {
      const live = fromLiveSignal(signal);
      if (!byKey.has(live.signal_key)) byKey.set(live.signal_key, live);
    }
    return [...byKey.values()].sort((a, b) => b.signal_epoch - a.signal_epoch);
  }, [records, signals]);

  useEffect(() => {
    if (selectedSignalKey && allRecords.some((record) => record.signal_key === selectedSignalKey)) {
      setSelectedKey(selectedSignalKey);
    }
  }, [selectedSignalKey, allRecords]);

  useEffect(() => {
    if (!allRecords.length) {
      setSelectedKey('');
      return;
    }
    if (!allRecords.some((record) => record.signal_key === selectedKey)) {
      setSelectedKey(allRecords[0].signal_key);
    }
  }, [allRecords, selectedKey]);

  const selected = allRecords.find((record) => record.signal_key === selectedKey) ?? allRecords[0];

  if (!loaded && recordsLoading) {
    return <div className="flex items-center gap-3 rounded-2xl border border-line/10 bg-surface/[0.03] p-6 text-sm text-ink-2"><Loader2 className="h-4 w-4 animate-spin text-accent" />Checking the market and loading saved Super Signals…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-3">Super Signal history</div>
          <p className="mt-1 text-sm text-ink-2">Select one signal to inspect its entry, eight-timeframe confirmation and recorded result.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-line/15 bg-surface/[0.04] px-3 py-1.5 text-xs font-semibold text-ink-2">{allRecords.length} saved</span>
          <button type="button" onClick={onRefreshRecords} aria-label="Refresh Super Signal history" className="flex h-9 w-9 items-center justify-center rounded-xl border border-line/10 bg-surface/[0.03] text-ink-2 hover:text-ink">
            <RefreshCw className={`h-4 w-4 ${recordsLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {recordsError && <div className="rounded-xl border border-down/30 bg-down/10 px-4 py-3 text-sm text-down">History could not sync: {recordsError}</div>}

      {allRecords.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-line/10 bg-surface/[0.03] px-6 py-12 text-center">
          <Sparkles className="h-6 w-6 text-accent" />
          <h3 className="text-lg font-semibold text-ink">No Super Signal recorded yet</h3>
          <p className="max-w-md text-sm text-ink-2">When all eight timeframes agree, the signal will be added here and kept for outcome tracking.</p>
        </div>
      ) : (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(250px,0.78fr)_minmax(0,1.7fr)]">
          <div className="min-w-0 space-y-2">
            <div className="max-h-[620px] space-y-2 overflow-y-auto overscroll-y-contain pr-1">
              {allRecords.map((record) => {
                const isSelected = selected?.signal_key === record.signal_key;
                const chartCandles = statesForRecord(record, states);
                return (
                  <div key={record.signal_key} className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setSelectedKey(record.signal_key)}
                      aria-pressed={isSelected}
                      className={`w-full min-w-0 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${isSelected ? 'border-accent/50 bg-accent/10 shadow-[0_0_18px_rgba(212,175,55,0.08)]' : 'border-line/10 bg-surface/[0.025] hover:border-line/25 hover:bg-surface/[0.05]'}`}
                    >
                      <div className="flex min-w-0 items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="break-words text-sm font-bold text-ink">{record.asset_name}</div>
                          <div className="mt-0.5 truncate text-xs text-ink-3">{record.symbol}</div>
                        </div>
                        <span className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-black tracking-wider ${record.direction === 'BUY' ? 'bg-up/10 text-up' : 'bg-down/10 text-down'}`}>{record.direction}</span>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-accent">8/8 CONFIRMED</span><span className="rounded-md border border-up/25 bg-up/10 px-2 py-1 text-[11px] font-black text-up">{record.grade_percent == null ? '—' : `${record.grade_percent}%`}</span>
                        <OutcomeBadge status={record.status} closed={record.closed} />
                      </div>
                      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-3"><Clock3 className="h-3 w-3" />{formatDateTime(record.signal_epoch)}</div>
                    </button>
                    {isSelected && chartCandles.length > 0 && (
                      <div className="min-w-0 overflow-hidden rounded-xl border border-accent/25 bg-surface/[0.025] p-2">
                        <SignalChartSnapshot candles={chartCandles} levels={{ entry: record.entry, stopLoss: record.stop_loss, tp1: record.tp1, tp2: record.tp2, tp3: record.tp3, mean: record.band_mean, deviation: record.band_deviation }} signalEpoch={record.signal_epoch} direction={record.direction} timeframe="M15" digits={record.digits} assetName={record.asset_name} symbol={record.symbol} anchorId={`super-signal-chart-${encodeURIComponent(record.symbol)}-${record.signal_epoch}-${record.direction}`} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {selected && (
            <SuperSignalDetails
              record={selected}
              price={prices[selected.symbol]}
              candles={states[selected.symbol]?.[900]?.candles ?? []}
              aiModel={aiModel}
            />
          )}
        </div>
      )}

      <p className="flex items-start gap-2 text-xs leading-relaxed text-ink-3"><Info className="mt-0.5 h-4 w-4 shrink-0" />Super Signals remain in this history after the live alert disappears. Profit and stop outcomes update from the matching recorded M15 signal.</p>
    </div>
  );
}

function SuperSignalDetails({ record, price, candles, aiModel }: {
  record: SuperSignalRecord;
  price?: number;
  candles: import('@/lib/deriv').Candle[];
  aiModel: SignalLearningModel;
}) {
  const isBuy = record.direction === 'BUY';
  const DirectionIcon = isBuy ? ArrowUpRight : ArrowDownRight;
  const levels = [
    { label: 'Entry', value: record.entry, tone: 'text-ink', hit: null },
    { label: 'Stop-loss', value: record.stop_loss, tone: 'text-down', hit: record.sl_hit_epoch },
    { label: 'Take-profit 1', value: record.tp1, tone: 'text-up', hit: record.tp1_hit_epoch },
    { label: 'Take-profit 2', value: record.tp2, tone: 'text-up', hit: record.tp2_hit_epoch },
    { label: 'Take-profit 3', value: record.tp3, tone: 'text-up', hit: record.tp3_hit_epoch },
  ];
  const score = getAiPatternScore(aiModel, 900, record.direction, {
    entry: record.entry, stopLoss: record.stop_loss, tp1: record.tp1, tp2: record.tp2, tp3: record.tp3,
    mean: record.band_mean, deviation: record.band_deviation,
  });

  return (
    <article className="min-w-0 space-y-4 rounded-2xl border border-line/15 bg-surface/[0.035] p-4 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink-3">Selected Super Signal · 8/8</div>
          <h3 className="mt-1 break-words text-xl font-bold text-ink">{record.asset_name}</h3>
          <p className="text-sm text-ink-3">{record.symbol} · M15 trigger</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-black ${isBuy ? 'border-up/30 bg-up/10 text-up' : 'border-down/30 bg-down/10 text-down'}`}><DirectionIcon className="h-4 w-4" />{record.direction}</span>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/25 bg-accent/[0.06] p-3">
        <div><div className="text-[10px] font-bold uppercase tracking-wider text-ink-3">Signal fired</div><div className="mt-1 text-sm font-semibold text-ink">{formatDateTime(record.signal_epoch)}</div></div>
        <div className="text-right"><div className="text-[10px] font-bold uppercase tracking-wider text-ink-3">Recorded outcome</div><div className="mt-1"><OutcomeBadge status={record.status} closed={record.closed} /></div></div>
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div className="text-xs font-bold uppercase tracking-wider text-ink-3">Eight-timeframe confirmation</div><span className="rounded-lg border border-up/25 bg-up/10 px-3 py-1.5 text-sm font-black text-up">{record.grade_percent == null ? 'Grade unavailable for this older record' : `${record.grade_percent}% · ${record.confirmation_timeframe} completed alignment`}</span></div>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {TIMEFRAMES.map((timeframe) => {
            const read = record.reads.find((item) => item.label === timeframe);
            const agrees = read?.agrees === true;
            return <div key={timeframe} className={`rounded-lg border px-1.5 py-2 text-center ${agrees ? 'border-up/25 bg-up/10 text-up' : 'border-line/10 bg-surface/[0.03] text-ink-3'}`}>
              <div className="text-[10px] font-bold">{timeframe}</div>
              <div className="mt-1 flex justify-center">{agrees ? <Check className="h-3.5 w-3.5" /> : <span className="text-[10px]">—</span>}</div>
            </div>;
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Metric label="8/8 confirmation grade" value={record.grade_percent == null ? "Not recorded" : `${record.grade_percent}%`} />
        <Metric label="Entry price" value={formatPrice(record.entry, record.digits)} />
        <Metric label="Current price" value={price == null ? 'Unavailable' : formatPrice(price, record.digits)} />
        <Metric label="AI pattern score" value={score == null ? 'Learning' : `${score}/100`} />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {levels.map((level) => (
          <div key={level.label} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-line/10 bg-surface/[0.025] p-3">
            <div className="min-w-0"><div className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">{level.label}</div><div className={`mt-1 break-all font-mono text-sm font-bold tabular-nums ${level.tone}`}>{formatPrice(level.value, record.digits)}</div></div>
            <div className="shrink-0 text-right text-[10px] text-ink-3">{level.hit ? <span className={level.tone}>Hit {formatDateTime(level.hit)}</span> : 'Not hit'}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-line/10 bg-surface/[0.025] p-3">
        <div className="text-[10px] font-bold uppercase tracking-wider text-ink-3">What confirmed it</div>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">{record.explanation || 'All eight timeframes confirmed the same direction at the time this signal fired.'}</p>
      </div>


    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-xl border border-line/10 bg-surface/[0.025] p-3"><div className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">{label}</div><div className="mt-1 break-words font-mono text-sm font-bold text-ink">{value}</div></div>;
}

function OutcomeBadge({ status, closed }: { status: SuperSignalRecord['status']; closed: boolean }) {
  const tone = status === 'TP1' || status === 'TP2' || status === 'TP3'
    ? 'border-up/25 bg-up/10 text-up'
    : status === 'Stopped' ? 'border-down/25 bg-down/10 text-down'
    : 'border-accent/25 bg-accent/10 text-accent';
  const label = status === 'Open' ? 'Open' : status === 'Stopped' ? 'Stop hit' : status === 'Reversed' ? 'Reversed' : `${status} hit`;
  return <span className={`inline-flex w-fit rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${tone}`}>{closed ? `Closed · ${label}` : label}</span>;
}
