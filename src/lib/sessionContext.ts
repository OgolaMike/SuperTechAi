import { createContext, useContext } from 'react';
import type { Session } from '@supabase/supabase-js';

export type SessionContextValue = {
  session: Session;
  isAdmin: boolean;
};

export const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside the sign-in gate');
  return value;
}
