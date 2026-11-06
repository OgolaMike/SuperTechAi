import { AlertTriangle, ArrowDownRight, ArrowUpRight, Info } from 'lucide-react';
import type { Asset, TfState } from '@/lib/sma';
import type { Direction } from '@/lib/signals';

type Props = {
  assets: Asset[];
  states: Record<string, Record<number, TfState>>;
  nowEpoch: number;
};

type Bias = 'Bullish' | 'Bearish' | 'Neutral' | 'No data';

type Read = { label: string; bias: Bias };

const PRIMARY_GRANULARITY = 900;
const DAY = 86400;
const LOOKBACK_SECONDS = 8 * PRIMARY_GRANULARITY;

function biasFromState(state: TfState | undefined, nowEpoch: number): Bias {
  if (!state || state.updatedEpoch == null || state.lastClose == null ||
      state.currentSma == null || state.stdDev == null ||
      nowEpoch - (state.updatedEpoch + state.granularity) > 2 * state.granularity) {
    return 'No data';
  }
  const distance = state.lastClose - state.currentSma;
  const neutralBand = state.stdDev * 0.1;
  if (distance > neutralBand) return 'Bullish';
  if (distance < -neutralBand) return 'Bearish';
  return 'Neutral';
}

function expectedBias(direction: Direction): Bias {
  return direction === 'BUY' ? 'Bullish' : 'Bearish';
}

function interpretation(direction: Direction, reads: Read[]): { title: string; detail: string; confirmation: string } {
  const expected = expectedBias(direction);
  const higher = reads.filter((read) => ['H1', 'H4', 'H8', 'D1'].includes(read.label));
  const opposing = higher.filter((read) => read.bias !== 'No data' && read.bias !== 'Neutral' && read.bias !== expected);
  const aligned = higher.filter((read) => read.bias === expected);
  const majorOpposition = opposing.some((read) => ['H4', 'H8', 'D1'].includes(read.label));

  if (opposing.length === 0 && aligned.length >= 2) {
    return {
      title: 'Higher-timeframe support',
      detail: 'The higher-timeframe readings available support this direction. This is stronger confluence, not a guarantee; wait for the normal entry conditions.',
      confirmation: 'Require the next relevant candle close to hold the signal direction and ensure no higher-timeframe data is stale.',
    };
  }
  if (majorOpposition) {
    return {
      title: 'Likely pullback risk — not a confirmed trend change',
      detail: `The ${direction} move conflicts with ${opposing.map((read) => read.label).join(', ')}. It may be a short-term retracement against the broader trend rather than a durable reversal.`,
      confirmation: 'Do not promote this to a high-confluence reversal until H1/M30 structure turns and a completed candle confirms the change; major H4/H8/D1 opposition must be resolved.',
    };
  }
  if (opposing.length > 0) {
    return {
      title: 'Potential reversal — confirmation pending',
      detail: `The short-term move has some higher-timeframe support, but ${opposing.map((read) => read.label).join(', ')} still disagree. Treat this as developing evidence, not a confirmed trend change.`,
      confirmation: 'Wait for a completed M30 and H1 candle to confirm the direction, then reassess H4 and daily context.',
    };
  }
  return {
    title: 'Insufficient higher-timeframe evidence',
    detail: 'One or more important timeframe readings are unavailable or neutral. The system should not infer a reversal from missing data.',
    confirmation: 'Wait until valid H1, H4, H8 and D1 context is available before assigning high-confluence status.',
  };
}

export function ReversalContextPanel({ assets, states, nowEpoch }: Props) {
  const items = assets.flatMap((asset) => {
    const byTimeframe = states[asset.symbol];
    const primary = byTimeframe?.[PRIMARY_GRANULARITY];
    const signal = primary?.latestSignal;
    if (!signal || signal.outcome.closed || nowEpoch - signal.signalEpoch > LOOKBACK_SECONDS) return [];
    const reads: Read[] = [
      { label: 'H1', bias: biasFromState(byTimeframe?.[3600], nowEpoch) },
      { label: 'H4', bias: biasFromState(byTimeframe?.[14400], nowEpoch) },
      { label: 'H8', bias: biasFromState(byTimeframe?.[28800], nowEpoch) },
      { label: 'D1', bias: biasFromState(byTimeframe?.[DAY], nowEpoch) },
    ];
    const expected = expectedBias(signal.direction);
    if (!reads.some((read) => read.bias !== 'No data' && read.bias !== 'Neutral' && read.bias !== expected)) return [];
    return [{ asset, signal, reads, ...interpretation(signal.direction, reads) }];
  });

  return (
    <section className="mt-8 space-y-4" aria-label="Higher-timeframe reversal context">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-warn" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Higher-timeframe reversal intelligence</p>
          <h3 className="text-lg font-semibold text-ink">Understand the move before trading it</h3>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="rounded-2xl border border-line/10 bg-surface/[0.03] p-5 text-sm text-ink-2">
          No recent M15 reversal conflicts detected. The panel only appears when a recent, open M15 signal disagrees with valid higher-timeframe context.
        </div>
      ) : items.map(({ asset, signal, reads, title, detail, confirmation }) => {
        const Icon = signal.direction === 'BUY' ? ArrowUpRight : ArrowDownRight;
        return (
          <article key={`${asset.symbol}-${signal.signalEpoch}`} className="rounded-2xl border border-warn/20 bg-surface/[0.04] p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-ink">{asset.name} <span className="text-ink-3">({asset.symbol})</span></p>
                <p className="mt-1 flex items-center gap-1 text-xs text-ink-3"><Icon className="h-3.5 w-3.5" /> M15 {signal.direction} reversal attempt · completed signal candle</p>
              </div>
              <span className="rounded-full border border-warn/30 bg-warn/10 px-3 py-1 text-xs font-semibold text-warn">{title}</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {reads.map((read) => (
                <div key={read.label} className="rounded-lg border border-line/10 bg-surface/[0.03] p-3">
                  <p className="text-xs text-ink-3">{read.label}</p>
                  <p className={`mt-1 text-sm font-semibold ${read.bias === expectedBias(signal.direction) ? 'text-up' : read.bias === 'No data' ? 'text-ink-3' : 'text-warn'}`}>{read.bias}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm leading-relaxed text-ink-2">{detail}</p>
            <p className="mt-2 flex items-start gap-2 text-sm leading-relaxed text-ink-2"><Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" />{confirmation}</p>
          </article>
        );
      })}
    </section>
  );
}
