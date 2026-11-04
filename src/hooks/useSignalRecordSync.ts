import { useEffect, useState } from 'react';
import type { SignalView } from '@/lib/signals';

export type SyncState = {
  error: string | null;
  version: number;
};

/**
 * Signal records are produced by the scheduled scanner Edge Function.
 * The browser must never write shared market history: doing so bypasses the
 * single-writer model and fails RLS for admins who are not paid members.
 * This hook only signals that live market data has loaded so read-only
 * history consumers can refresh from the scanner-owned table.
 */
export function useSignalRecordSync(_views: SignalView[], loaded: boolean): SyncState {
  const [state, setState] = useState<SyncState>({ error: null, version: 0 });

  useEffect(() => {
    if (!loaded) return;
    setState((previous) => ({
      error: null,
      version: previous.version + 1,
    }));
  }, [loaded]);

  return state;
}
