import { useEffect, useMemo, useState } from 'react';
import { CryptoMoverAnalysis } from '@/components/CryptoMoverAnalysis';
import { MAX_MONITORED_ASSETS } from '@/lib/sma';
import type { SignalLearningModel } from '@/lib/aiLearning';
import { Coins, Loader2, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import {
  fetchCryptoMovers,
  fetchCurrentDayCryptoMovers,
  formatChange,
  formatCompactUsd,
  formatUsd,
  type CryptoMover,
} from '@/lib/cryptoMovers';

const LEADERBOARD_SIZE = 10;

type Props = { selectedSymbols: string[]; onMonitorAsset: (symbol: string) => void; aiModel: SignalLearningModel };

type LoadState = { movers: CryptoMover[]; error: string | null; loading: boolean };

export function CryptoMovers({ selectedSymbols, onMonitorAsset, aiModel }: Props) {
  const [load, setLoad] = useState<LoadState>({ movers: [], error: null, loading: true });
  const [today, setToday] = useState<LoadState & { updatedAt: string | null }>({ movers: [], error: null, loading: true, updatedAt: null });
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoad((previous) => ({ ...previous, loading: true }));
    fetchCryptoMovers()
      .then((movers) => {
        if (!cancelled) setLoad({ movers, error: null, loading: false });
      })
      .catch((err: Error) => {
        if (!cancelled) setLoad((previous) => ({ movers: previous.movers, error: err.message, loading: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    let cancelled = false;
    const refreshToday = async () => {
      try {
        const result = await fetchCurrentDayCryptoMovers();
        if (!cancelled) setToday({ movers: result.movers, error: null, loading: false, updatedAt: result.updatedAt });
      } catch (err) {
        if (!cancelled) setToday((previous) => ({ ...previous, error: err instanceof Error ? err.message : "Current-day data is temporarily unavailable.", loading: false }));
      }
    };
    void refreshToday();
    const timer = window.setInterval(refreshToday, 60_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [reloadKey]);

  const dates = useMemo(() => [...new Set(load.movers.map((mover) => mover.tradeDate))], [load.movers]);
  const activeDate = selectedDate && dates.includes(selectedDate) ? selectedDate : dates[0] ?? null;
  const dayMovers = useMemo(
    () => load.movers.filter((mover) => mover.tradeDate === activeDate).sort((a, b) => a.volumeRank - b.volumeRank),
    [load.movers, activeDate],
  );
  const gainers = useMemo(
    () => [...dayMovers].sort((a, b) => b.changePct - a.changePct).slice(0, LEADERBOARD_SIZE),
    [dayMovers],
  );
  const losers = useMemo(
    () => [...dayMovers].sort((a, b) => a.changePct - b.changePct).slice(0, LEADERBOARD_SIZE),
    [dayMovers],
  );

  const todayGainers = useMemo(() => [...today.movers].sort((a, b) => b.changePct - a.changePct).slice(0, LEADERBOARD_SIZE), [today.movers]);
  const todayLosers = useMemo(() => [...today.movers].sort((a, b) => a.changePct - b.changePct).slice(0, LEADERBOARD_SIZE), [today.movers]);
  const selectedMover = today.movers.find((mover) => mover.symbol === selectedSymbol) ?? dayMovers.find((mover) => mover.symbol === selectedSymbol) ?? todayGainers[0] ?? todayLosers[0] ?? gainers[0] ?? losers[0] ?? null;

  useEffect(() => {
    if (!selectedMover) { setSelectedSymbol(null); return; }
    if (![...dayMovers, ...today.movers].some((mover) => mover.symbol === selectedSymbol)) setSelectedSymbol(selectedMover.symbol);
  }, [selectedMover, selectedSymbol, dayMovers, today.movers]);

  return (
    <section className="mt-8 flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Crypto watch list</p>
          <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink">Crypto market movers</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-2">
            See live current UTC-day gainers and losers, then explore the last 7 completed market days. Current-day rankings refresh automatically every 60 seconds. Historical daily candles retain UTC market-day boundaries. Select any mover to open its live chart and analysis.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setReloadKey((value) => value + 1)}
          aria-label="Reload crypto movers"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-line/10 bg-surface/[0.03] text-ink-2 transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          <RefreshCw className={`h-4 w-4 ${load.loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="rounded-2xl border border-accent/25 bg-accent/[0.04] p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Live market day · UTC</p>
            <h3 className="mt-1 text-lg font-semibold text-ink">Today's gainers and losers</h3>
            <p className="mt-1 text-xs text-ink-3">Rankings use Binance's current UTC trading-day change, not the previous rolling 24 hours.</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-ink-3">
            <span className={today.loading ? "h-2 w-2 animate-pulse rounded-full bg-accent" : "h-2 w-2 rounded-full bg-up"} />
            {today.loading && today.movers.length === 0 ? "Loading live rankings…" : today.updatedAt ? "Updated " + new Date(today.updatedAt).toLocaleTimeString() : "Waiting for update"}
          </div>
        </div>
        {today.error && <p className="mb-3 text-xs text-down">Live rankings could not refresh: {today.error}. Showing the last successful update where available.</p>}
        {today.movers.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <Leaderboard title="Today's top gainers" tone="up" movers={todayGainers} selectedSymbol={selectedMover?.symbol ?? null} onSelect={setSelectedSymbol} />
            <Leaderboard title="Today's top losers" tone="down" movers={todayLosers} selectedSymbol={selectedMover?.symbol ?? null} onSelect={setSelectedSymbol} />
          </div>
        ) : (
          <div className="rounded-xl border border-line/10 p-5 text-sm text-ink-2">{today.loading ? "Connecting to Binance market data…" : "Current-day rankings are temporarily unavailable."}</div>
        )}
      </div>

      {load.error && (
        <div className="rounded-xl border border-down/30 bg-down/10 px-4 py-3 text-sm text-down">
          Crypto data could not be loaded: {load.error}
        </div>
      )}

      {load.loading && load.movers.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-line/10 bg-surface/[0.03] p-6 text-sm text-ink-2">
          <Loader2 className="h-4 w-4 animate-spin text-accent" />
          Loading crypto movers…
        </div>
      ) : !activeDate ? (
        <div className="rounded-2xl border border-line/10 bg-surface/[0.03] px-6 py-12 text-center text-sm text-ink-2">
          <Coins className="mx-auto mb-3 h-6 w-6 text-ink-3" />
          No completed-day snapshot is available yet. Refresh to request a fresh capture from the market-data service.
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 text-xs text-ink-3">
            <span>{dates.length} of 7 daily snapshots available</span>
            <span>Select a date to view that day's rankings</span>
          </div>
          <div role="tablist" className="flex flex-wrap gap-2">
            {dates.map((date) => (
              <button
                key={date}
                type="button"
                role="tab"
                aria-selected={date === activeDate}
                onClick={() => setSelectedDate(date)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium tabular-nums transition-all duration-200 ${
                  date === activeDate
                    ? 'border-accent/40 bg-accent/10 text-accent'
                    : 'border-line/10 bg-surface/[0.03] text-ink-2 hover:text-ink'
                }`}
              >
                {date}
              </button>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Leaderboard title="Top gainers" tone="up" movers={gainers} selectedSymbol={selectedMover?.symbol ?? null} onSelect={setSelectedSymbol} />
            <Leaderboard title="Top losers" tone="down" movers={losers} selectedSymbol={selectedMover?.symbol ?? null} onSelect={setSelectedSymbol} />
          </div>

          {selectedMover && (
            <CryptoMoverAnalysis
              key={selectedMover.symbol}
              symbol={selectedMover.symbol}
              name={selectedMover.base}
              changePct={selectedMover.changePct}
              close={selectedMover.close}
              isMonitored={selectedSymbols.includes(selectedMover.symbol)}
              canMonitor={selectedSymbols.length < MAX_MONITORED_ASSETS}
              onMonitor={() => onMonitorAsset(selectedMover.symbol)}
              aiModel={aiModel}
            />
          )}

          <WatchListTable movers={dayMovers} />
        </>
      )}
    </section>
  );
}

function Leaderboard({ title, tone, movers, selectedSymbol, onSelect }: { title: string; tone: 'up' | 'down'; movers: CryptoMover[]; selectedSymbol: string | null; onSelect: (symbol: string) => void }) {
  const Icon = tone === 'up' ? TrendingUp : TrendingDown;
  const toneClass = tone === 'up' ? 'text-up bg-up/10' : 'text-down bg-down/10';
  return (
    <div className="hud-panel rounded-2xl border border-line/10 bg-surface/[0.03] p-5 hover:shadow-glow">
      <div className="mb-3 flex items-center gap-2">
        <Icon className={`h-4 w-4 ${tone === 'up' ? 'text-up' : 'text-down'}`} />
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
      </div>
      <ul className="divide-y divide-line/10">
        {movers.map((mover, index) => (
          <li key={mover.symbol}>
            <button type="button" onClick={() => onSelect(mover.symbol)} aria-pressed={selectedSymbol === mover.symbol}
              className={selectedSymbol === mover.symbol ? "flex w-full items-center justify-between gap-3 rounded-lg bg-accent/10 px-2 py-2.5 text-left ring-1 ring-accent/30" : "flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-surface/[0.05]"}>
              <span className="flex min-w-0 items-center gap-3">
                <span className="w-5 text-xs tabular-nums text-ink-3">{index + 1}</span>
                <span className="break-words text-sm font-semibold text-ink">{mover.base}</span>
                <span className="hidden text-xs text-ink-3 sm:inline">/ USDT</span>
              </span>
              <span className="flex items-center gap-4 text-right">
                <span className="hidden font-mono text-xs tabular-nums text-ink-2 sm:inline">{formatUsd(mover.close)}</span>
                <span className={`min-w-[64px] rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums ${toneClass}`}>{formatChange(mover.changePct)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WatchListTable({ movers }: { movers: CryptoMover[] }) {
  return (
    <div className="hud-panel overflow-hidden rounded-2xl border border-line/10 bg-surface/[0.03]">
      <div className="flex items-center justify-between border-b border-line/10 px-5 py-3">
        <h3 className="text-sm font-semibold text-ink">Full watch list</h3>
        <span className="text-xs text-ink-3">{movers.length} pairs · source: Binance</span>
      </div>
      <div className="max-h-[480px] overflow-auto">
        <table className="w-full min-w-[560px] border-collapse text-left text-xs">
          <thead className="sticky top-0 bg-canvas/95 text-xs uppercase tracking-wider text-ink-3 backdrop-blur">
            <tr>
              <th className="px-5 py-2.5 font-semibold">#</th>
              <th className="px-3 py-2.5 font-semibold">Pair</th>
              <th className="px-3 py-2.5 text-right font-semibold">Close</th>
              <th className="px-3 py-2.5 text-right font-semibold">Change</th>
              <th className="px-5 py-2.5 text-right font-semibold">Volume</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/10">
            {movers.map((mover) => (
              <tr key={mover.symbol} className="transition-colors hover:bg-surface/[0.03]">
                <td className="px-5 py-2.5 tabular-nums text-ink-3">{mover.volumeRank}</td>
                <td className="px-3 py-2.5 font-medium text-ink">{mover.base}/USDT</td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums text-ink">{formatUsd(mover.close)}</td>
                <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${mover.changePct >= 0 ? 'text-up' : 'text-down'}`}>
                  {formatChange(mover.changePct)}
                </td>
                <td className="px-5 py-2.5 text-right tabular-nums text-ink-2">{formatCompactUsd(mover.quoteVolume)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
