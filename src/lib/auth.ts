import { supabase } from '@/lib/supabase';

function authRedirect(flow: 'confirmed' | 'recovery'): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('auth', flow);
  return url.toString();
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUp(email: string, password: string, payoutTronAddress: string): Promise<boolean> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: authRedirect('confirmed'), data: { payout_tron_address: payoutTronAddress } },
  });
  if (error) throw error;
  return data.session !== null;
}

export async function resendSignupConfirmation(email: string): Promise<void> {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: authRedirect('confirmed') },
  });
  if (error) throw error;
}

export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: authRedirect('recovery'),
  });
  if (error) throw error;
}

export async function updatePassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export function clearAuthRedirect(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('auth');
  url.hash = '';
  window.history.replaceState({}, document.title, url.pathname + url.search);
}

export function friendlyAuthError(error: unknown): string {
  const e = error as { message?: string; code?: string };
  const message = error instanceof Error ? error.message : e?.message ?? '';
  if (e?.code === 'email_not_confirmed' || /email not confirmed/i.test(message)) {
    return 'Your email address is not confirmed yet. Resend the confirmation email below, then open its link to activate your SuperTech AI account.';
  }
  if (/invalid login credentials/i.test(message)) return 'The email or password is incorrect.';
  if (/already registered/i.test(message)) return 'An account with this email already exists. Try signing in instead.';
  if (/failed to fetch|network|fetch failed|load failed|timeout/i.test(message)) {
    return 'No connection to the authentication server. Check your internet connection and try again.';
  }
  if (/otp_expired|expired|invalid.*token/i.test(message)) {
    return 'This link has expired or is no longer valid. Return to sign in and request a fresh email link.';
  }
  return message || 'Something went wrong. Please try again.';
}
