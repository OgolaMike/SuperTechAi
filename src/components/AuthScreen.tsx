import { useState, type FormEvent } from 'react';
import { Loader2, LogIn, UserPlus } from 'lucide-react';
import { HeaderBrand } from '@/components/StatusBar';
import { friendlyAuthError, signIn, signUp } from '@/lib/auth';

type Mode = 'sign-in' | 'sign-up';

const MIN_PASSWORD_LENGTH = 6;

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const isSignUp = mode === 'sign-up';

  const switchMode = () => {
    setMode(isSignUp ? 'sign-in' : 'sign-up');
    setError(null);
    setNotice(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail || password.length < MIN_PASSWORD_LENGTH) {
      setError(`Enter your email and a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    setBusy(true);
    try {
      if (isSignUp) {
        const signedIn = await signUp(trimmedEmail, password);
        if (!signedIn) setNotice('Account created. An admin needs to approve it before you can use the dashboard.');
      } else {
        await signIn(trimmedEmail, password);
      }
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10 text-ink">
      <div className="w-full max-w-md rounded-2xl border border-line/10 bg-surface/[0.03] p-6 shadow-2xl sm:p-8">
        <HeaderBrand />

        <div className="mt-8 flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            {isSignUp ? 'Create account' : 'Members only'}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            {isSignUp ? 'Create your account' : 'Sign in to continue'}
          </h1>
          <p className="text-sm text-ink-2">
            {isSignUp ? 'Use an email address and a password you will remember.' : 'Enter the email and password for your account.'}
          </p>
        </div>

        <form onSubmit={submit} className="mt-6 flex flex-col gap-4" noValidate>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
              disabled={busy}
              className="rounded-xl border border-line/10 bg-surface/[0.03] px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-accent/50 focus:ring-2 focus:ring-accent/20 disabled:opacity-60"
              placeholder="you@example.com"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              required
              disabled={busy}
              className="rounded-xl border border-line/10 bg-surface/[0.03] px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-accent/50 focus:ring-2 focus:ring-accent/20 disabled:opacity-60"
              placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
            />
          </label>

          {error && <div className="rounded-xl border border-down/30 bg-down/10 px-4 py-3 text-sm text-down">{error}</div>}
          {notice && <div className="rounded-xl border border-up/30 bg-up/10 px-4 py-3 text-sm text-up">{notice}</div>}

          <button
            type="submit"
            disabled={busy}
            className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-canvas transition-transform duration-200 hover:scale-[1.01] disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : isSignUp ? <UserPlus className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
            {isSignUp ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-2">
          {isSignUp ? 'Already have an account?' : "Don't have an account yet?"}{' '}
          <button type="button" onClick={switchMode} disabled={busy} className="font-semibold text-accent hover:underline disabled:opacity-60">
            {isSignUp ? 'Sign in' : 'Create one'}
          </button>
        </p>
      </div>
    </div>
  );
}
