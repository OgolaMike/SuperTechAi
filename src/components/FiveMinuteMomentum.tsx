import { Activity, ArrowDownRight, ArrowUpRight, Clock3, Info } from 'lucide-react';
import type { Asset, TfState } from '@/lib/sma';
import { SignalChartSnapshot } from '@/components/SignalChartSnapshot';

type Props = {
  asset?: Asset;
  state?: TfState;
  currentPrice: number | null;
  nowEpoch: number;
  loaded: boolean;
};

const THIRTY_MINUTES = 1800;

function price(value: number, digits: number) {
  return value.toFixed(Math.min(8, Math.max(0, digits)));
}

export function FiveMinuteMomentum({ asset, state, currentPrice, nowEpoch, loaded }: Props) {
  const closed = [...(state?.candles ?? [])].sort((a, b) => a.epoch - b.epoch);
  const previous = closed[closed.length - 2];
  const latest = closed[closed.length - 1];
  const chartCandles = [...(state?.chartCandles ?? [])].sort((a, b) => a.epoch - b.epoch);
  const forming = chartCandles.find((candle) => candle.epoch <= nowEpoch && candle.epoch + THIRTY_MINUTES > nowEpoch);
  // Preserve the original EA's condition order: Higher High is checked before Lower Low.
  const direction = latest && previous
    ? latest.high > previous.high ? 'BUY'
      : latest.low < previous.low ? 'SELL'
      : null
    : null;
  const secondsLeft = forming ? Math.max(0, forming.epoch + THIRTY_MINUTES - nowEpoch) : null;
  const countdown = secondsLeft == null
    ? '--:--'
    : `${String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:${String(secondsLeft % 60).padStart(2, '0')}`;
  const digits = asset?.digits ?? 4;
  const ready = Boolean(loaded && forming && latest && previous && direction);

  return (
    <section className="mt-8 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Independent price-action engine</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Thirty Minute Momentum</h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-2">Raw Higher High / Lower Low logic. One M30 candle per trade window. No indicators or extra confirmation.</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-line/20 bg-surface/[0.05] px-3 py-1.5 text-xs font-semibold text-ink-2"><Activity className="h-4 w-4 text-accent" /> M30 · 1800 seconds</span>
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-ink">Live M30 chart</h3>
          <p className="mt-1 text-xs text-ink-3">Dedicated 30-minute candlestick view for this strategy, using its own M30 candle feed.</p>
        </div>
        <SignalChartSnapshot
          candles={chartCandles}
          timeframe="M30 MOMENTUM"
          granularity={THIRTY_MINUTES}
          digits={digits}
          assetName={asset?.name ?? 'Selected market'}
          symbol={asset?.symbol ?? '—'}
          anchorId={`m30-momentum-chart-${encodeURIComponent(asset?.symbol ?? 'none')}`}
          direction={direction ?? undefined}
          signalEpoch={latest?.epoch}
          livePrice={currentPrice ?? undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <article className={`relative overflow-hidden rounded-2xl border p-5 sm:p-6 ${ready && direction === 'BUY' ? 'border-emerald-400/40 bg-emerald-500/[0.055]' : ready && direction === 'SELL' ? 'border-rose-400/40 bg-rose-500/[0.055]' : 'border-line/15 bg-surface/[0.035]'}`}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-ink-3">Current M30 decision</p>
            <span className="rounded-full border border-line/20 px-2.5 py-1 text-[10px] font-semibold text-ink-2">{asset?.symbol ?? 'Select an asset'}</span>
          </div>
          {ready ? (
            <>
              <div className="mt-5 flex items-center gap-3">
                <span className={`grid h-14 w-14 place-items-center rounded-2xl ${direction === 'BUY' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>
                  {direction === 'BUY' ? <ArrowUpRight className="h-8 w-8" /> : <ArrowDownRight className="h-8 w-8" />}
                </span>
                <div>
                  <p className={`text-3xl font-black tracking-tight ${direction === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}`}>{direction}</p>
                  <p className="mt-0.5 text-sm text-ink-2">{direction === 'BUY' ? 'Higher High detected' : 'Lower Low detected'}</p>
                </div>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-line/10 bg-canvas/50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-ink-3">M30 candle open</p>
                  <p className="mt-1 font-mono text-lg font-bold text-ink">{forming ? price(forming.open, digits) : '—'}</p>
                </div>
                <div className="rounded-xl border border-line/10 bg-canvas/50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-ink-3">Current price</p>
                  <p className="mt-1 font-mono text-lg font-bold text-ink">{currentPrice == null ? '—' : price(currentPrice, digits)}</p>
                </div>
              </div>
            </>
          ) : (
            <div className="mt-7 rounded-xl border border-line/10 bg-canvas/40 p-5">
              <p className="text-lg font-semibold text-ink">{!loaded ? 'Connecting to market data…' : !forming ? 'Waiting for the current M30 candle…' : closed.length < 2 ? 'Collecting two completed M30 candles…' : 'No Higher High or Lower Low'}</p>
              <p className="mt-1 text-sm text-ink-2">The engine only compares completed candles. It does not predict a direction when neither rule is met.</p>
            </div>
          )}
          <div className="mt-5 flex items-center justify-between border-t border-line/10 pt-4">
            <div className="flex items-center gap-2 text-xs text-ink-2"><Clock3 className="h-4 w-4 text-accent" /> Candle window remaining</div>
            <span className="font-mono text-xl font-black tabular-nums text-ink">{countdown}</span>
          </div>
        </article>

        <article className="rounded-2xl border border-line/15 bg-surface/[0.035] p-5">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-ink-3">Unchanged strategy rules</p>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-emerald-400/20 bg-emerald-500/[0.05] p-3"><span className="text-sm font-semibold text-ink">Higher High</span><span className="text-sm font-black text-emerald-400">BUY</span></div>
            <div className="flex items-center justify-between rounded-xl border border-rose-400/20 bg-rose-500/[0.05] p-3"><span className="text-sm font-semibold text-ink">Lower Low</span><span className="text-sm font-black text-rose-400">SELL</span></div>
            <div className="flex items-center justify-between rounded-xl border border-line/10 p-3"><span className="text-sm text-ink-2">Entry</span><strong className="text-sm text-ink">M30 candle open</strong></div>
            <div className="flex items-center justify-between rounded-xl border border-line/10 p-3"><span className="text-sm text-ink-2">Exit</span><strong className="text-sm text-ink">Next M30 boundary</strong></div>
            <div className="flex items-center justify-between rounded-xl border border-line/10 p-3"><span className="text-sm text-ink-2">Concurrent trades</span><strong className="text-sm text-ink">One</strong></div>
          </div>
          <div className="mt-4 flex gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] p-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <p className="text-xs leading-5 text-ink-2">This screen monitors the selected asset's M30 price action. Broker execution is configured separately under MT5 Auto Trading: connect the Windows worker, select the exact broker symbol and explicitly enable Thirty Minute Momentum. This dashboard monitor does not itself submit orders.</p>
          </div>
        </article>
      </div>
      {latest && previous && (
        <div className="rounded-xl border border-line/10 bg-surface/[0.025] p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-3">Last completed candle comparison</p>
          <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-xs text-ink-3">Previous high / low</p><p className="mt-1 font-mono text-ink">{price(previous.high, digits)} / {price(previous.low, digits)}</p></div>
            <div><p className="text-xs text-ink-3">Latest high / low</p><p className="mt-1 font-mono text-ink">{price(latest.high, digits)} / {price(latest.low, digits)}</p></div>
          </div>
          <p className="mt-2 text-[11px] text-ink-3">If one candle makes both a Higher High and a Lower Low, BUY takes precedence, matching the original EA's condition order.</p>
        </div>
      )}
    </section>
  );
}
