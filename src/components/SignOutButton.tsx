import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { signOut } from '@/lib/auth';

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignOut = async () => {
    setBusy(true);
    setError(null);
    try {
      await signOut();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign out');
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleSignOut}
        disabled={busy}
        aria-label="Sign out"
        title="Sign out"
        className="flex h-10 items-center justify-center gap-2 rounded-xl border border-line/10 bg-surface/[0.03] px-3 text-sm font-medium text-ink-2 transition-colors hover:text-ink disabled:opacity-60"
      >
        <LogOut className="h-4 w-4" />
        <span className="hidden sm:inline">Sign out</span>
      </button>
      {error && <span className="text-xs text-down">{error}</span>}
    </div>
  );
}
