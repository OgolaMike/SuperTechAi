import { createContext, useContext } from 'react';

export type IndependentSession = {
  access_token: string;
  user: { id: string; email: string; user_metadata: { name?: string; full_name?: string; [key: string]: string | undefined } };
};
export type SessionContextValue = { session: IndependentSession; isAdmin: boolean };
export const SessionContext = createContext<SessionContextValue | null>(null);
export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside the independent sign-in gate');
  return value;
}
