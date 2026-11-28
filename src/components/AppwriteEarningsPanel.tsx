import { useCallback, useEffect, useState } from 'react';
import { Coins, RefreshCw, TrendingUp, Trophy } from 'lucide-react';
import { getIndependentCommissions, type IndependentCommission } from '@/lib/independentApi';
import { formatLocalDateTime } from '@/lib/localTime';

const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const labels: Record<string, string> = { direct: 'Direct referral', infinity: 'Infinity', unilevel: 'Unilevel', just_4_you: 'Just 4 U weekly reward' };

export function AppwriteEarningsPanel() {
  const [rows, setRows] = useState<IndependentCommission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setRows((await getIndependentCommissions()).commissions); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load your earnings.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const accrued = rows.reduce((sum, row) => sum + row.amount, 0);
  const pending = rows.filter(row => row.status === 'pending' || row.status === 'payable').reduce((sum, row) => sum + row.amount, 0);
  const paid = rows.filter(row => row.status === 'paid').reduce((sum, row) => sum + row.amount, 0);
  const groups = ['direct', 'infinity', 'unilevel', 'just_4_you'];

  return <section className="mt-8 flex flex-col gap-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-accent">My account</p><h2 className="mt-1 text-xl font-semibold text-ink">My earnings</h2><p className="mt-1 text-sm text-ink-2">Your referral commissions and weekly Just 4 U rewards.</p></div><button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-line/15 px-4 py-2 text-sm text-ink disabled:opacity-50"><RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'}/>Refresh</button></div>
    {error && <p role="alert" className="rounded-xl border border-down/25 bg-down/10 p-3 text-sm text-down">{error}</p>}
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-2xl border border-line/15 bg-surface/[.035] p-4"><p className="text-xs text-ink-3">Total earnings recorded</p><p className="mt-2 text-2xl font-bold text-ink">{loading ? '—' : money(accrued)}</p></div>
      <div className="rounded-2xl border border-line/15 bg-surface/[.035] p-4"><p className="text-xs text-ink-3">Pending approval / payout</p><p className="mt-2 text-2xl font-bold text-amber-300">{loading ? '—' : money(pending)}</p></div>
      <div className="rounded-2xl border border-line/15 bg-surface/[.035] p-4"><p className="text-xs text-ink-3">Marked as paid</p><p className="mt-2 text-2xl font-bold text-up">{loading ? '—' : money(paid)}</p></div>
    </div>
    <div className="rounded-2xl border border-line/15 bg-surface/[.035] p-4 sm:p-5">
      <div className="flex items-center gap-2"><Coins className="h-5 w-5 text-accent"/><h3 className="font-semibold text-ink">Income by source</h3></div>
      <div className="mt-3 divide-y divide-line/10">
        {groups.map(type => {
          const matching = rows.filter(row => row.type === type);
          const amount = matching.reduce((sum, row) => sum + row.amount, 0);
          return <div key={type} className="flex items-center justify-between gap-3 py-3"><div className="flex items-center gap-2">{type === 'just_4_you' ? <Trophy className="h-4 w-4 text-amber-300"/> : <TrendingUp className="h-4 w-4 text-ink-3"/>}<div><p className="text-sm font-medium text-ink">{labels[type]}</p><p className="text-xs text-ink-3">{matching.length} records</p></div></div><p className="text-sm font-semibold tabular-nums text-ink">{money(amount)}</p></div>;
        })}
      </div>
    </div>
    <div className="rounded-2xl border border-line/15 bg-surface/[.035] p-4 sm:p-5">
      <h3 className="font-semibold text-ink">Earnings history</h3>
      {loading ? <p className="py-6 text-sm text-ink-3">Loading earnings…</p> : rows.length ? <div className="mt-3 divide-y divide-line/10">{[...rows].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(row=><div key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm font-medium text-ink">{labels[row.type] || row.type}</p><p className="mt-1 text-xs text-ink-3">{formatLocalDateTime(row.createdAt)}{row.level ? ' · Level ' + row.level : ''}</p></div><div className="text-right"><p className="text-sm font-semibold tabular-nums text-ink">{money(row.amount)}</p><p className="mt-1 text-[11px] capitalize text-ink-3">{row.status.replace(/_/g, ' ')}</p></div></div>)}</div> : <p className="py-8 text-center text-sm text-ink-3">No earnings have been recorded yet. Your eligible commissions will appear here.</p>}
    </div>
    <p className="text-xs leading-5 text-ink-3">Pending earnings are not yet withdrawals. A reward appears here only after the company records the commission or Just 4 U award.</p>
  </section>;
}
