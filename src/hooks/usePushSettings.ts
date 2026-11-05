import { useEffect, useState } from 'react';
import {
  DEFAULT_PUSH_PREFS,
  disablePush,
  enablePush,
  getActiveSubscription,
  isPushSupported,
  refreshPush,
  type BoolPrefKey,
  type PushPrefs,
} from '@/lib/pushClient';

const PREFS_STORAGE_KEY = 'supertech-push-prefs';

export type PushStatus = 'checking' | 'unsupported' | 'blocked' | 'off' | 'on' | 'working';

function loadPrefs(): PushPrefs {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_STORAGE_KEY) ?? 'null');
    if (saved && typeof saved === 'object') {
      return {
        signals: saved.signals !== false,
        targets: saved.targets !== false,
        stops: saved.stops !== false,
        limitOrders: saved.limitOrders !== false,
        symbols: Array.isArray(saved.symbols)
          ? saved.symbols.filter((item: unknown): item is string => typeof item === 'string')
          : null,
      };
    }
  } catch {
    /* fall back to defaults */
  }
  return DEFAULT_PUSH_PREFS;
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong');

export function usePushSettings() {
  const [status, setStatus] = useState<PushStatus>('checking');
  const [prefs, setPrefs] = useState<PushPrefs>(loadPrefs);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isPushSupported()) {
      setStatus('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setStatus('blocked');
      return;
    }
    let cancelled = false;
    getActiveSubscription()
      .then(async (subscription) => {
        if (cancelled) return;
        if (!subscription) {
          setStatus('off');
          return;
        }
        setStatus('on');
        await refreshPush(loadPrefs());
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorText(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = async () => {
    setStatus('working');
    setError(null);
    try {
      await enablePush(prefs);
      setStatus('on');
    } catch (err) {
      setError(errorText(err));
      setStatus(isPushSupported() && Notification.permission === 'denied' ? 'blocked' : 'off');
    }
  };

  const disable = async () => {
    setStatus('working');
    setError(null);
    try {
      await disablePush();
      setStatus('off');
    } catch (err) {
      setError(errorText(err));
      setStatus('on');
    }
  };

  const savePrefs = async (next: PushPrefs) => {
    setPrefs(next);
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(next));
    if (status !== 'on') return;
    setError(null);
    try {
      await refreshPush(next);
    } catch (err) {
      setError(errorText(err));
    }
  };

  const updatePref = (key: BoolPrefKey, value: boolean) => savePrefs({ ...prefs, [key]: value });

  const updateSymbols = (symbols: string[]) => savePrefs({ ...prefs, symbols });

  return { status, prefs, error, enable, disable, updatePref, updateSymbols };
}
