import { supabase } from '@/lib/supabase';

function authRedirect(flow: 'recovery'): string {
  const url = new URL('/', 'https://deriv-sma-signal-das-04us.bolt.host');
  url.searchParams.set('auth', flow);
  return url.toString();
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
}

export async function signUp(email: string, password: string, payoutTronAddress: string): Promise<boolean> {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { payout_tron_address: payoutTronAddress } },
  });
  if (error) throw error;
  return data.session !== null;
}

export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: authRedirect('recovery'),
  });
  if (error) throw error;
}

export async function updatePassword(password: string): Promise<void> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData.session) throw new Error('AUTH_RECOVERY_SESSION_MISSING');
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
  if (message === 'AUTH_RECOVERY_SESSION_MISSING' || /auth session missing|session_not_found/i.test(message)) {
    return 'This password-reset link did not open a valid SuperTechAi recovery session. Return to sign in, choose Forgot password, and request a fresh link. Open the newest email on the same device and browser where you will set the new password.';
  }
  if (e?.code === 'email_not_confirmed' || /email not confirmed/i.test(message)) {
    return 'This account still needs administrator activation. Contact a SuperTech AI admin for help.';
  }
  if (/over_email_send_rate_limit|rate.?limit|too many requests|email.*limit/i.test(message)) {
    return 'SuperTech AI is temporarily limiting email requests. Wait a little and try again.';
  }
  if (/invalid login credentials/i.test(message)) return 'The email or password is incorrect.';
  if (/already registered/i.test(message)) return 'An account with this email already exists. Try signing in instead.';
  if (/failed to fetch|network|fetch failed|load failed|timeout/i.test(message)) {
    return 'No connection to the authentication server. Check your internet connection and try again.';
  }
  if (/otp_expired|expired|invalid.*token/i.test(message)) {
    return 'This link has expired or is no longer valid. Return to sign in and request a fresh password-reset link.';
  }
  return message || 'Something went wrong. Please try again.';
}
