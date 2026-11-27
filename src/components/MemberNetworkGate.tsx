import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Loader2, Link2, ShieldCheck } from 'lucide-react';
import { activateMemberReferral, getMemberReferralProfile } from '@/lib/independentApi';

type Props = { children: ReactNode };

export function MemberNetworkGate({ children }: Props) {
  const [ready, setReady] = useState(false);
  const [assigned, setAssigned] = useState(false);
  const [code, setCode] = useState(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('ref');
    return (fromUrl || localStorage.getItem('supertech-referral-code') || '').trim().toLowerCase();
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const profile = await getMemberReferralProfile();
        if (profile.assigned) {
          if (active) setAssigned(true);
          localStorage.removeItem('supertech-referral-code');
        } else if (active && code) {
          setBusy(true);
          const activated = await activateMemberReferral(code);
          if (activated.assigned) {
            localStorage.removeItem('supertech-referral-code');
            setAssigned(true);
          }
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Member network could not be reached.');
      } finally {
        if (active) { setBusy(false); setReady(true); }
      }
    })();
    return () => { active = false; };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const result = await activateMemberReferral(code.trim().toLowerCase());
      if (!result.assigned) throw new Error('A valid upline referral is required.');
      localStorage.removeItem('supertech-referral-code');
      setAssigned(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The referral link could not be verified.');
    } finally { setBusy(false); }
  };

  if (!ready || busy && !assigned) return <div className="flex min-h-screen items-center justify-center bg-[#070b13] text-cyan-200"><Loader2 className="h-6 w-6 animate-spin" aria-label="Verifying your upline" /></div>;
  if (assigned) return <>{children}</>;
  return <main className="flex min-h-screen items-center justify-center bg-[#070b13] px-4 py-10 text-slate-100">
    <section className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0c1420] p-6 shadow-2xl">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-300/10 text-cyan-200"><Link2 className="h-6 w-6" /></div>
      <p className="text-xs font-bold uppercase tracking-[.18em] text-cyan-200">Member network verification</p>
      <h1 className="mt-2 text-2xl font-semibold">Who invited you?</h1>
      <p className="mt-3 text-sm leading-6 text-slate-400">Every member must join through an existing member's referral link. Your upline and original owner team are permanently attached to your account.</p>
      <form onSubmit={submit} className="mt-5 space-y-3">
        <label className="block text-sm font-medium" htmlFor="upline-code">Referral code</label>
        <input id="upline-code" value={code} onChange={event => setCode(event.target.value)} required minLength={36} maxLength={36} autoCapitalize="none" spellCheck={false} placeholder="Paste the referral code" className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm outline-none focus:border-cyan-300" />
        {error && <p role="alert" className="rounded-lg border border-amber-300/20 bg-amber-300/10 p-3 text-xs text-amber-200">{error === 'member_network_not_configured' ? 'The company member network is not yet configured. Please contact SuperTech AI support.' : error === 'valid_upline_required' || error === 'invalid_upline' ? 'This referral code is invalid. Ask your inviter for their current link.' : error}</p>}
        <button disabled={busy || code.trim().length !== 36} className="w-full rounded-xl bg-cyan-300 px-4 py-3 text-sm font-bold text-slate-950 disabled:opacity-50">{busy ? 'Verifying…' : 'Verify upline and continue'}</button>
      </form>
      <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-slate-500"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> Owner accounts are created only after direct company authorization. Ordinary members cannot create teams.</p>
    </section>
  </main>;
}
