import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Coins, Gift, RefreshCw, ShieldCheck, Trophy } from 'lucide-react';
import {
  getCompanyBusinessOverview, getCompanyJust4YouDashboard, runCompanyJust4YouDraw,
  type CompanyBusinessOverview, type CompanyJust4YouDashboard,
} from '@/lib/independentApi';
import { formatLocalDateTime } from '@/lib/localTime';

const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const date = (value: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00Z`));
const panel = 'rounded-2xl border border-line/15 bg-surface/[0.035] p-4 sm:p-5';

const incomeLabels: Record<string, string> = {
  direct: 'Direct referrals', infinity: 'Infinity payouts', infinity_pool: 'Infinity reserved pool',
  unilevel: 'Unilevel', just_4_you: 'Just 4 U awards', just_4_you_pool: 'Just 4 U reserved pool',
};

export function CompanyBusinessPanel() {
  const [overview, setOverview] = useState<CompanyBusinessOverview | null>(null);
  const [bonus, setBonus] = useState<CompanyJust4YouDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [drawing, setDrawing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [business, just4you] = await Promise.all([getCompanyBusinessOverview(), getCompanyJust4YouDashboard()]);
      setOverview(business); setBonus(just4you);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load company financials.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const draw = async () => {
    setDrawing(true); setError(''); setNotice('');
    try {
      const result = await runCompanyJust4YouDraw();
      setNotice(`Weekly Just 4 U draw completed. ${result.winnerName} won ${money(result.prizeAmount)} from ${result.eligibleMembers} eligible members.`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'The weekly draw could not be completed.'); }
    finally { setDrawing(false); }
  };

  return <section className="mt-8 flex flex-col gap-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-accent">Company overview</p><h2 className="mt-1 text-xl font-semibold text-ink">Business and income</h2><p className="mt-1 text-sm text-ink-2">Membership sales, company share, member earnings and weekly rewards.</p></div>
      <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-line/15 px-4 py-2 text-sm text-ink disabled:opacity-50"><RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'}/>Refresh</button>
    </div>
    {error && <p role="alert" className="flex items-center gap-2 rounded-xl border border-down/25 bg-down/10 p-3 text-sm text-down"><AlertCircle className="h-4 w-4 shrink-0"/>{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-up/25 bg-up/10 p-3 text-sm text-up">{notice}</p>}
    {loading && !overview ? <p className="rounded-xl border border-line/10 p-8 text-center text-sm text-ink-2">Loading company financials…</p> : overview && <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div className={panel}><p className="text-xs text-ink-3">Approved membership payments</p><p className="mt-2 text-2xl font-bold tabular-nums text-ink">{money(overview.totalSales)}</p><p className="mt-1 text-xs text-ink-3">{overview.approvedPayments} approved payments</p></div>
        <div className={panel}><p className="text-xs text-ink-3">Total company earnings recorded</p><p className="mt-2 text-2xl font-bold tabular-nums text-up">{money(overview.companyTotalIncome)}</p><p className="mt-1 text-xs text-ink-3">35% share + Genesis referral earnings ({money(overview.companyReferralIncome)})</p></div>
        <div className={panel}><p className="text-xs text-ink-3">Company 35% share</p><p className="mt-2 text-2xl font-bold tabular-nums text-up">{money(overview.companyRevenue)}</p><p className="mt-1 text-xs text-ink-3">{overview.companyRevenueRecords} recorded allocations</p></div>
        <div className={panel}><p className="text-xs text-ink-3">Awaiting payment review</p><p className="mt-2 text-2xl font-bold tabular-nums text-ink">{money(overview.pendingPaymentValue)}</p><p className="mt-1 text-xs text-ink-3">{overview.pendingPayments} submissions</p></div>
        <div className={panel}><p className="text-xs text-ink-3">Rejected submissions</p><p className="mt-2 text-2xl font-bold tabular-nums text-ink">{overview.rejectedPayments}</p><p className="mt-1 text-xs text-ink-3">No commission posted for rejected payments</p></div>
      </div>

      <div className={panel}>
        <div className="flex items-center gap-2"><Coins className="h-5 w-5 text-accent"/><h3 className="font-semibold text-ink">Income allocation</h3></div>
        <p className="mt-1 text-xs text-ink-3">Totals are calculated from the Appwrite commission records. Reserved pools are not member payouts.</p>
        <div className="mt-4 divide-y divide-line/10">
          {Object.entries(incomeLabels).map(([key, label]) => {
            const item = overview.income[key] || { accrued: 0, pending: 0, paid: 0, records: 0 };
            return <div key={key} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div><p className="text-sm font-medium text-ink">{label}</p><p className="mt-0.5 text-xs text-ink-3">{item.records} records · {money(item.pending)} pending or reserved · {money(item.paid)} paid</p></div>
              <p className="text-sm font-semibold tabular-nums text-ink">{money(item.accrued)}</p>
            </div>;
          })}
        </div>
        <div className="mt-4 grid gap-3 border-t border-line/10 pt-4 sm:grid-cols-2">
          <div><p className="text-xs text-ink-3">Standard $300 plan sales</p><p className="mt-1 text-lg font-semibold text-ink">{money(overview.planSales.standard300)}</p></div>
          <div><p className="text-xs text-ink-3">Premium $500 plan sales</p><p className="mt-1 text-lg font-semibold text-ink">{money(overview.planSales.automation500)}</p></div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-amber-300/25 bg-gradient-to-br from-amber-300/[.10] via-surface/[.04] to-surface/[.02] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3"><div className="rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-amber-300"><Gift className="h-5 w-5"/></div><div><p className="text-xs font-bold uppercase tracking-[.18em] text-amber-300">Weekly random reward</p><h3 className="mt-1 text-xl font-bold text-ink">JUST 4 YOU</h3><p className="mt-1 text-xs text-ink-2">One randomly selected eligible active, paid member.</p></div></div>
          <span className="rounded-full border border-amber-300/30 px-3 py-1 text-xs font-semibold text-amber-300">5% weekly allocation</span>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-line/10 bg-surface/[.05] p-3"><p className="text-xs text-ink-3">Previous week's pool</p><p className="mt-2 text-xl font-bold text-amber-300">{money(bonus?.salesPool || 0)}</p></div>
          <div className="rounded-xl border border-line/10 bg-surface/[.05] p-3"><p className="text-xs text-ink-3">Previous week's sales</p><p className="mt-2 text-xl font-bold text-ink">{money(bonus?.qualifyingSales || 0)}</p><p className="mt-1 text-[11px] text-ink-3">{bonus ? `${date(bonus.weekStart)} – ${date(bonus.weekEnd)}` : 'Current week'}</p></div>
          <div className="rounded-xl border border-line/10 bg-surface/[.05] p-3"><p className="text-xs text-ink-3">Eligible members</p><p className="mt-2 text-xl font-bold text-ink">{bonus?.eligibleMembers ?? '—'}</p></div>
        </div>
        {bonus?.currentDraw ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-up/20 bg-up/[.05] p-4"><div className="flex items-center gap-2"><Trophy className="h-5 w-5 text-amber-300"/><div><p className="text-sm font-semibold text-ink">Previous week's winner: {bonus.currentDraw.winnerName}</p><p className="mt-1 text-xs text-ink-3">{money(bonus.currentDraw.prizeAmount)} · Drawn {formatLocalDateTime(bonus.currentDraw.drawnAt)}</p></div></div><span className="text-xs font-semibold text-up">Draw complete</span></div> : <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="max-w-xl text-xs leading-5 text-ink-3">The draw is scheduled automatically every Monday at 00:05 Nairobi time. This button can run or retry the previous week's draw; only one winner is recorded for each week.</p><button type="button" onClick={() => void draw()} disabled={!bonus?.canDraw || drawing} className="inline-flex items-center gap-2 rounded-xl bg-amber-300 px-4 py-3 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">{drawing ? <RefreshCw className="h-4 w-4 animate-spin"/> : <Trophy className="h-4 w-4"/>}{drawing ? 'Drawing…' : "Draw previous week's winner"}</button></div>}
        {bonus?.latestDraw && !bonus.currentDraw && <p className="mt-3 text-xs text-ink-3">Previous winner: {bonus.latestDraw.winnerName} · {money(bonus.latestDraw.prizeAmount)}.</p>}
      </div>
      <p className="text-xs leading-5 text-ink-3"><ShieldCheck className="mr-1 inline h-3.5 w-3.5"/>Only the Genesis company account can view these totals or run the draw. The 5% Just 4 U reward is taken from the agreed allocation, not added on top of the 100% sales split. Infinity's 20% allocation remains reserved until the agreed 2-by-2 qualification and placement rules are fully verified.</p>
    </>}
  </section>;
}
