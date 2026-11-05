import { Bot, CreditCard, ShieldCheck } from 'lucide-react';

export const SUPERTECHAI_TRADER_MONTHLY_PRICE_USD = 9;

export function AutoTradePlan() {
  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-accent/25 bg-surface/[0.04] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-accent/20 bg-accent/10 p-3">
            <Bot className="h-6 w-6 text-accent" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Automated trading subscription</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-ink">SuperTechAi Trader</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-2">
              Cloud-assisted MT5 trading access, with SuperTech AI intelligence and account risk controls.
            </p>
          </div>
        </div>
        <div className="min-w-32 rounded-xl border border-line/10 bg-canvas/60 px-4 py-3 text-right">
          <p className="text-2xl font-bold tracking-tight text-ink">$9</p>
          <p className="text-xs text-ink-2">USD / month</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-2">
        <span className="inline-flex items-center gap-1.5"><CreditCard className="h-4 w-4 text-accent" /> Monthly subscription</span>
        <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-accent" /> No free trial</span>
      </div>
      <p className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs leading-5 text-ink-2">
        Price set at $9/month. Payment checkout and server-side subscription activation must be connected before paid automated trading can be enabled.
      </p>
    </section>
  );
}
