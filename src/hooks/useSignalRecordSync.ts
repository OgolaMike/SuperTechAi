import { useEffect, useRef, useState } from 'react';
import { toRecordRow, upsertSignalRecords, type SignalRecordRow } from '@/lib/signalRecords';
import type { SignalView } from '@/lib/signals';

export type SyncState = {
  error: string | null;
  version: number;
};

export function useSignalRecordSync(views: SignalView[], loaded: boolean): SyncState {
  const [state, setState] = useState<SyncState>({ error: null, version: 0 });
  const [rerun, setRerun] = useState(0);
  const savedRef = useRef<Map<string, string>>(new Map());
  const pendingRef = useRef(false);
  const queuedRef = useRef(false);

  useEffect(() => {
    if (!loaded) return;
    if (pendingRef.current) {
      queuedRef.current = true;
      return;
    }

    const changed: SignalRecordRow[] = [];
    const signatures = new Map<string, string>();
    for (const view of views) {
      const row = toRecordRow(view);
      const signature = JSON.stringify(row);
      signatures.set(row.signal_key, signature);
      if (savedRef.current.get(row.signal_key) !== signature) changed.push(row);
    }
    if (changed.length === 0) return;

    pendingRef.current = true;
    upsertSignalRecords(changed)
      .then(() => {
        for (const row of changed) savedRef.current.set(row.signal_key, signatures.get(row.signal_key)!);
        setState((previous) => ({ error: null, version: previous.version + 1 }));
      })
      .catch((error: Error) => {
        setState((previous) => ({ error: error.message, version: previous.version }));
      })
      .finally(() => {
        pendingRef.current = false;
        if (queuedRef.current) {
          queuedRef.current = false;
          setRerun((value) => value + 1);
        }
      });
  }, [views, loaded, rerun]);

  return state;
}
