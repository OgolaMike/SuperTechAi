import { useEffect, useState } from 'react';
import { Check, Loader2, RefreshCw } from 'lucide-react';
import { fetchSignalRecords, type SignalRecordRow } from '@/lib/signalRecords';
import { formatDateTime, formatPrice } from '@/lib/sma';

type Filter = 'all' | 'open' | 'closed';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'closed', label: 'Closed' },
];

type Props = {
  version: number;
};

type LoadState = {
  rows: SignalRecordRow[];
  error: string | null;
  loading: boolean;
};

export function RecordsPanel({ version }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [state, setState] = useState<LoadState>({ rows: [], error: null, loading: true });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((previous) => ({ ...previous, loading: true }));
    fetchSignalRecords()
      .then((rows) => {
        if (!cancelled) setState({ rows, error: null, loading: false });
      })
      .catch((error: Error) => {
        if (!cancelled) setState((previous) => ({ rows: previous.rows, error: error.message, loading: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [version, reloadKey]);

  const visible = state.rows.filter((row) =>
    filter === 'all' ? true : filter === 'open' ? !row.closed : row.closed,
  );

  return (
    <section className="mt-8">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Signals</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-ink">Every signal, and when each level was hit</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-2">
            Levels are fixed at the moment each signal fired. Hits are recorded on confirmed candle closes only.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div role="tablist" className="inline-flex rounded-xl border border-line/10 bg-surface/[0.03] p-1">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={filter === item.id}
                onClick={() => setFilter(item.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                  filter === item.id ? 'bg-surface/[0.08] text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setReloadKey((value) => value + 1)}
            aria-label="Reload signals"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-line/10 bg-surface/[0.03] text-ink-2 transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            <RefreshCw className={`h-4 w-4 ${state.loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {state.error && (
        <div className="mb-4 rounded-xl border border-down/30 bg-down/10 px-4 py-3 text-sm text-down">
          Signals could not be loaded: {state.error}
        </div>
      )}

      {state.loading && state.rows.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-line/10 bg-surface/[0.03] p-6 text-sm text-ink-2">
          <Loader2 className="h-4 w-4 animate-spin text-accent" />
          Loading signals…
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-line/10 bg-surface/[0.03] px-6 py-12 text-center text-sm text-ink-2">
          No {filter === 'all' ? '' : `${filter} `}signals recorded yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line/10 bg-surface/[0.03]">
          <table className="w-full min-w-[960px] border-collapse text-left text-xs">
            <thead className="border-b border-line/10 text-xs uppercase tracking-wider text-ink-3">
              <tr>
                <th className="px-4 py-3 font-semibold">Fired</th>
                <th className="px-3 py-3 font-semibold">Asset</th>
                <th className="px-3 py-3 font-semibold">TF</th>
                <th className="px-3 py-3 font-semibold">Side</th>
                <th className="px-3 py-3 font-semibold">Entry</th>
                <th className="px-3 py-3 font-semibold">Stop-loss</th>
                <th className="px-3 py-3 font-semibold">TP 1</th>
                <th className="px-3 py-3 font-semibold">TP 2</th>
                <th className="px-3 py-3 font-semibold">TP 3</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/10">
              {visible.map((row) => (
                <RecordRow key={row.signal_key} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function RecordRow({ row }: { row: SignalRecordRow }) {
  const isBuy = row.direction === 'BUY';
  return (
    <tr className="transition-colors hover:bg-surface/[0.03]">
      <td className="whitespace-nowrap px-4 py-3 text-ink-2 tabular-nums">{formatDateTime(row.signal_epoch)}</td>
      <td className="max-w-[160px] break-words px-3 py-3 font-medium text-ink">{row.asset_name}</td>
      <td className="px-3 py-3 font-semibold text-ink">{row.timeframe}</td>
      <td className={`px-3 py-3 font-bold ${isBuy ? 'text-up' : 'text-down'}`}>{row.direction}</td>
      <td className="px-3 py-3 font-mono tabular-nums text-ink">{formatPrice(row.entry, row.digits)}</td>
      <td className="px-3 py-3"><HitCell price={row.stop_loss} digits={row.digits} hitEpoch={row.sl_hit_epoch} tone="text-down" /></td>
      <td className="px-3 py-3"><HitCell price={row.tp1} digits={row.digits} hitEpoch={row.tp1_hit_epoch} tone="text-up" /></td>
      <td className="px-3 py-3"><HitCell price={row.tp2} digits={row.digits} hitEpoch={row.tp2_hit_epoch} tone="text-up" /></td>
      <td className="px-3 py-3"><HitCell price={row.tp3} digits={row.digits} hitEpoch={row.tp3_hit_epoch} tone="text-up" /></td>
      <td className="px-4 py-3">
        <StatusBadge status={row.status} closed={row.closed} />
      </td>
    </tr>
  );
}

function HitCell({ price, digits, hitEpoch, tone }: { price: number; digits: number; hitEpoch: number | null; tone: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="flex items-center gap-1 font-mono tabular-nums text-ink">
        {hitEpoch !== null && <Check className={`h-3 w-3 ${tone}`} />}
        {formatPrice(price, digits)}
      </span>
      <span className={`text-xs tabular-nums ${hitEpoch !== null ? tone : 'text-ink-3'}`}>
        {hitEpoch !== null ? `Hit ${formatDateTime(hitEpoch)}` : 'Not hit'}
      </span>
    </div>
  );
}

function StatusBadge({ status, closed }: { status: SignalRecordRow['status']; closed: boolean }) {
  const tone =
    status === 'TP3' || status === 'TP2' || status === 'TP1'
      ? 'border-up/30 bg-up/10 text-up'
      : status === 'Stopped'
      ? 'border-down/30 bg-down/10 text-down'
      : 'border-accent/30 bg-accent/10 text-accent';
  return (
    <div className="flex flex-col gap-1">
      <span className={`inline-flex w-fit rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${tone}`}>
        {status === 'Open' ? 'Open' : status === 'Stopped' ? 'Stopped' : `${status} reached`}
      </span>
      <span className="text-xs text-ink-3">{closed ? 'Closed' : 'Running'}</span>
    </div>
  );
}
