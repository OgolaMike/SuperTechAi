import { useEffect, useMemo, useState } from 'react';
import { Clock3, Info } from 'lucide-react';
import { buildM15StopOrderIdeas, mergeTrackedStopOrders, type M15StopIdea } from '@/lib/stopOrders';
import { LevelList } from '@/components/SignalParts';
import { PendingOrderChart } from '@/components/PendingOrderChart';
import type { TimeframeStates } from '@/hooks/useDerivSignals';
import type { SignalLearningModel } from '@/lib/aiLearning';
import type { Asset } from '@/lib/sma';
import { formatDateTime, formatPrice } from '@/lib/sma';

const STORAGE_KEY = 'supertech-price-action-pending-history-v2';
type Props = {
  assets: Asset[];
  states: Record<string, TimeframeStates>;
  prices: Record<string, number>;
  aiModel: SignalLearningModel;
  nowEpoch: number;
  loaded: boolean;
};

function loadTrackedOrders(): M15StopIdea[] {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(stored) ? stored.filter((order: M15StopIdea) =>
      (order.patternType === 'TRIPLE BOTTOM' || order.patternType === 'TRIPLE TOP') &&
      Number.isFinite(order.entry) && Number.isFinite(order.stopLoss) && Number.isFinite(order.takeProfit)) : [];
  } catch { return []; }
}

