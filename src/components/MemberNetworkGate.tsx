import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Loader2, Clock3, Users } from 'lucide-react';
import { activateMemberReferral, getMembershipStatus, getMemberReferralProfile, type MembershipStatus } from '@/lib/independentApi';

type Props = { children: ReactNode };

export function MemberNetworkGate({ children }: Props) {
  const [ready, setReady] = useState(false);
  const [membership, setMembership] = useState<MembershipStatus | null>(null);
  const [teamAssigned, setTeamAssigned] = useState<boolean | null>(null);
  const [referralCode, setReferralCode] = useState('');
  const [referralError, setReferralError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const status = await getMembershipStatus();
        if (!active) return;
        setMembership(status);

        if (status.status === 'approved' && !status.isAdmin) {
          const params = new URLSearchParams(window.location.search);
          const invite = (params.get('ref') || localStorage.getItem('supertech-referral-code') || '').trim().toLowerCase();
          if (invite) {
            setReferralCode(invite);
            try {
              const activated = await activateMemberReferral(invite);
              if (activated.assigned) {
                localStorage.removeItem('supertech-referral-code');
                params.delete('ref');
                const query = params.toString();
                window.history.replaceState({}, '', window.location.pathname + (query ? `?${query}` : '') + window.location.hash);
              }
            } catch {
              // Keep the invitation code in the form so the member can retry.
            }
          }
          const profile = await getMemberReferralProfile();
          if (active) setTeamAssigned(profile.assigned);
        } else if (status.status === 'approved' && status.isAdmin) {
          setTeamAssigned(true);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Membership could not be verified.');
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => { active = false; };
  }, []);

  async function submitReferral(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = referralCode.trim().toLowerCase();
    if (!/^[a-f0-9]{36}$/.test(code)) {
      setReferralError('Enter the 36-character referral code from your upline.');
      return;
    }
    setSubmitting(true);
    setReferralError('');
    try {
      const result = await activateMemberReferral(code);
      if (!result.assigned) throw new Error('This invitation could not be activated. Ask your upline for a fresh referral link.');
      localStorage.removeItem('supertech-referral-code');
      const params = new URLSearchParams(window.location.search);
      params.delete('ref');
      const query = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (query ? `?${query}` : '') + window.location.hash);
      setTeamAssigned(true);
    } catch (e) {
      setReferralError(e instanceof Error ? e.message : 'Referral activation failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!ready) return <div className="flex min-h-screen items-center justify-center bg-[#070b13] text-cyan-200"><Loader2 className="h-6 w-6 animate-spin" aria-label="Checking membership" /></div>;

  if (!membership || (membership.status === 'approved' && !membership.isAdmin && teamAssigned === null)) return <main className="flex min-h-screen items-center justify-center bg-[#070b13] px-4 text-slate-100"><section className="max-w-md rounded-2xl border border-white/10 bg-[#0c1420] p-6"><h1 className="text-xl font-semibold">Membership check unavailable</h1><p className="mt-3 text-sm leading-6 text-slate-400">We could not verify your membership and team assignment. Please retry shortly.</p>{error && <p role="alert" className="mt-3 text-xs text-amber-200">{error}</p>}<button onClick={() => window.location.reload()} className="mt-5 rounded-xl bg-cyan-300 px-4 py-3 text-sm font-bold text-slate-950">Retry</button></section></main>;

  if (membership.status !== 'approved') return <main className="flex min-h-screen items-center justify-center bg-[#070b13] px-4 py-10 text-slate-100"><section className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0c1420] p-6 shadow-2xl"><div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-300/10 text-cyan-200"><Clock3 className="h-6 w-6" /></div><p className="text-xs font-bold uppercase tracking-[.18em] text-cyan-200">SuperTech AI membership</p><h1 className="mt-2 text-2xl font-semibold">{membership.status === 'pending' ? 'Your application is awaiting approval' : membership.status === 'rejected' ? 'Membership application not approved' : 'Membership is suspended'}</h1><p className="mt-3 text-sm leading-6 text-slate-400">Your account is registered. The company must approve membership before platform access is enabled.</p>{membership.reviewNote && <p className="mt-4 rounded-xl border border-white/10 p-3 text-sm text-slate-300">Company note: {membership.reviewNote}</p>}<button onClick={() => window.location.reload()} className="mt-5 w-full rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold">Check approval status</button></section></main>;

  if (!membership.isAdmin && teamAssigned === false) return <main className="flex min-h-screen items-center justify-center bg-[#070b13] px-4 py-10 text-slate-100"><section className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0c1420] p-6 shadow-2xl"><div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-300/10 text-cyan-200"><Users className="h-6 w-6" /></div><p className="text-xs font-bold uppercase tracking-[.18em] text-cyan-200">SuperTech AI member network</p><h1 className="mt-2 text-2xl font-semibold">Who invited you?</h1><p className="mt-3 text-sm leading-6 text-slate-400">Your membership is approved. Enter the referral code shared by your upline, or open the invitation link they sent you. Every member must be connected to one of the five company teams before entering the platform.</p><form onSubmit={submitReferral} className="mt-5 space-y-3"><label htmlFor="upline-code" className="block text-sm font-medium text-slate-200">Referral code</label><input id="upline-code" value={referralCode} onChange={(event) => setReferralCode(event.target.value)} autoComplete="off" className="w-full rounded-xl border border-white/15 bg-[#070b13] px-4 py-3 text-sm text-white outline-none focus:border-cyan-300" placeholder="Paste your upline's referral code" /><button type="submit" disabled={submitting || !referralCode.trim()} className="w-full rounded-xl bg-cyan-300 px-4 py-3 text-sm font-bold text-slate-950 disabled:opacity-50">{submitting ? 'Connecting…' : 'Connect to my upline'}</button></form>{referralError && <p role="alert" className="mt-4 text-sm text-amber-200">{referralError}</p>}</section></main>;

  return <>{children}</>;
}
