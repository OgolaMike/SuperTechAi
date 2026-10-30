import { supabase } from '@/lib/supabase';

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

// Resolves to true when the new account is signed in immediately.
export async function signUp(email: string, password: string): Promise<boolean> {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data.session !== null;
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export function friendlyAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/invalid login credentials/i.test(message)) return 'The email or password is incorrect.';
  if (/already registered/i.test(message)) return 'An account with this email already exists. Try signing in instead.';
  if (/failed to fetch|network/i.test(message)) return 'Could not reach the server. Check your connection and try again.';
  return message || 'Something went wrong. Please try again.';
}
