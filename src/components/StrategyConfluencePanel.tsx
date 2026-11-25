import type { ConfluenceResult } from '@/lib/strategyConfluence';

type Props = { results: ConfluenceResult[]; assets: { symbol: string; name: string }[] };

export function StrategyConfluencePanel({ results, assets }: Props) {
  const names = new Map(assets.map((asset) => [asset.symbol, asset.name]));
  const high = results.filter((result) => result.status === 'HIGH_CONFLUENCE');
  return (
    <section className="mt-6 space-y-4" aria-label="Strategy confluence intelligence">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Collaborative strategy intelligence</p>
        <h3 className="mt-1 text-xl font-semibold text-ink">Strategy Confluence</h3>
        <p className="mt-1 max-w-3xl text-sm text-ink-2">Independent strategies keep their own signals. This layer compares their fresh conclusions and highlights agreement or conflict without rewriting any strategy decision.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Assets assessed" value={results.length} />
        <Metric label="High confluence" value={high.length} />
        <Metric label="Conflicts to watch" value={results.filter((result) => result.status === 'CONFLICT').length} />
      </div>
      {results.length === 0 ? <p className="rounded-xl border border-line/15 bg-surface/[0.025] p-4 text-sm text-ink-2">Waiting for fresh strategy assessments.</p> : (
        <div className="grid gap-3 lg:grid-cols-2">
          {results.map((result) => (
            <article key={result.symbol} className="rounded-2xl border border-line/20 bg-surface/[0.035] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><p className="font-semibold text-ink">{names.get(result.symbol) ?? result.symbol}</p><p className="text-xs text-ink-3">{result.symbol}</p></div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${result.status === 'HIGH_CONFLUENCE' ? 'bg-up/10 text-up' : result.status === 'CONFLICT' ? 'bg-down/10 text-down' : 'border border-line/20 text-ink-3'}`}>
                  {result.status.replaceAll('_', ' ')}
                </span>
              </div>
              <div className="mt-4 flex items-end justify-between gap-3">
                <div><p className="text-xs text-ink-3">Combined direction</p><p className={`mt-1 text-lg font-bold ${result.direction === 'BUY' ? 'text-up' : result.direction === 'SELL' ? 'text-down' : 'text-ink-2'}`}>{result.direction ?? 'WAIT'}</p></div>
                <div className="text-right"><p className="text-xs text-ink-3">Evidence score</p><p className="mt-1 text-lg font-bold tabular-nums text-ink">{result.score}/100</p></div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {result.assessments.map((item) => (
                  <span key={item.strategyId} className="rounded-lg border border-line/15 bg-surface/[0.04] px-2 py-1 text-[11px] text-ink-2">
                    {item.strategyName}: {item.status === 'SIGNAL' ? item.direction : item.status}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-xs leading-5 text-ink-2">{result.explanation}</p>
            </article>
          ))}
        </div>
      )}
      <p className="text-[11px] leading-5 text-ink-3">The evidence score measures agreement quality, not the probability of winning. Conflicting signals are shown rather than hidden. This panel does not place trades.</p>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-line/15 bg-surface/[0.025] p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">{label}</p><p className="mt-1 text-lg font-semibold tabular-nums text-ink">{value}</p></div>;
}
