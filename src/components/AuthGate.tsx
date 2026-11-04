import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { AuthScreen } from '@/components/AuthScreen';
import { FinancePanel } from '@/components/FinancePanel';
import { useAuthSession } from '@/hooks/useAuthSession';
import { SessionContext } from '@/lib/sessionContext';

export function AuthGate({ children }: { children: ReactNode }) {
  const { ready, session, isAdmin, isApproved } = useAuthSession();

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <Loader2 className="h-6 w-6 animate-spin text-ink-2" aria-label="Loading" />
      </div>
    );
  }

  if (!session) return <AuthScreen />;

  if (!isApproved) {
    return (
      <SessionContext.Provider value={{ session, isAdmin }}>
        <div className="min-h-screen bg-canvas px-4 py-8 text-ink">
          <div className="mx-auto max-w-5xl">
            <FinancePanel initialTab="wallet" />
          </div>
        </div>
      </SessionContext.Provider>
    );
  }

  return <SessionContext.Provider value={{ session, isAdmin }}>{children}</SessionContext.Provider>;
}
