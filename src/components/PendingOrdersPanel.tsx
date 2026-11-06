import { Clock3, Info } from 'lucide-react';
import { useMemo } from 'react';
import { buildM15StopOrderIdeas } from '@/lib/stopOrders';
import { LevelList } from '@/components/SignalParts';
import type { TimeframeStates } from '@/hooks/useDerivSignals';
import type { SignalLearningModel } from '@/lib/aiLearning';
import type { Asset } from '@/lib/sma';
import { formatDateTime, formatPrice } from '@/lib/sma';

type Props = {
  assets: Asset[];
  states: Record<string, TimeframeStates>;
  prices: Record<string, number>;
  aiModel: SignalLearningModel;
  nowEpoch: number;
  loaded: boolean;
};

export function PendingOrdersPanel({ assets, states, prices, aiModel, nowEpoch, loaded }: Props) {
  const stopIdeas = useMemo(
    () => buildM15StopOrderIdeas(assets, states, prices, aiModel, nowEpoch),
    [assets, states, prices, aiModel, nowEpoch],
  );

  return (
    <section className="mt-8 space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">All-market M15 orders</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">M15 Stop Signals</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-2">
          BUY STOP and SELL STOP order details across all discovered Deriv assets.
        </p>
      </div>

      <section className="space-y-4">
        {!loaded ? (
          <div className="rounded-xl border border-line/25 bg-surface/[0.03] p-5 text-sm text-ink-2">Waiting for M15 market data…</div>
        ) : stopIdeas.length === 0 ? (
          <div className="rounded-xl border border-line/25 bg-surface/[0.03] p-5 text-sm text-ink-2">No fresh M15 BUY STOP or SELL STOP signals are available right now.</div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {stopIdeas.map((idea) => {
              const buy = idea.direction === 'BUY';
              const completed = idea.stopLossHitEpoch !== null || idea.takeProfitHitEpoch !== null;
              return (
                <article key={idea.id} className="rounded-2xl border border-line/35 bg-surface/[0.03] p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-ink-3">{idea.assetName} ({idea.symbol}) · M15</p>
                      <h4 className={`mt-1 text-xl font-bold ${buy ? 'text-up' : 'text-down'}`}>{idea.type}</h4>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${completed ? 'border-warn/40 bg-warn/10 text-warn' : 'border-up/35 bg-up/10 text-up'}`}>
                      {idea.takeProfitHitEpoch !== null ? 'TARGET HIT' : idea.stopLossHitEpoch !== null ? 'STOP-LOSS HIT' : idea.entryHitEpoch !== null ? 'ENTRY HIT' : 'WAITING'}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <Price label="Live price" value={idea.currentPrice} digits={idea.digits} />
                    {idea.aiScore !== null ? (
                      <Price label="M15 AI score" value={idea.aiScore} digits={0} />
                    ) : (
                      <div className="rounded-xl border border-line/25 bg-surface/[0.02] p-3">
                        <p className="text-xs text-ink-3">M15 AI score</p>
                        <p className="mt-1 text-sm font-medium text-ink-2">Learning</p>
                      </div>
                    )}
                  </div>
                  <div className="mt-4">
                    <LevelList
                      digits={idea.digits}
                      rows={[
                        { label: 'Entry', hint: 'Entry level', value: idea.entry, hitEpoch: idea.entryHitEpoch, tone: 'text-entry' },
                        { label: 'Stop-loss', hint: 'Protective stop level', value: idea.stopLoss, hitEpoch: idea.stopLossHitEpoch, tone: 'text-down' },
                        { label: 'Target', hint: 'Take-profit level', value: idea.takeProfit, hitEpoch: idea.takeProfitHitEpoch, tone: 'text-up' },
                      ]}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line/25 pt-3 text-xs text-ink-3">
                    <span className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" /> Signal: {formatDateTime(idea.signalEpoch)}</span>
                    <span>M15</span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <div className="flex items-start gap-2 rounded-xl border border-warn/25 bg-warn/5 p-4 text-xs leading-relaxed text-ink-2">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-warn" />
        <p>These are signal proposals, not live broker orders.</p>
      </div>
    </section>
  );
}

function Price({ label, value, digits }: { label: string; value: number; digits: number }) {
  return (
    <div className="rounded-xl border border-line/25 bg-surface/[0.02] p-3">
      <p className="text-xs text-ink-3">{label}</p>
      <p className="mt-1 break-all font-mono text-base font-semibold tabular-nums text-ink">{formatPrice(value, digits)}</p>
    </div>
  );
}
