import { useState } from 'react';
import { Loader2, ShieldCheck, WifiOff, CheckCircle2, Clock3, LogOut } from 'lucide-react';
import { AuthScreen } from '@/components/AuthScreen';
import { useAuthSession } from '@/hooks/useAuthSession';
import { signOut } from '@/lib/auth';

const progress = [
  { title: 'Independent Appwrite sign-in', detail: 'Email verification and password recovery are retained.', state: 'ready' },
  { title: 'Member profiles and access', detail: 'Database tables have been started; fields, indexes and permissions still need completion.', state: 'working' },
  { title: 'Trading dashboard and strategies', detail: 'Independent market data and strategy services are not connected yet.', state: 'waiting' },
  { title: 'Signals, history and notifications', detail: 'These services are queued for migration to the new backend.', state: 'waiting' },
  { title: 'Referrals, finance and automation', detail: 'These remain disabled until their independent services and security rules are ready.', state: 'waiting' },
] as const;

export function AuthGate() {
  const { ready, session, accessError, isPasswordRecovery, isEmailConfirmed } = useAuthSession();
  const [signingOut, setSigningOut] = useState(false);

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

  const handleSignOut = async () => {
    setSigningOut(true);
    try { await signOut(); } finally { setSigningOut(false); }
  };

  return <div className="min-h-screen bg-canvas px-4 py-8 text-ink sm:py-12">
    <main className="mx-auto w-full max-w-3xl">
      <div className="rounded-2xl border border-line/10 bg-surface/[0.03] p-6 shadow-2xl sm:p-9">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">SuperTech AI · Independent preview</p>
            <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Your workspace is being prepared</h1>
            <p className="mt-2 text-sm leading-6 text-ink-2">You are signed in to the separate Appwrite platform. This page shows what is ready and what is still being built.</p>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-up/30 bg-up/10 text-up">
            <ShieldCheck className="h-6 w-6" />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-up/20 bg-up/5 p-4">
          <div>
            <p className="text-sm font-semibold">Account verified</p>
            <p className="mt-1 break-all text-xs text-ink-2">{session.user.email}</p>
          </div>
          <span className="rounded-full border border-up/30 px-3 py-1 text-xs font-semibold text-up">Signed in</span>
        </div>

        <section className="mt-8">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Build progress</h2>
            <span className="text-xs text-ink-3">Live migration checklist</span>
          </div>
          <div className="mt-4 space-y-3">
            {progress.map((item, index) => (
              <div key={item.title} className="flex gap-3 rounded-xl border border-line/10 bg-canvas/40 p-4">
                <div className={item.state === 'ready' ? 'mt-0.5 text-up' : item.state === 'working' ? 'mt-0.5 text-accent' : 'mt-0.5 text-ink-3'}>
                  {item.state === 'ready' ? <CheckCircle2 className="h-5 w-5" /> : <Clock3 className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{index + 1}. {item.title}</p>
                    <span className={item.state === 'ready' ? 'text-xs font-semibold text-up' : item.state === 'working' ? 'text-xs font-semibold text-accent' : 'text-xs text-ink-3'}>
                      {item.state === 'ready' ? 'Ready' : item.state === 'working' ? 'In progress' : 'Queued'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-ink-2">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-7 rounded-xl border border-line/15 bg-canvas/50 p-4">
          <p className="text-sm font-semibold">Your existing SuperTech AI is unaffected</p>
          <p className="mt-1 text-sm leading-6 text-ink-2">This preview uses its own Appwrite project. It does not read or write to Supabase. Paid access, live trading and financial actions are not enabled here yet.</p>
          <a href="https://deriv-sma-signal-das-04us.bolt.host/" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center justify-center rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-canvas">Open existing SuperTech AI</a>
        </div>

        <button onClick={handleSignOut} disabled={signingOut} className="mt-6 inline-flex items-center gap-2 rounded-xl border border-line/20 px-4 py-2.5 text-sm font-semibold text-ink-2 disabled:opacity-50">
          {signingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
          Sign out
        </button>
      </div>
    </main>
  </div>;
}
