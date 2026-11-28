import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Link2, Share2, ShieldCheck, Users, Loader2 } from 'lucide-react';
import { getMemberNetwork, getMemberReferralProfile, type MemberNetwork, type MemberReferralProfile } from '@/lib/independentApi';

type Props = { userId: string; email: string };

export function MemberReferralsPanel({ userId, email }: Props) {
  const [profile, setProfile] = useState<MemberReferralProfile | null>(null);
  const [network, setNetwork] = useState<MemberNetwork | null>(null);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void Promise.all([getMemberReferralProfile(), getMemberNetwork()])
      .then(([member, team]) => { if (active) { setProfile(member); setNetwork(team); } })
      .catch(error => { if (active) setMessage(error instanceof Error ? error.message : 'Member network is unavailable.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId]);

  const referralLink = useMemo(() => {
    if (!profile?.assigned || !profile.referralCode) return '';
    const url = new URL('/', window.location.origin);
    url.searchParams.set('ref', profile.referralCode);
    return url.toString();
  }, [profile]);

  const copyLink = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true); setMessage('Your verified referral link is copied and ready to share.');
      window.setTimeout(() => setCopied(false), 2500);
    } catch { setMessage('Copy is unavailable in this browser. Select and copy the link above.'); }
  };

  const shareLink = async () => {
    if (!referralLink) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Join SuperTech AI', text: 'Join me on SuperTech AI — Be part of the AI revolution.', url: referralLink });
        setMessage('Share sheet opened.');
      } catch (error) {
        if (error instanceof Error && error.name !== 'AbortError') setMessage('Sharing was not completed. Copy the link instead.');
      }
    } else await copyLink();
  };

  return <section className="mt-8 space-y-5">
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Members · invitations</p>
      <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">My Members</h2>
      <p className="mt-1 max-w-2xl text-sm text-ink-2">Your referral link keeps every new member connected to their inviter and original company team.</p>
    </div>
    {loading ? <div className="flex min-h-32 items-center justify-center rounded-2xl border border-line/15"><Loader2 className="h-5 w-5 animate-spin text-accent" /></div> : <>
      {profile?.assigned && referralLink ? <div className="rounded-2xl border border-accent/25 bg-accent/[0.06] p-5 sm:p-6">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink"><Link2 className="h-4 w-4 text-accent" /> Your verified referral link</div>
        <p className="mt-2 text-sm leading-6 text-ink-2">Share this link with a new member. Their upline and team are recorded by the Appwrite service when they activate their account.</p>
        <div className="mt-4 rounded-xl border border-line/15 bg-canvas/70 p-3"><p className="break-all text-xs leading-5 text-ink-2">{referralLink}</p></div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => void copyLink()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2.5 text-xs font-bold text-canvas">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? 'Copied' : 'Copy link'}</button>
          <button type="button" onClick={() => void shareLink()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line/20 px-3 py-2.5 text-xs font-semibold text-ink"><Share2 className="h-4 w-4" /> Share</button>
        </div>
        {message && <p role="status" className="mt-3 text-xs text-ink-2">{message}</p>}
      </div> : <div className="rounded-xl border border-amber-400/20 bg-amber-400/[.05] p-4 text-sm text-ink-2">Your member network has not been assigned yet. Contact the company to complete owner onboarding.</div>}
      <div className="grid gap-3 sm:grid-cols-2">
        <article className="rounded-2xl border border-line/15 bg-surface/[0.035] p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink"><Users className="h-4 w-4 text-accent" /> Team activity</div>
          <p className="mt-3 text-2xl font-semibold text-ink">{network?.teamCount ?? 0}</p><p className="text-xs text-ink-3">Members in your owner team</p>
          <p className="mt-3 text-sm text-ink-2">{network?.directCount ?? 0} direct referrals</p>
        </article>
        <article className="rounded-2xl border border-line/15 bg-surface/[0.035] p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink"><ShieldCheck className="h-4 w-4 text-accent" /> Account protection</div>
          <p className="mt-2 text-sm leading-6 text-ink-2">Signed in as {email}. Team membership and upline are controlled by the company network service and cannot be changed from this screen.</p>
        </article>
      </div>
      <div className="rounded-2xl border border-line/15 bg-surface/[0.035] p-5">
        <h3 className="text-base font-semibold text-ink">Company-owned teams</h3>
        <p className="mt-2 text-sm leading-6 text-ink-2">Only the company can authorize a new owner and create a new team. Every other member must join through an existing member's referral link. The company Genesis account oversees every team.</p>
      </div>
    </>}
    {message && !loading && <p role="status" className="text-xs text-ink-2">{message}</p>}
  </section>;
}
