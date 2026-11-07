import { useCallback, useEffect, useState } from 'react';
import { Gift, RefreshCw, Trophy } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Draw = {
  week_start: string;
  week_end: string;
  qualifying_sales: number;
  prize_amount: number;
  eligible_members: number;
  winner_display_name: string | null;
  drawn_at: string | null;
  payout_status: string;
};
type Dashboard = {
  week_start: string;
  week_end: string;
  sales_pool: number;
  qualifying_sales: number;
  bonus_rate_pct: number;
  latest_draw: Draw | null;
};

const money = (amount: number) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 6,
}).format(amount);
const date = (value: string) => new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Nairobi',
}).format(new Date(`${value}T12:00:00+03:00`));

export function Just4YouBonus() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data: result, error: requestError } = await supabase.rpc('just4you_get_dashboard');
    if (requestError) {
      setError('Weekly bonus information is temporarily unavailable.');
      setLoading(false);
      return;
    }
    setData(result as Dashboard);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const winner = data?.latest_draw;
  return (
    <section aria-labelledby="just4you-title" className="mt-7 overflow-hidden rounded-2xl border border-amber-400/30 bg-gradient-to-br from-amber-400/[0.10] via-surface/[0.05] to-surface/[0.02] p-5 shadow-[0_12px_45px_rgba(0,0,0,0.12)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-amber-300/40 bg-amber-300/10 p-3 text-amber-300">
            <Gift className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-amber-300">Important · Member Bonus</p>
            <h2 id="just4you-title" className="mt-1 text-xl font-bold tracking-tight text-ink sm:text-2xl">JUST 4 YOU</h2>
            <p className="mt-1 text-sm text-ink-2">One active member. One weekly reward. Everyone has a chance.</p>
          </div>
        </div>
        <button type="button" onClick={() => { setLoading(true); void load(); }} className="inline-flex items-center gap-2 rounded-lg border border-line/20 px-3 py-2 text-xs font-semibold text-ink-2 transition hover:text-ink" aria-label="Refresh weekly bonus">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error ? (
        <p className="mt-5 rounded-lg border border-line/10 bg-surface/[0.04] p-3 text-sm text-ink-2">{error}</p>
      ) : (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-line/10 bg-surface/[0.05] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-3">This week's bonus pool</p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-amber-300">{loading ? '—' : money(data?.sales_pool ?? 0)}</p>
              <p className="mt-1 text-xs text-ink-3">5% of confirmed membership sales</p>
            </div>
            <div className="rounded-xl border border-line/10 bg-surface/[0.05] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-3">Qualifying sales</p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-ink">{loading ? '—' : money(data?.qualifying_sales ?? 0)}</p>
              <p className="mt-1 text-xs text-ink-3">{data ? `${date(data.week_start)} – ${date(data.week_end)} · EAT` : 'Current week · EAT'}</p>
            </div>
            <div className="rounded-xl border border-line/10 bg-surface/[0.05] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-3">Next draw</p>
              <p className="mt-2 text-2xl font-bold text-ink">Monday</p>
              <p className="mt-1 text-xs text-ink-3">12:05 AM · East Africa Time</p>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Trophy className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-300" />
              <div>
                <p className="text-sm font-semibold text-ink">Latest weekly winner</p>
                {winner?.winner_display_name ? (
                  <>
                    <p className="mt-1 text-lg font-bold text-amber-300">{winner.winner_display_name}</p>
                    <p className="mt-0.5 text-xs text-ink-3">{date(winner.week_start)} – {date(winner.week_end)} · {money(Number(winner.prize_amount))} credited to member earnings</p>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-ink-2">The first weekly winner will be announced here after the draw.</p>
                )}
              </div>
            </div>
            {winner?.winner_display_name && <span className="self-start rounded-full border border-amber-300/30 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-300">Winner announced</span>}
          </div>
          <p className="mt-4 text-xs leading-relaxed text-ink-3">
            Every active, paid member is eligible, whether or not they made a sale that week. The winner is selected randomly from the eligible membership list. The bonus comes from the existing 5% weekly bonus allocation; it is not an extra charge or a second commission on the same sale.
          </p>
        </>
      )}
    </section>
  );
}
