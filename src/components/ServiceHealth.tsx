import { useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { assessHealth, fetchScannerState, type HealthLevel, type ScannerState } from '@/lib/scannerHealth';

const REFRESH_MS = 30_000;

const TONE: Record<HealthLevel, { dot: string; text: string }> = {
  up: { dot: 'bg-up', text: 'text-up' },
  warn: { dot: 'bg-warn', text: 'text-warn' },
  down: { dot: 'bg-down', text: 'text-down' },
  unknown: { dot: 'bg-ink-3', text: 'text-ink-2' },
};

type LoadState = { state: ScannerState | null; error: string | null; loading: boolean };

function timeAgo(iso: string | null, nowMs: number): string {
  if (!iso) return 'Never';
  const diff = Math.max(0, Math.round((nowMs - Date.parse(iso)) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export function ServiceHealth() {
  const [load, setLoad] = useState<LoadState>({ state: null, error: null, loading: true });
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchScannerState()
      .then((state) => {
        if (!cancelled) setLoad({ state, error: null, loading: false });
      })
      .catch((err: Error) => {
        if (!cancelled) setLoad((previous) => ({ ...previous, error: err.message, loading: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setNowMs(Date.now());
      setReloadKey((value) => value + 1);
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, []);

  const assessment = assessHealth(load.state, nowMs);
  const tone = TONE[assessment.level];

  return (
    <section className="rounded-2xl border border-line/10 bg-surface/[0.03] p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Service health</p>
          <h2 className="text-lg font-semibold tracking-tight text-ink">Background scanner</h2>
          <p className="flex items-center gap-2 text-sm">
            <span className={`h-2.5 w-2.5 rounded-full ${tone.dot}`} />
            <span className={`font-medium ${tone.text}`}>{assessment.label}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setReloadKey((value) => value + 1)}
          aria-label="Refresh service status"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-line/10 bg-surface/[0.03] text-ink-2 transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          <RefreshCw className={`h-4 w-4 ${load.loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {load.error && (
        <div className="mt-4 rounded-xl border border-down/30 bg-down/10 px-4 py-3 text-sm text-down">
          Status could not be loaded: {load.error}
        </div>
      )}

      {load.loading && !load.state ? (
        <div className="mt-6 flex items-center gap-3 text-sm text-ink-2">
          <Loader2 className="h-4 w-4 animate-spin text-accent" />
          Checking the scanner…
        </div>
      ) : (
        <dl className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Stat label="Market feed" value={load.state?.connection_status ?? 'Unknown'} />
          <Stat label="Last data update" value={timeAgo(load.state?.last_success_at ?? null, nowMs)} />
          <Stat label="Last scan" value={timeAgo(load.state?.last_run_at ?? null, nowMs)} />
          <Stat
            label="Last scan coverage"
            value={
              load.state?.last_scan_symbols != null
                ? `${load.state.last_scan_symbols} assets, ${load.state.last_scan_signals ?? 0} signals updated`
                : 'No scans yet'
            }
          />
        </dl>
      )}

      {load.state?.last_error && (
        <div className="mt-4 rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-ink">
          <p className="font-medium">Last error, {timeAgo(load.state.last_error_at, nowMs)}</p>
          <p className="mt-1 break-words text-ink-2">{load.state.last_error}</p>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line/10 bg-surface/[0.02] px-4 py-3">
      <dt className="text-xs font-semibold uppercase tracking-wider text-ink-3">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-ink">{value}</dd>
    </div>
  );
}
