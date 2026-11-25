import { useMemo } from 'react';
import { Clock3, ShieldCheck } from 'lucide-react';
import type { Asset, TfState } from '@/lib/sma';
import { evaluateThreeHourWick } from '@/lib/threeHourWick';
import { formatPrice } from '@/lib/sma';

type Props = {
  assets: Asset[];
  states: Record<string, Record<number, TfState>>;
  nowEpoch: number;
  selectedSymbol?: string;
};

const STATUS_COPY: Record<string, string> = {
  WAITING_FOR_DATA: 'Waiting for 20 completed H4 candles.',
  NO_REJECTION: 'No qualifying H4 wick rejection on the latest closed candle.',
  STALE_H4_CANDLE: 'The latest H4 candle is too old. Waiting for fresh market data.',
};

export function ThreeHourWickStrategy({ assets, states, nowEpoch, selectedSymbol }: Props) {
  const rows = useMemo(() => assets
    .filter((asset) => !selectedSymbol || asset.symbol === selectedSymbol)
    .map((asset) => {
      const h4 = states[asset.symbol]?.[14400];
      return { asset, evaluation: evaluateThreeHourWick(asset.symbol, h4?.candles ?? [], nowEpoch) };
    }), [assets, states, nowEpoch, selectedSymbol]);

  const confirmed = rows.filter((row) => row.evaluation.status === 'CONFIRMED');
  return (
    <section className="mt-6 space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Independent strategy · H4 trigger</p>
          <h3 className="mt-1 text-xl font-semibold text-ink">3H Wick Intelligence</h3>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-2">A long lower wick can independently qualify a BUY and a long upper wick can independently qualify a SELL. This strategy publishes its own assessment; the shared confluence engine compares it with other strategies.</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/25 bg-amber-400/5 px-3 py-1.5 text-xs font-semibold text-amber-500"><Clock3 className="h-3.5 w-3.5" /> Signal preview · execution off</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Assets in view" value={rows.length} />
        <Metric label="Confirmed candidates" value={confirmed.length} />
        <Metric label="Trade duration" value="3 hours" />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {rows.map(({ asset, evaluation }) => (
          <article key={asset.symbol} className="rounded-2xl border border-line/20 bg-surface/[0.035] p-4">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-sm font-semibold text-ink">{asset.name}</p><p className="text-xs text-ink-3">{asset.symbol} · H4</p></div>
              {evaluation.status === 'CONFIRMED'
                ? <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${evaluation.candidate.direction === 'BUY' ? 'bg-up/10 text-up' : 'bg-down/10 text-down'}`}>{evaluation.candidate.direction} CONFIRMED</span>
                : <span className="rounded-full border border-line/20 px-2.5 py-1 text-[10px] font-semibold text-ink-3">WAITING</span>}
            </div>
            {evaluation.status === 'CONFIRMED' ? (
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <Metric label="Entry reference" value={formatPrice(evaluation.candidate.entry, asset.digits)} />
                <Metric label="Initial BB stop" value={formatPrice(evaluation.candidate.initialStopLoss, asset.digits)} />
                <Metric label="Middle band" value={formatPrice(evaluation.candidate.middleBand, asset.digits)} />
                <Metric label="Wick / body" value={`${evaluation.candidate.wickToBodyRatio.toFixed(2)}×`} />
              </div>
            ) : <p className="mt-3 text-xs leading-5 text-ink-2">{STATUS_COPY[evaluation.status]}</p>}
          </article>
        ))}
      </div>
      <div className="rounded-xl border border-line/15 bg-surface/[0.025] p-4 text-xs leading-5 text-ink-2">
        <p className="flex items-center gap-2 font-semibold text-ink"><ShieldCheck className="h-4 w-4 text-accent" /> Strategy isolation</p>
        <p className="mt-1">Manual trades and other strategies are not managed by this module. A future broker executor must tag its own positions, use the actual fill time for the three-hour exit, reconcile after restarts and never modify positions it does not own.</p>
        <p className="mt-1">Protection plan: H4 Bollinger Bands (20, 2.0) for the initial stop; trailing activates at +0.7% and locks another +0.5% for each completed step. Stops may only tighten. This screen does not place orders or modify broker positions.</p>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div><p className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">{label}</p><p className="mt-1 font-semibold tabular-nums text-ink">{value}</p></div>;
}
