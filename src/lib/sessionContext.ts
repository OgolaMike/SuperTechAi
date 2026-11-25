import { createContext, useContext } from 'react';

export type IndependentSession = {
  access_token: string;
  user: { id: string; email: string; user_metadata: Record<string, unknown> };
};
export type SessionContextValue = { session: IndependentSession; isAdmin: boolean };
export const SessionContext = createContext<SessionContextValue | null>(null);
export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside the independent sign-in gate');
  return value;
}
