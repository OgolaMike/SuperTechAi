import { useEffect, useMemo, useState } from 'react';
import { Clock3, Info } from 'lucide-react';
import { buildM15StopOrderIdeas, mergeTrackedStopOrders, type M15StopIdea } from '@/lib/stopOrders';
import { LevelList } from '@/components/SignalParts';
import { PendingOrderChart } from '@/components/PendingOrderChart';
import type { TimeframeStates } from '@/hooks/useDerivSignals';
import type { SignalLearningModel } from '@/lib/aiLearning';
import type { Asset } from '@/lib/sma';
import { formatDateTime, formatPrice } from '@/lib/sma';

const STORAGE_KEY = 'supertech-m15-stop-order-history';

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
    return Array.isArray(stored)
      ? (stored as M15StopIdea[]).filter((order) => (order.type === 'BUY LIMIT' || order.type === 'SELL LIMIT') &&
        !!order.zone && Number.isFinite(order.zone.low) && Number.isFinite(order.zone.high) &&
        !!order.patternType)
      : [];
  } catch {
    return [];
  }
}

export function PendingOrdersPanel({ assets, states, prices, aiModel, nowEpoch, loaded }: Props) {
  const [trackedOrders, setTrackedOrders] = useState<M15StopIdea[]>(loadTrackedOrders);
  const [filter, setFilter] = useState<'active' | 'results' | 'all'>('active');
  const liveIdeas = useMemo(
    () => buildM15StopOrderIdeas(assets, states, prices, aiModel, nowEpoch),
    [assets, states, prices, aiModel, nowEpoch],
  );

  useEffect(() => {
    if (!loaded || liveIdeas.length === 0) return;
    setTrackedOrders((previous) => {
      const next = mergeTrackedStopOrders(previous, liveIdeas);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Keep the in-memory tracker running if browser storage is unavailable.
      }
      return next;
    });
  }, [loaded, liveIdeas]);

  const selectedSymbols = useMemo(() => new Set(assets.map((asset) => asset.symbol)), [assets]);
  const selectedOrders = useMemo(
    () => trackedOrders.filter((order) => selectedSymbols.has(order.symbol) && (order.type === 'BUY LIMIT' || order.type === 'SELL LIMIT')),
    [trackedOrders, selectedSymbols],
  );
  const activeCount = selectedOrders.filter((order) => order.status === 'WAITING' || order.status === 'ENTRY HIT').length;
  const resultCount = selectedOrders.length - activeCount;
  const visibleOrders = selectedOrders.filter((order) =>
    filter === 'all' ? true : filter === 'active'
      ? order.status === 'WAITING' || order.status === 'ENTRY HIT'
      : order.status === 'TARGET HIT' || order.status === 'STOP-LOSS HIT' || order.status === 'INVALIDATED' || order.status === 'EXPIRED',
  );

  return (
    <section className="mt-8 min-w-0 w-full space-y-6 overflow-x-hidden">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">All-market multi-timeframe order intelligence</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Pending Orders</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-2">
          BUY LIMIT and SELL LIMIT setups scan M15 price patterns and confirm direction, momentum and Bollinger position across all eight timeframes (M1 to D1). Triple-bottom and triple-top zones mark the identified price areas; break-and-retest marks continuation zones. Take-profit uses the next Bollinger Band in the trade direction, with stop-loss calculated for a 1:2 reward-to-risk ratio.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Summary label="Active orders" value={activeCount} />
        <Summary label="Completed results" value={resultCount} />
        <Summary label="Tracked total" value={trackedOrders.length} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(['active', 'results', 'all'] as const).map((item) => (
          <button key={item} type="button" onClick={() => setFilter(item)}
            className={`rounded-lg border px-3 py-2 text-xs font-semibold capitalize transition-colors ${filter === item ? 'border-accent/50 bg-accent/10 text-accent' : 'border-line/25 bg-surface/[0.03] text-ink-2 hover:text-ink'}`}>
            {item === 'results' ? 'Results' : item === 'active' ? 'Active' : 'All orders'}
          </button>
        ))}
      </div>

      {!loaded ? (
        <div className="rounded-xl border border-line/25 bg-surface/[0.03] p-5 text-sm text-ink-2">Waiting for M15 market data…</div>
      ) : visibleOrders.length === 0 ? (
        <div className="rounded-xl border border-line/25 bg-surface/[0.03] p-5 text-sm text-ink-2">
          {filter === 'results' ? 'No completed order results yet. Results will appear here as orders resolve.' : 'No tracked pending orders in this view yet. Scanning continues across all discovered assets.'}
        </div>
      ) : (
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          {visibleOrders.map((idea) => (
            <article key={idea.id} className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-line/35 bg-surface/[0.03] p-3 sm:p-5">
              <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:justify-between sm:gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-3">{idea.assetName} ({idea.symbol}) · M15</p>
                  <h4 className={`mt-1 text-xl font-bold ${idea.direction === 'BUY' ? 'text-up' : 'text-down'}`}>{idea.type}</h4>
                  <p className="mt-1 text-[11px] font-semibold tracking-wide text-ink-2">{idea.patternType} · RR 1:2</p>
                </div>
                <StatusPill status={idea.status} />
              </div>
              <div className="mt-3 min-w-0 rounded-xl border border-line/25 bg-surface/[0.025] px-3 py-3">
                {idea.status === 'WAITING' ? (
                  <>
                    <p className="text-sm font-semibold text-ink">You can place this trade.</p>
                    <p className="mt-1 break-words text-xs leading-relaxed text-ink-2">Place the {idea.type} order using the entry, stop-loss and take-profit levels below. The platform will keep tracking the setup.</p>
                  </>
                ) : idea.status === 'ENTRY HIT' ? (
                  <>
                    <p className="text-sm font-semibold text-up">TRADE EXECUTED</p>
                    <p className="mt-1 text-xs leading-relaxed text-ink-2">Price has reached the planned entry level. The trade is now being tracked against its stop-loss and take-profit.</p>
                  </>
                ) : idea.status === 'TARGET HIT' || idea.status === 'STOP-LOSS HIT' ? (
                  <>
                    <p className="text-sm font-semibold text-ink">{idea.status === 'TARGET HIT' ? 'Take-profit reached.' : 'Stop-loss reached.'}</p>
                    <p className="mt-1 text-xs leading-relaxed text-ink-2">Wait for next order. SuperTechAi continues scanning for the next confirmed setup.</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-ink">{idea.status === 'EXPIRED' ? 'Order setup expired.' : 'Order setup invalidated.'}</p>
                    <p className="mt-1 text-xs leading-relaxed text-ink-2">Wait for next order. SuperTechAi continues scanning for a fresh confirmed setup.</p>
                  </>
                )}
              </div>
              <div className="mt-3 grid min-w-0 grid-cols-2 gap-2 sm:gap-3">
                <Price label="Live price" value={idea.currentPrice} digits={idea.digits} />
                {idea.aiScore !== null
                  ? <Price label="M15 AI score" value={idea.aiScore} digits={0} />
                  : <div className="rounded-xl border border-line/25 bg-surface/[0.02] p-3"><p className="text-xs text-ink-3">M15 AI score</p><p className="mt-1 text-sm font-medium text-ink-2">Learning</p></div>}
              </div>
              <div className="mt-4 rounded-xl border border-line/25 bg-surface/[0.025] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-ink-3">Multi-timeframe confirmation</p>
                    <p className="mt-1 text-sm font-semibold text-ink">{
                      (idea.timeframeAnalysis ?? []).filter((reading) => reading.aligned === true).length
                    } / 8 timeframes support {idea.direction}</p>
                  </div>
                  <span className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[10px] font-semibold text-accent">D1 → M1</span>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
                  {(idea.timeframeAnalysis ?? []).map((reading) => (
                    <div key={reading.label} className={`min-w-0 rounded-lg border p-2 text-center ${
                      reading.aligned === true ? 'border-up/35 bg-up/10'
                        : reading.aligned === false ? 'border-down/25 bg-down/5'
                        : 'border-line/20 bg-surface/[0.02]'
                    }`}>
                      <p className="text-[10px] font-bold text-ink">{reading.label}</p>
                      <p className={`mt-1 text-[10px] font-semibold ${
                        reading.aligned === true ? 'text-up'
                          : reading.aligned === false ? 'text-down' : 'text-ink-3'
                      }`}>{reading.bias === 'BUILDING' ? 'WAIT' : reading.bias}</p>
                      <p className="mt-1 text-[9px] text-ink-3">{reading.momentum}</p>
                      <p className="mt-0.5 text-[9px] text-ink-3">{reading.bandPosition}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-ink-3">Each timeframe uses confirmed candles, SMA 60 and Bollinger Bands. Green supports this order direction; red points against it; WAIT means more history is needed. This is a confluence check, not an automatic trade veto.</p>
              </div>
              <div className="mt-4">
                <PendingOrderChart
                  candles={states[idea.symbol]?.[900]?.candles ?? []}
                  entry={idea.entry}
                  stopLoss={idea.stopLoss}
                  takeProfit={idea.takeProfit}
                  currentPrice={idea.currentPrice}
                  digits={idea.digits}
                  direction={idea.direction}
                  symbol={idea.symbol}
                  zone={idea.zone}
                  patternType={idea.patternType}
                />
              </div>
              <div className="mt-4">
                <LevelList digits={idea.digits} rows={[
                  { label: 'Entry', hint: 'Pending entry level', value: idea.entry, hitEpoch: idea.entryHitEpoch, tone: 'text-entry' },
                  { label: 'Stop-loss', hint: 'Protective stop level', value: idea.stopLoss, hitEpoch: idea.stopLossHitEpoch, tone: 'text-down' },
                  { label: 'Take Profit', hint: 'Bollinger Band target', value: idea.takeProfit, hitEpoch: idea.takeProfitHitEpoch, tone: 'text-up' },
                ]} />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line/25 pt-3 text-xs text-ink-3">
                <span className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" /> Signal: {formatDateTime(idea.signalEpoch)}</span>
                <span>{idea.resolvedEpoch !== null ? `Result: ${formatDateTime(idea.resolvedEpoch)}` : 'Tracking'}</span>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="flex min-w-0 items-start gap-2 rounded-xl border border-warn/25 bg-warn/5 p-3 text-xs leading-relaxed text-ink-2 sm:p-4">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-warn" />
        <p className="min-w-0 break-words">These are trade suggestions for the member to place manually; they are not submitted to a broker by this screen. “TRADE EXECUTED” means the market price reached the planned entry level in the tracked M15 candles, not that a broker confirmed a fill. Setups are triggered by confirmed M15 candle structure and are cross-checked against all eight confirmed timeframes. The chart displays the latest 60 M15 candles and the order levels. Tracked outcomes are saved on this device.</p>
      </div>
    </section>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return <div className="min-w-0 rounded-xl border border-line/25 bg-surface/[0.03] p-3 sm:p-4"><p className="text-xs text-ink-3">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{value}</p></div>;
}

function StatusPill({ status }: { status: M15StopIdea['status'] }) {
  const label = status === 'ENTRY HIT' ? 'TRADE EXECUTED' : status;
  const tone = status === 'TARGET HIT' ? 'border-up/40 bg-up/10 text-up'
    : status === 'STOP-LOSS HIT' || status === 'INVALIDATED' ? 'border-down/40 bg-down/10 text-down'
    : status === 'EXPIRED' ? 'border-line/40 bg-surface/[0.08] text-ink-3'
    : status === 'ENTRY HIT' ? 'border-up/40 bg-up/10 text-up'
    : 'border-line/40 bg-surface/[0.04] text-ink-2';
  return <span className={`max-w-full whitespace-normal break-words rounded-full border px-3 py-1 text-left text-xs font-semibold ${tone}`}>{label}</span>;
}

function Price({ label, value, digits }: { label: string; value: number; digits: number }) {
  return <div className="min-w-0 rounded-xl border border-line/25 bg-surface/[0.02] p-3"><p className="text-xs text-ink-3">{label}</p><p className="mt-1 break-all font-mono text-base font-semibold tabular-nums text-ink">{formatPrice(value, digits)}</p></div>;
}
