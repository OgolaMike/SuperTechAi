import { ArrowDownToLine, ArrowUpFromLine, Clock3, Info, ShieldAlert, Sparkles } from 'lucide-react';
import { useMemo } from 'react';
import { buildPendingOrderIdeas } from '@/lib/pendingOrders';
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
  const ideas = useMemo(
    () => buildPendingOrderIdeas(assets, states, prices, aiModel, nowEpoch),
    [assets, states, prices, aiModel, nowEpoch],
  );

  return (
    <section className="mt-8 space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Trend-following order ideas</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Limit Orders</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-2">
          Live BUY LIMIT and SELL LIMIT ideas are generated from confirmed candle data. The eight-timeframe trend, M5 momentum, entry level and strength explanation are shown for every qualifying setup. These are signal proposals, not broker executions.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-up/20 bg-up/5 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-up"><ArrowUpFromLine className="h-4 w-4" /> Buy Stop</div>
          <p className="mt-2 text-sm text-ink-2">A BUY order above the market. It waits for price to break higher.</p>
        </div>
        <div className="rounded-xl border border-down/20 bg-down/5 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-down"><ArrowDownToLine className="h-4 w-4" /> Sell Stop</div>
          <p className="mt-2 text-sm text-ink-2">A SELL order below the market. It waits for price to break lower.</p>
        </div>
        <div className="rounded-xl border border-line/10 bg-surface/[0.03] p-4">
          <div className="text-sm font-semibold text-ink">Buy Limit</div>
          <p className="mt-2 text-sm text-ink-2">A BUY order below the market. It waits for a price pullback.</p>
        </div>
        <div className="rounded-xl border border-line/10 bg-surface/[0.03] p-4">
          <div className="text-sm font-semibold text-ink">Sell Limit</div>
          <p className="mt-2 text-sm text-ink-2">A SELL order above the market. It waits for a price pullback.</p>
        </div>
      </div>

      {!loaded ? (
        <div className="rounded-2xl border border-line/10 bg-surface/[0.03] p-6 text-sm text-ink-2">Loading live market data…</div>
      ) : ideas.filter((idea) => idea.type.endsWith('LIMIT')).length === 0 ? (
        <div className="rounded-2xl border border-line/10 bg-surface/[0.03] p-8 text-center">
          <ShieldAlert className="mx-auto h-7 w-7 text-ink-3" />
          <h3 className="mt-3 text-lg font-semibold text-ink">No safe order idea right now</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-ink-2">
            No BUY LIMIT or SELL LIMIT setup currently meets the live trend and momentum checks. The scanner will keep reassessing fresh candle closes; weaker setups are not presented as trade opportunities.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {ideas.filter((idea) => idea.type.endsWith('LIMIT')).map((idea) => {
            const buy = idea.direction === 'BUY';
            return (
              <article key={idea.id} className="rounded-2xl border border-line/10 bg-surface/[0.03] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-ink-3">{idea.assetName} ({idea.symbol})</p>
                    <h3 className={`mt-1 text-xl font-bold ${buy ? 'text-up' : 'text-down'}`}>{idea.type}</h3>
                  </div>
                  <span className="rounded-full border border-up/20 bg-up/5 px-3 py-1 text-xs font-semibold text-up">{idea.timeframeAgreement}/8 agree</span>
                </div>

                <p className="mt-3 text-sm leading-relaxed text-ink-2">{idea.reason}</p>
                <div className="mt-3 rounded-xl border border-accent/20 bg-accent/5 p-3">
                  <div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold uppercase tracking-wider text-accent">Signal strength</span><span className="font-mono text-sm font-bold text-ink">{idea.strengthScore}/100</span></div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-line/20"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.max(0, Math.min(100, idea.strengthScore))}%` }} /></div>
                  <p className="mt-2 text-xs text-ink-2">{idea.aiScore == null ? `M5 momentum ${idea.momentumScore ?? 0}/100 · AI history is still learning` : `M5 momentum ${idea.momentumScore ?? 0}/100 · AI pattern match ${idea.aiScore}/100`}</p>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Price label="Current price" value={idea.currentPrice} digits={idea.digits} />
                  <Price label="Suggested order price" value={idea.entry} digits={idea.digits} />
                  <Price label="Stop-loss" value={idea.stopLoss} digits={idea.digits} />
                  <Price label="Take-profit" value={idea.takeProfit} digits={idea.digits} />
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line/10 pt-3 text-xs text-ink-3">
                  <span className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" /> Signal: {formatDateTime(idea.signalEpoch)}</span>
                  {idea.aiScore == null ? (
                    <span className="flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> AI is still learning</span>
                  ) : (
                    <span className="flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> {idea.type.endsWith('LIMIT') ? 'M5 AI match' : 'Past-pattern match'}: {idea.aiScore}/100</span>
                  )}
                  {idea.momentumScore != null && (
                    <span className="rounded-full border border-up/20 bg-up/5 px-2 py-1 font-medium text-up">
                      M5 momentum: {idea.momentumScore}/100
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="rounded-xl border border-line/10 bg-surface/[0.03] p-4">
        <p className="text-sm font-semibold text-ink">How limit-order strength is measured</p>
        <p className="mt-1 text-xs leading-relaxed text-ink-2">
          BUY LIMIT and SELL LIMIT ideas require eight-timeframe directional agreement, a fresh M5 signal, at least 4 of the last 5 M5 candle bodies aligned with the setup, directional (not choppy) movement, and an M5 momentum score of at least 40/100. When enough completed history exists, the AI pattern score must also be at least 40/100. While the AI model is still learning, the card labels that limitation and reports live momentum strength instead of hiding every qualifying setup.
        </p>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-warn/20 bg-warn/5 p-4 text-xs leading-relaxed text-ink-2">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-warn" />
        <p>These are analysis ideas, not live broker orders. Check the minimum distance, price precision, expiry and risk rules for your broker before placing any order. Pending orders can be triggered and still lose money.</p>
      </div>
    </section>
  );
}

function Price({ label, value, digits }: { label: string; value: number; digits: number }) {
  return (
    <div className="rounded-xl border border-line/10 bg-surface/[0.02] p-3">
      <p className="text-xs text-ink-3">{label}</p>
      <p className="mt-1 break-all font-mono text-base font-semibold tabular-nums text-ink">{formatPrice(value, digits)}</p>
    </div>
  );
}
