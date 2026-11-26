import { useEffect, useRef, useState } from 'react';
import type { SignalView } from '@/lib/signals';
import { toRecordRow, upsertSignalRecords } from '@/lib/signalRecords';

export type SyncState = { error: string | null; version: number };

export function useSignalRecordSync(views: SignalView[], loaded: boolean): SyncState {
  const [state, setState] = useState<SyncState>({ error: null, version: 0 });
  const lastSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    if (!loaded) return;
    // Candle/chart refreshes often produce a new views array without changing
    // any persisted signal fields. Skip those redundant remote upserts.
    const rows = views.map(toRecordRow);
    const signature = JSON.stringify(rows);
    if (signature === lastSignatureRef.current) return;
    lastSignatureRef.current = signature;

    void upsertSignalRecords(rows)
      .then(() => {
        setState((previous) => ({ error: null, version: previous.version + 1 }));
      })
      .catch((cause: unknown) => {
        if (lastSignatureRef.current === signature) lastSignatureRef.current = null;
        setState((previous) => ({
          error: cause instanceof Error ? cause.message : 'Could not save signal history',
          version: previous.version + 1,
        }));
      });

  }, [views, loaded]);

  return state;
}
