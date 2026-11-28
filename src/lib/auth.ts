import { appwriteAccount } from '@/lib/appwrite';

function notifyAuthChanged(): void {
  window.dispatchEvent(new Event('appwrite-auth-changed'));
}

export async function signIn(email: string, password: string): Promise<void> {
  await appwriteAccount.signIn(email, password);
  notifyAuthChanged();
}

export async function signUp(email: string, password: string): Promise<boolean> {
  await appwriteAccount.create(email, password);
  notifyAuthChanged();
  return false;
}

export async function requestPasswordReset(email: string): Promise<void> {
  await appwriteAccount.requestPasswordRecovery(email);
}

export async function updatePassword(password: string): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const userId = params.get('userId');
  const secret = params.get('secret');
  if (params.get('auth') !== 'recovery' || !userId || !secret) {
    throw new Error('AUTH_RECOVERY_SESSION_MISSING');
  }
  await appwriteAccount.completePasswordRecovery(userId, secret, password);
  notifyAuthChanged();
}

export async function signOut(): Promise<void> {
  await appwriteAccount.signOut();
  notifyAuthChanged();
}

export function clearAuthRedirect(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('auth');
  url.searchParams.delete('userId');
  url.searchParams.delete('secret');
  url.hash = '';
  window.history.replaceState({}, document.title, url.pathname + url.search);
}

export function friendlyAuthError(error: unknown): string {
  const e = error as { message?: string; code?: string; verificationResent?: boolean };
  const message = error instanceof Error ? error.message : e?.message ?? '';
  if (message === 'AUTH_RECOVERY_SESSION_MISSING' || /auth session missing|session_not_found/i.test(message)) {
    return 'This password-reset link is incomplete or has expired. Return to sign in, choose Forgot password, and request a fresh link. Open the newest email on this same site.';
  }
  if (e?.code === 'email_not_confirmed' || /email not confirmed|verify your email/i.test(message)) {
    return e?.verificationResent
      ? 'A fresh verification email has just been sent to this address. Open it, select Verify email, then return here and sign in. Check your spam folder if it is not in your inbox.'
      : message || 'Your email is not verified yet. Check your inbox and spam folder for the latest SuperTech AI verification message, then return here and sign in.';
  }
  if (/user_already_exists|already registered/i.test(message)) return 'An account with this email already exists. Try signing in instead.';
  if (/rate.?limit|too many requests|email.*limit/i.test(message)) {
    return 'SuperTech AI is temporarily limiting email requests. Wait a little and try again.';
  }
  if (/invalid credentials|user_invalid_credentials|password.*incorrect/i.test(message)) {
    return 'The email or password is incorrect.';
  }
  if (/failed to fetch|network|fetch failed|load failed|timeout/i.test(message)) {
    return 'No connection to the Appwrite authentication service. Check your internet connection and try again.';
  }
  if (/otp_expired|expired|invalid.*token|user_invalid_token/i.test(message)) {
    return 'This link has expired or is no longer valid. Return to sign in and request a fresh link.';
  }
  return message || 'Something went wrong. Please try again.';
}