export function PendingOrdersPanel({ assets, states, prices, aiModel, nowEpoch, loaded }: Props) {
  const [trackedOrders, setTrackedOrders] = useState<M15StopIdea[]>(loadTrackedOrders);
  const [category, setCategory] = useState<'TRIPLE BOTTOM' | 'TRIPLE TOP'>('TRIPLE BOTTOM');
  const [filter, setFilter] = useState<'active' | 'results' | 'all'>('active');
  const liveIdeas = useMemo(
    () => buildM15StopOrderIdeas(assets, states, prices, aiModel, nowEpoch),
    [assets, states, prices, aiModel, nowEpoch],
  );

  useEffect(() => {
    if (!loaded) return;
    setTrackedOrders(previous => {
      const next = mergeTrackedStopOrders(previous, liveIdeas);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* in-memory tracking remains available */ }
      return next;
    });
  }, [loaded, liveIdeas]);

  const categoryOrders = useMemo(() => trackedOrders.filter(order => order.patternType === category), [trackedOrders, category]);
  const activeCount = categoryOrders.filter(order => order.status === 'WAITING' || order.status === 'ENTRY HIT').length;
  const resultCount = categoryOrders.length - activeCount;
  const visibleOrders = categoryOrders.filter(order => filter === 'all' ? true : filter === 'active'
    ? order.status === 'WAITING' || order.status === 'ENTRY HIT'
    : order.status === 'TARGET HIT' || order.status === 'STOP-LOSS HIT' || order.status === 'INVALIDATED' || order.status === 'EXPIRED');

  return (
    <section className="mt-8 min-w-0 w-full space-y-6 overflow-x-hidden">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Pure price-action · all assets · all timeframes</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Pending Orders</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-2">
          Finds two confirmed swing lows or highs, marks their shared price zone and stages a limit order for a possible third test. Stop-loss sits beyond the opposite edge of the zone; take-profit is fixed at 3R. Each timeframe is scanned independently. No indicators or AI filters are used.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Summary label="Active orders" value={activeCount} />
        <Summary label="Completed results" value={resultCount} />
        <Summary label="Scanned assets" value={assets.length} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {(['TRIPLE BOTTOM', 'TRIPLE TOP'] as const).map(item => (
          <button key={item} type="button" onClick={() => setCategory(item)}
            className={`rounded-xl border px-4 py-4 text-left transition-colors ${category === item ? (item === 'TRIPLE BOTTOM' ? 'border-up/50 bg-up/10' : 'border-down/50 bg-down/10') : 'border-line/25 bg-surface/[0.03]'}`}>
            <span className={`block text-sm font-bold ${item === 'TRIPLE BOTTOM' ? 'text-up' : 'text-down'}`}>{item}</span>
            <span className="mt-1 block text-xs text-ink-2">{item === 'TRIPLE BOTTOM' ? 'BUY LIMIT · support retest' : 'SELL LIMIT · resistance retest'}</span>
            <span className="mt-2 block text-xs text-ink-3">{trackedOrders.filter(order => order.patternType === item && (order.status === 'WAITING' || order.status === 'ENTRY HIT')).length} active</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(['active', 'results', 'all'] as const).map(item => (
          <button key={item} type="button" onClick={() => setFilter(item)}
            className={`rounded-lg border px-3 py-2 text-xs font-semibold capitalize transition-colors ${filter === item ? 'border-accent/50 bg-accent/10 text-accent' : 'border-line/25 bg-surface/[0.03] text-ink-2 hover:text-ink'}`}>
            {item === 'results' ? 'Results' : item === 'active' ? 'Active' : 'All orders'}
          </button>
        ))}
      </div>

      {!loaded ? (
        <div className="rounded-xl border border-line/25 bg-surface/[0.03] p-5 text-sm text-ink-2">Waiting for market data…</div>
      ) : visibleOrders.length === 0 ? (
        <div className="rounded-xl border border-line/25 bg-surface/[0.03] p-5 text-sm text-ink-2">
          No {category.toLowerCase()} setups in this view yet. Scanning continues across all discovered assets and configured timeframes.
        </div>
      ) : (
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          {visibleOrders.map(idea => (
            <article key={idea.id} className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-line/35 bg-surface/[0.03] p-3 sm:p-5">
              <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:justify-between sm:gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-3">{idea.assetName} ({idea.symbol}) · {idea.timeframeLabel}</p>
                  <h4 className={`mt-1 text-xl font-bold ${idea.direction === 'BUY' ? 'text-up' : 'text-down'}`}>{idea.type}</h4>
                  <p className="mt-1 text-[11px] font-semibold tracking-wide text-ink-2">{idea.patternType} · RR 1:3</p>
                </div>
                <StatusPill status={idea.status} />
              </div>

              <div className="mt-3 min-w-0 rounded-xl border border-line/25 bg-surface/[0.025] px-3 py-3">
                {idea.status === 'WAITING' ? <>
                  <p className="text-sm font-semibold text-ink">Pending third test.</p>
                  <p className="mt-1 break-words text-xs leading-relaxed text-ink-2">The price zone has been identified from two confirmed swing points. A {idea.type} is proposed at the zone; this screen does not submit it to a broker.</p>
                </> : idea.status === 'ENTRY HIT' ? <>
                  <p className="text-sm font-semibold text-up">ENTRY LEVEL REACHED</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-2">Market price touched the planned entry. This is a chart-based simulation, not a broker-confirmed fill.</p>
                </> : <>
                  <p className="text-sm font-semibold text-ink">{idea.status === 'TARGET HIT' ? 'Take-profit reached.' : idea.status === 'STOP-LOSS HIT' ? 'Stop-loss reached.' : idea.status === 'EXPIRED' ? 'Setup expired.' : 'Setup invalidated.'}</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-2">The pattern is no longer active. SuperTech AI continues scanning for a fresh setup.</p>
                </>}
              </div>

              <div className="mt-3 grid min-w-0 grid-cols-2 gap-2 sm:gap-3">
                <Price label="Live price" value={idea.currentPrice} digits={idea.digits} />
                <Price label="Timeframe" value={idea.granularity / 60} digits={0} suffix=" min" />
              </div>
              <div className="mt-4">
                <PendingOrderChart
                  candles={states[idea.symbol]?.[idea.granularity]?.chartCandles ?? states[idea.symbol]?.[idea.granularity]?.candles ?? []}
                  entry={idea.entry} stopLoss={idea.stopLoss} takeProfit={idea.takeProfit}
                  currentPrice={idea.currentPrice} digits={idea.digits} direction={idea.direction}
                  symbol={idea.symbol} zone={idea.zone} patternType={idea.patternType}
                />
              </div>
              <div className="mt-4">
                <LevelList digits={idea.digits} rows={[
                  { label: 'Entry', hint: 'Third-test limit level', value: idea.entry, hitEpoch: idea.entryHitEpoch, tone: 'text-entry' },
                  { label: 'Stop-loss', hint: 'Beyond the opposite zone edge', value: idea.stopLoss, hitEpoch: idea.stopLossHitEpoch, tone: 'text-down' },
                  { label: 'Take Profit', hint: 'Three times the risk distance', value: idea.takeProfit, hitEpoch: idea.takeProfitHitEpoch, tone: 'text-up' },
                ]} />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line/25 pt-3 text-xs text-ink-3">
                <span className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" /> Pattern: {formatDateTime(idea.signalEpoch)}</span>
                <span>{idea.resolvedEpoch !== null ? `Result: ${formatDateTime(idea.resolvedEpoch)}` : 'Tracking'}</span>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="flex min-w-0 items-start gap-2 rounded-xl border border-warn/25 bg-warn/5 p-3 text-xs leading-relaxed text-ink-2 sm:p-4">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-warn" />
        <p className="min-w-0 break-words">Price-action pattern detection only. No SMA, Bollinger Bands, AI score or indicator confirmation. Every timeframe is evaluated separately. “Entry level reached” means candle price touched the level; no broker order has been placed or filled. Results are locally tracked on this device.</p>
      </div>
    </section>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return <div className="min-w-0 rounded-xl border border-line/25 bg-surface/[0.03] p-3 sm:p-4"><p className="text-xs text-ink-3">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{value}</p></div>;
}
function StatusPill({ status }: { status: M15StopIdea['status'] }) {
  const label = status === 'ENTRY HIT' ? 'ENTRY REACHED' : status;
  const tone = status === 'TARGET HIT' ? 'border-up/40 bg-up/10 text-up'
    : status === 'STOP-LOSS HIT' || status === 'INVALIDATED' ? 'border-down/40 bg-down/10 text-down'
    : status === 'EXPIRED' ? 'border-line/40 bg-surface/[0.08] text-ink-3'
    : status === 'ENTRY HIT' ? 'border-up/40 bg-up/10 text-up'
    : 'border-line/40 bg-surface/[0.04] text-ink-2';
  return <span className={`max-w-full whitespace-normal break-words rounded-full border px-3 py-1 text-left text-xs font-semibold ${tone}`}>{label}</span>;
}
function Price({ label, value, digits, suffix = '' }: { label: string; value: number; digits: number; suffix?: string }) {
  return <div className="min-w-0 rounded-xl border border-line/25 bg-surface/[0.02] p-3"><p className="text-xs text-ink-3">{label}</p><p className="mt-1 break-all font-mono text-base font-semibold tabular-nums text-ink">{digits === 0 ? value : formatPrice(value, digits)}{suffix}</p></div>;
}
