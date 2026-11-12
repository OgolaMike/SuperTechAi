import type { ReactNode } from 'react';
import { Loader2, WifiOff } from 'lucide-react';
import { AuthScreen } from '@/components/AuthScreen';
import { FinancePanel } from '@/components/FinancePanel';
import { useAuthSession } from '@/hooks/useAuthSession';
import { SessionContext } from '@/lib/sessionContext';

export function AuthGate({ children }: { children: ReactNode }) {
  const { ready, session, isAdmin, isApproved, accessError, isPasswordRecovery, isEmailConfirmed } = useAuthSession();

  if (!ready) return <div className="flex min-h-screen items-center justify-center bg-canvas"><Loader2 className="h-6 w-6 animate-spin text-ink-2" aria-label="Loading" /></div>;
  if (isPasswordRecovery) return <AuthScreen recoveryMode />;
  if (isEmailConfirmed) return <AuthScreen confirmationMode />;
  if (accessError) return <div className="flex min-h-screen items-center justify-center bg-canvas px-4 text-ink"><div className="w-full max-w-md rounded-2xl border border-line/10 bg-surface/[0.03] p-6 text-center shadow-2xl"><WifiOff className="mx-auto mb-3 h-8 w-8 text-ink-2" /><h1 className="text-xl font-semibold">Connection unavailable</h1><p className="mt-2 text-sm text-ink-2">We couldn't verify your session or membership access. Your account has not been changed. Check your connection and retry.</p><button onClick={() => window.location.reload()} className="mt-5 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-canvas">Retry connection</button></div></div>;
  if (!session) return <AuthScreen />;
  if (!isApproved && !isAdmin) return <SessionContext.Provider value={{ session, isAdmin }}><div className="min-h-screen bg-canvas px-4 py-8 text-ink"><div className="mx-auto max-w-5xl"><FinancePanel initialTab="wallet" /></div></div></SessionContext.Provider>;
  return <SessionContext.Provider value={{ session, isAdmin }}>{children}</SessionContext.Provider>;
}
