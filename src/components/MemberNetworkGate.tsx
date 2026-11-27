import { useEffect, useState, type ReactNode } from 'react';
import { Loader2, Clock3 } from 'lucide-react';
import { activateMemberReferral, getMembershipStatus, getMemberReferralProfile, type MembershipStatus } from '@/lib/independentApi';

type Props = { children: ReactNode };

export function MemberNetworkGate({ children }: Props) {
  const [ready, setReady] = useState(false);
  const [membership, setMembership] = useState<MembershipStatus | null>(null);
  const [teamAssigned, setTeamAssigned] = useState<boolean | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const status = await getMembershipStatus();
        if (!active) return;
        setMembership(status);

        // Referral attribution must never prevent a new account from registering.
        // If a valid invite is present, attach it quietly; otherwise continue.
        if (status.status === 'approved' && !status.isAdmin) {
          const params = new URLSearchParams(window.location.search);
          const code = (params.get('ref') || localStorage.getItem('supertech-referral-code') || '').trim().toUpperCase();
          if (code) {
            try {
              const result = await activateMemberReferral(code);
              if (result.assigned) {
                localStorage.removeItem('supertech-referral-code');
                params.delete('ref');
                const query = params.toString();
                window.history.replaceState({}, '', window.location.pathname + (query ? `?${query}` : '') + window.location.hash);
              }
            } catch {
              // Invalid/unconfigured referral? Keep the member's registration intact.
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

  if (!ready) return <div className="flex min-h-screen items-center justify-center bg-[#070b13] text-cyan-200"><Loader2 className="h-6 w-6 animate-spin" aria-label="Checking membership" /></div>;

  if (!membership) return <main className="flex min-h-screen items-center justify-center bg-[#070b13] px-4 text-slate-100"><section className="max-w-md rounded-2xl border border-white/10 bg-[#0c1420] p-6"><h1 className="text-xl font-semibold">Membership check unavailable</h1><p className="mt-3 text-sm leading-6 text-slate-400">We could not verify your membership right now. Please retry shortly.</p>{error && <p role="alert" className="mt-3 text-xs text-amber-200">{error}</p>}<button onClick={() => window.location.reload()} className="mt-5 rounded-xl bg-cyan-300 px-4 py-3 text-sm font-bold text-slate-950">Retry</button></section></main>;

  if (membership.status !== 'approved') return <main className="flex min-h-screen items-center justify-center bg-[#070b13] px-4 py-10 text-slate-100"><section className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0c1420] p-6 shadow-2xl"><div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-300/10 text-cyan-200"><Clock3 className="h-6 w-6" /></div><p className="text-xs font-bold uppercase tracking-[.18em] text-cyan-200">SuperTech AI membership</p><h1 className="mt-2 text-2xl font-semibold">{membership.status === 'pending' ? 'Your application is awaiting approval' : membership.status === 'rejected' ? 'Membership application not approved' : 'Membership is suspended'}</h1><p className="mt-3 text-sm leading-6 text-slate-400">Your account is registered. The company must approve membership before platform access is enabled.</p>{membership.reviewNote && <p className="mt-4 rounded-xl border border-white/10 p-3 text-sm text-slate-300">Company note: {membership.reviewNote}</p>}<button onClick={() => window.location.reload()} className="mt-5 w-full rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold">Check approval status</button></section></main>;

  return <>{children}</>;
}
