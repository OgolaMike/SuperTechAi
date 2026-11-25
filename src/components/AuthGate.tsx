import { Loader2, ShieldCheck, WifiOff } from 'lucide-react';
import { AuthScreen } from '@/components/AuthScreen';
import { useAuthSession } from '@/hooks/useAuthSession';

export function AuthGate() {
  const { ready, session, accessError, isPasswordRecovery, isEmailConfirmed } = useAuthSession();

  if (!ready) {
    return <div className="flex min-h-screen items-center justify-center bg-canvas">
      <Loader2 className="h-6 w-6 animate-spin text-ink-2" aria-label="Loading" />
    </div>;
  }

  if (isPasswordRecovery) return <AuthScreen recoveryMode />;
  if (isEmailConfirmed) return <AuthScreen confirmationMode />;

  if (accessError) {
    return <div className="flex min-h-screen items-center justify-center bg-canvas px-4 text-ink">
      <div className="w-full max-w-md rounded-2xl border border-line/10 bg-surface/[0.03] p-6 text-center shadow-2xl">
        <WifiOff className="mx-auto mb-3 h-8 w-8 text-ink-2" />
        <h1 className="text-xl font-semibold">We couldn't verify your account</h1>
        <p className="mt-2 text-sm text-ink-2">Check your connection and make sure the Appwrite project has this website registered as a Web platform. Your account has not been changed.</p>
        <button onClick={() => window.location.reload()} className="mt-5 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-canvas">Retry</button>
      </div>
    </div>;
  }

  if (!session) return <AuthScreen />;

  return <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10 text-ink">
    <div className="w-full max-w-xl rounded-2xl border border-line/10 bg-surface/[0.03] p-6 text-center shadow-2xl sm:p-9">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-up/30 bg-up/10 text-up">
        <ShieldCheck className="h-7 w-7" />
      </div>
      <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-accent">Independent platform · account verified</p>
      <h1 className="mt-2 text-2xl font-semibold">Your account is ready</h1>
      <p className="mt-3 text-sm leading-6 text-ink-2">Your Appwrite sign-in and email verification are working. We are now moving membership approvals, trading data, signals history, finance, referrals, notifications and automation services into this independent platform.</p>
      <div className="mt-5 rounded-xl border border-line/15 bg-canvas/50 p-4 text-left">
        <p className="text-sm font-semibold">Access is not activated yet</p>
        <p className="mt-1 text-sm leading-6 text-ink-2">We will not show incomplete trading or financial features, or silently use the old platform's database. Your existing SuperTech AI production service remains available separately while this migration is completed.</p>
      </div>
      <a href="https://deriv-sma-signal-das-04us.bolt.host/" target="_blank" rel="noreferrer" className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-canvas">Open existing SuperTech AI</a>
      <p className="mt-4 break-all text-xs text-ink-3">{session.user.email}</p>
    </div>
  </div>;
}
