import { useMemo, useState } from 'react';
import { Check, Copy, Link2, Share2, ShieldCheck, Users } from 'lucide-react';

type Props = { userId: string; email: string };

export function MemberReferralsPanel({ userId, email }: Props) {
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState('');

  const referralLink = useMemo(() => {
    const url = new URL('/', window.location.origin);
    url.searchParams.set('ref', userId);
    return url.toString();
  }, [userId]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setMessage('Invitation link copied. You can paste it into WhatsApp.');
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setMessage('Copy is unavailable in this browser. Select and copy the link below.');
    }
  };

  const shareLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join SuperTech AI',
          text: 'Join me on SuperTech AI — Be part of the AI revolution.',
          url: referralLink,
        });
        setMessage('Share sheet opened.');
      } catch (error) {
        if (error instanceof Error && error.name !== 'AbortError') {
          setMessage('Sharing was not completed. You can copy the link instead.');
        }
      }
    } else {
      await copyLink();
    }
  };

  return (
    <section className="mt-8 space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Members · invitations</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">My Members</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-2">Invite people to discover SuperTech AI and keep your personal invitation link close at hand.</p>
      </div>

      <div className="rounded-2xl border border-accent/25 bg-accent/[0.06] p-5 sm:p-6">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Link2 className="h-4 w-4 text-accent" /> Your personal referral link
        </div>
        <p className="mt-2 text-sm leading-6 text-ink-2">Share this link directly or send it through WhatsApp. It opens the SuperTech AI registration page with your referral code attached.</p>
        <div className="mt-4 rounded-xl border border-line/15 bg-canvas/70 p-3">
          <p className="break-all text-xs leading-5 text-ink-2" aria-label="Your referral link">{referralLink}</p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => void copyLink()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2.5 text-xs font-bold text-canvas">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? 'Copied' : 'Copy link'}
          </button>
          <button type="button" onClick={() => void shareLink()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line/20 px-3 py-2.5 text-xs font-semibold text-ink">
            <Share2 className="h-4 w-4" /> Share
          </button>
        </div>
        {message && <p role="status" className="mt-3 text-xs text-ink-2">{message}</p>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <article className="rounded-2xl border border-line/15 bg-surface/[0.035] p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink"><Users className="h-4 w-4 text-accent" /> Referral activity</div>
          <p className="mt-2 text-sm leading-6 text-ink-2">Your link is prepared for sharing. The independent Appwrite member database and referral attribution service are not yet provisioned, so registered referrals and commissions are not being recorded or credited yet.</p>
          <p className="mt-3 text-xs font-semibold text-amber-300">Referral tracking pending backend activation</p>
        </article>
        <article className="rounded-2xl border border-line/15 bg-surface/[0.035] p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink"><ShieldCheck className="h-4 w-4 text-accent" /> Account protection</div>
          <p className="mt-2 text-sm leading-6 text-ink-2">Signed in as {email}. Your referral code is tied to your authenticated account. Never share your password or verification link.</p>
        </article>
      </div>

      <div className="rounded-2xl border border-line/15 bg-surface/[0.035] p-5">
        <h3 className="text-base font-semibold text-ink">For the five company owners</h3>
        <p className="mt-2 text-sm leading-6 text-ink-2">Each owner can create an account using the normal Create account option on the sign-in screen. Owner access must then be granted by a trusted administrator after verifying the person's identity. Registration alone never grants owner or admin privileges.</p>
      </div>
    </section>
  );
}
