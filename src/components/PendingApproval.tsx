import { Clock, RefreshCw } from 'lucide-react';
import { SignOutButton } from '@/components/SignOutButton';
import { HeaderBrand } from '@/components/StatusBar';

export function PendingApproval() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10 text-ink">
      <div className="w-full max-w-md rounded-2xl border border-line/10 bg-surface/[0.03] p-6 shadow-2xl sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <HeaderBrand />
          <SignOutButton />
        </div>

        <div className="mt-8 flex flex-col gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
            <Clock className="h-6 w-6" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Awaiting approval</p>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Your account is waiting for approval</h1>
          <p className="text-sm text-ink-2">
            An admin has to approve new accounts before they can use the dashboard. Once approved, sign in again and you will be taken straight in.
          </p>
        </div>

        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-canvas transition-transform duration-200 hover:scale-[1.01]"
        >
          <RefreshCw className="h-4 w-4" />
          Check again
        </button>
      </div>
    </div>
  );
}
