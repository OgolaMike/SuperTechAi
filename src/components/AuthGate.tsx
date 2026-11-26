import { useEffect } from 'react';
import { Loader2, WifiOff } from 'lucide-react';
import { AuthScreen } from '@/components/AuthScreen';
import { IndependentTradingTerminal } from '@/components/IndependentTradingTerminal';
import { useAuthSession } from '@/hooks/useAuthSession';
import { signOut } from '@/lib/auth';

export function AuthGate() {
  const { ready, session, accessError, isPasswordRecovery, isEmailConfirmed } = useAuthSession();

  useEffect(() => {
    const handler = () => { void signOut(); };
    window.addEventListener('supertech-independent-signout', handler);
    return () => window.removeEventListener('supertech-independent-signout', handler);
  }, []);

  if (!ready) return <div className="flex min-h-screen items-center justify-center bg-[#070b13]"><Loader2 className="h-6 w-6 animate-spin text-cyan-300" aria-label="Loading SuperTech AI" /></div>;
  if (isPasswordRecovery) return <AuthScreen recoveryMode />;
  if (isEmailConfirmed) return <AuthScreen confirmationMode />;
  if (accessError) return <div className="flex min-h-screen items-center justify-center bg-[#070b13] px-4 text-slate-100"><div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0c1420] p-6 text-center shadow-2xl"><WifiOff className="mx-auto mb-3 h-8 w-8 text-amber-300" /><h1 className="text-xl font-semibold">We couldn't verify your account</h1><p className="mt-2 text-sm leading-6 text-slate-400">Check your connection and confirm that this website is registered as a Web platform in Appwrite. Your account has not been changed.</p><button onClick={() => window.location.reload()} className="mt-5 rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-bold text-slate-950">Retry</button></div></div>;
  if (!session) return <AuthScreen />;
  return <IndependentTradingTerminal email={session.user.email} userId={session.user.id} />;
}
