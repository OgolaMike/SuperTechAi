import { useEffect, useRef, useState } from 'react';
import type { SignalView } from '@/lib/signals';
import { toRecordRow, upsertSignalRecords } from '@/lib/signalRecords';

export type SyncState = { error: string | null; version: number };

const DEBOUNCE_MS = 1200;
const MAX_RETRY_MS = 60000;

export function useSignalRecordSync(views: SignalView[], loaded: boolean): SyncState {
  const [state, setState] = useState<SyncState>({ error: null, version: 0 });
  const latestRows = useRef<ReturnType<typeof toRecordRow>[]>([]);
  const signature = useRef('');
  const retryDelay = useRef(2000);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const rows = views.map(toRecordRow);
    const nextSignature = JSON.stringify(rows);
    if (nextSignature === signature.current) return;
    signature.current = nextSignature;
    latestRows.current = rows;
    retryDelay.current = 2000;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void syncLatest(); }, DEBOUNCE_MS);
  }, [views, loaded]);

  async function syncLatest(): Promise<void> {
    if (running.current || !mounted.current) return;
    running.current = true;
    try {
      await upsertSignalRecords(latestRows.current);
      retryDelay.current = 2000;
      if (mounted.current) setState(previous => ({ error: null, version: previous.version + 1 }));
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : 'Could not save signal history';
      if (mounted.current) setState(previous => ({ error: message, version: previous.version + 1 }));
      const delay = retryDelay.current;
      retryDelay.current = Math.min(retryDelay.current * 2, MAX_RETRY_MS);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { void syncLatest(); }, delay);
    } finally {
      running.current = false;
    }
  }

  return state;
}
