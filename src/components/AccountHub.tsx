import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Users, Network, Wallet, RefreshCw, ShieldCheck, Clock3, Link2, AlertCircle } from 'lucide-react';
import { getMemberReferralProfile, getMemberNetwork, getMembershipStatus, type MemberReferralProfile, type MemberNetwork, type MembershipStatus } from '@/lib/independentApi';

type Tab = 'referrals' | 'network' | 'earnings';
type Props = { initialTab?: Tab };
const tabs: { id: Tab; label: string; icon: typeof Users }[] = [
  { id: 'referrals', label: 'Referrals', icon: Users },
  { id: 'network', label: 'My Network', icon: Network },
  { id: 'earnings', label: 'Wallet & Earnings', icon: Wallet },
];
const planName = (plan?: MembershipStatus['planCode']) => plan === 'automation_500' ? 'Premium · $500' : plan === 'standard_300' ? 'Standard · $300' : 'Free';

export function AccountHub({ initialTab = 'referrals' }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [membership, setMembership] = useState<MembershipStatus | null>(null);
  const [referral, setReferral] = useState<MemberReferralProfile | null>(null);
  const [network, setNetwork] = useState<MemberNetwork | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => setTab(initialTab), [initialTab]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const [m, r] = await Promise.allSettled([getMembershipStatus(), getMemberReferralProfile()]);
    if (m.status === 'fulfilled') setMembership(m.value);
    else setError(m.reason instanceof Error ? m.reason.message : 'Membership details unavailable.');
    if (r.status === 'fulfilled') {
      setReferral(r.value);
      if (r.value.assigned) {
        try { setNetwork(await getMemberNetwork()); } catch { setNetwork(null); }
      } else setNetwork(null);
    } else setError((old) => old || (r.reason instanceof Error ? r.reason.message : 'Referral details unavailable.'));
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const referralLink = useMemo(() => referral?.assigned && referral.referralCode ? `${window.location.origin}/?ref=${referral.referralCode}` : '', [referral]);
  const copyLink = async () => {
    if (!referralLink) return;
    try { await navigator.clipboard.writeText(referralLink); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { setError('Could not copy the link. Please copy it from the field.'); }
  };
  const status = membership?.status === 'approved' ? 'Approved' : membership?.status === 'pending' ? 'Awaiting approval' : membership?.status === 'rejected' ? 'Not approved' : membership?.status === 'suspended' ? 'Suspended' : 'Checking';
  const statusColor = membership?.status === 'approved' ? 'text-up' : 'text-warn';

  return <section className="mt-8 space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Your membership · your growth</p>
      <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Members Area</h2>
      <p className="mt-1 max-w-2xl text-sm text-ink-2">Your account, invitation link, team and earnings information in one place.</p>
    </div><button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-line/10 bg-surface/[0.05] px-4 py-2 text-sm text-ink disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button></div>

    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-2xl border border-line/10 bg-surface/[0.035] p-4"><p className="text-xs text-ink-3">Membership</p><p className={`mt-2 text-lg font-semibold ${statusColor}`}>{status}</p><p className="mt-1 text-xs text-ink-3">{planName(membership?.planCode)}</p></div>
      <div className="rounded-2xl border border-line/10 bg-surface/[0.035] p-4"><p className="text-xs text-ink-3">Direct referrals</p><p className="mt-2 text-2xl font-semibold text-ink">{network?.directCount ?? '—'}</p><p className="mt-1 text-xs text-ink-3">Personally invited members</p></div>
      <div className="rounded-2xl border border-line/10 bg-surface/[0.035] p-4"><p className="text-xs text-ink-3">Team members</p><p className="mt-2 text-2xl font-semibold text-ink">{network?.teamCount ?? '—'}</p><p className="mt-1 text-xs text-ink-3">Members in your assigned team</p></div>
    </div>

    <div className="grid grid-cols-3 gap-2 rounded-2xl border border-line/10 bg-surface/[0.035] p-1.5">
      {tabs.map(({id,label,icon:Icon}) => <button key={id} onClick={() => setTab(id)} aria-pressed={tab===id} className={`flex min-w-0 items-center justify-center gap-2 rounded-xl px-2 py-3 text-xs font-semibold sm:text-sm ${tab===id?'bg-surface/[0.14] text-ink shadow-sm':'text-ink-2 hover:bg-surface/[0.06]'}`}><Icon className="h-4 w-4 shrink-0"/><span className="truncate">{label}</span></button>)}
    </div>
    {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-warn/25 bg-warn/5 px-4 py-3 text-sm text-ink-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warn"/>{error}</div>}
    {loading && <div className="rounded-2xl border border-line/10 bg-surface/[0.035] p-6 text-sm text-ink-2">Loading your member information…</div>}

    {!loading && tab==='referrals' && <div className="space-y-4 rounded-2xl border border-line/10 bg-surface/[0.035] p-5">
      <div className="flex items-center gap-2"><Link2 className="h-5 w-5 text-accent"/><h3 className="font-semibold text-ink">Your personal invitation link</h3></div>
      {referral?.assigned && referralLink ? <><p className="text-sm text-ink-2">Share this link to connect new members to your upline and team.</p>
        <div className="flex flex-col gap-2 sm:flex-row"><input readOnly value={referralLink} aria-label="Your referral link" className="min-w-0 flex-1 rounded-xl border border-line/15 bg-canvas px-3 py-3 text-sm text-ink"/><button onClick={() => void copyLink()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-bold text-canvas"><Copy className="h-4 w-4"/>{copied?'Copied':'Copy link'}</button></div>
        <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-line/10 p-3"><p className="text-xs text-ink-3">Referral code</p><p className="mt-1 break-all font-mono text-sm text-ink">{referral.referralCode}</p></div><div className="rounded-xl border border-line/10 p-3"><p className="text-xs text-ink-3">Team owner account</p><p className="mt-1 break-all text-sm text-ink">{referral.teamOwnerId || 'Not assigned'}</p></div></div>
      </> : <div className="rounded-xl border border-warn/20 bg-warn/5 p-4 text-sm text-ink-2"><Clock3 className="mr-2 inline h-4 w-4 text-warn"/>Your referral link becomes available after the company or your sponsor assigns your place in one of the five teams.</div>}
    </div>}

    {!loading && tab==='network' && <div className="space-y-4 rounded-2xl border border-line/10 bg-surface/[0.035] p-5">
      <div className="flex items-center gap-2"><Users className="h-5 w-5 text-accent"/><h3 className="font-semibold text-ink">Your team network</h3></div>
      {network?.members.length ? <div className="divide-y divide-line/10">{network.members.map(member=><div key={member.memberId} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><span className="font-mono text-ink">{member.memberId}</span><span className="text-xs text-ink-3">{member.role==='owner'?'Team owner':'Member'} · {new Date(member.joinedAt).toLocaleDateString()}</span></div>)}</div> : <p className="text-sm text-ink-2">No team members are available yet, or your team assignment has not been completed.</p>}
      {referral?.assigned && <p className="text-xs text-ink-3">Team owner account: {referral.teamOwnerId}</p>}
    </div>}

    {!loading && tab==='earnings' && <div className="space-y-4">
      <div className="rounded-2xl border border-line/10 bg-surface/[0.035] p-5"><div className="flex items-center gap-2"><Wallet className="h-5 w-5 text-accent"/><h3 className="font-semibold text-ink">TRC20 wallet & earnings</h3></div>
        <p className="mt-2 text-sm text-ink-2">The Appwrite financial ledger, commission calculations, payout wallet and withdrawal service are not connected yet.</p>
        <div className="mt-4 rounded-xl border border-warn/20 bg-warn/5 p-3 text-xs text-ink-2"><ShieldCheck className="mr-2 inline h-4 w-4 text-warn"/>No balances or commissions are invented. This area does not read Supabase financial records.</div>
      </div>
      {['Direct referral bonuses','Infinity bonuses','Unilevel bonuses','Weekly Just 4 You bonus','Withdrawal history'].map(label=><div key={label} className="rounded-xl border border-line/10 bg-surface/[0.035] p-4"><p className="text-sm font-medium text-ink">{label}</p><p className="mt-1 text-xs text-ink-3">Awaiting secure Appwrite ledger integration</p></div>)}
    </div>}
  </section>;
}
