import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { AuthScreen } from '@/components/AuthScreen';
import { PendingApproval } from '@/components/PendingApproval';
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

  if (!isApproved) return <PendingApproval />;

  return <SessionContext.Provider value={{ session, isAdmin }}>{children}</SessionContext.Provider>;
}
