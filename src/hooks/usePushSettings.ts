import { useEffect, useState } from 'react';
import {
  DEFAULT_PUSH_PREFS, disablePush, enablePush, getActiveSubscription, isPushSupported, refreshPush,
  type BoolPrefKey, type PushPrefs,
} from '@/lib/pushClient';
import type { AlertModeSettings } from '@/lib/alertPreferences';

const PREFS_STORAGE_KEY = 'supertech-push-prefs';
export type PushStatus = 'checking' | 'unsupported' | 'blocked' | 'off' | 'on' | 'working';
function loadPrefs(): PushPrefs {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_STORAGE_KEY) ?? 'null');
    if (saved && typeof saved === 'object') return {
      signals: saved.signals === true, targets: saved.targets === true, stops: saved.stops === true,
      limitOrders: saved.limitOrders === true, pendingOrders: saved.pendingOrders === true,
      superSignals: saved.superSignals === true, income: saved.income === true, business: saved.business === true,
      symbols: Array.isArray(saved.symbols) ? saved.symbols : saved.symbols === null && Object.prototype.hasOwnProperty.call(saved, 'symbols') ? null : [],
    };
  } catch { /* use defaults */ }
  return DEFAULT_PUSH_PREFS;
}
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong';
export function usePushSettings() {
  const [status, setStatus] = useState<PushStatus>('checking');
  const [prefs, setPrefs] = useState<PushPrefs>(loadPrefs);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!isPushSupported()) { setStatus('unsupported'); return; }
    if (Notification.permission === 'denied') { setStatus('blocked'); return; }
    let cancelled = false;
    getActiveSubscription().then(async (subscription) => {
      if (cancelled) return;
      if (!subscription) { setStatus('off'); return; }
      setStatus('on'); await refreshPush(loadPrefs());
    }).catch((err: unknown) => { if (!cancelled) setError(errorText(err)); });
    return () => { cancelled = true; };
  }, []);
  const enable = async () => {
    setStatus('working'); setError(null);
    try { await enablePush(prefs); setStatus('on'); }
    catch (err) { setError(errorText(err)); setStatus(isPushSupported() && Notification.permission === 'denied' ? 'blocked' : 'off'); }
  };
  const disable = async () => {
    setStatus('working'); setError(null);
    try { await disablePush(); setStatus('off'); }
    catch (err) { setError(errorText(err)); setStatus('on'); }
  };
  const savePrefs = async (next: PushPrefs) => {
    setPrefs(next); localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event('supertech-push-prefs-changed'));
    if (status !== 'on') return;
    setError(null);
    try { await refreshPush(next); } catch (err) { setError(errorText(err)); }
  };
  const updatePref = (key: BoolPrefKey, value: boolean) => savePrefs({ ...prefs, [key]: value });
  const updateAllPrefs = (enabled: boolean) => savePrefs({
    ...prefs, signals: enabled, targets: enabled, stops: enabled, limitOrders: enabled,
    pendingOrders: enabled, superSignals: enabled, income: enabled, business: enabled,
  });
  const updateSymbols = (symbols: string[] | null) => savePrefs({ ...prefs, symbols });
  const saveAlertControls = (settings: AlertModeSettings) => {
    const fullAssets = Object.entries(settings.assets).filter(([, mode]) => mode === 'full').map(([symbol]) => symbol);
    return savePrefs({
      ...prefs,
      signals: settings.categories.signals === 'full',
      targets: settings.categories.targets === 'full',
      stops: settings.categories.stops === 'full',
      limitOrders: settings.categories.limitOrders === 'full',
      pendingOrders: settings.categories.pendingOrders === 'full',
      superSignals: settings.categories.superSignals === 'full',
      income: settings.categories.income === 'full',
      business: settings.categories.business === 'full',
      symbols: settings.defaultAssetMode === 'full' ? null : fullAssets,
    });
  };
  return { status, prefs, error, enable, disable, updatePref, updateAllPrefs, updateSymbols, saveAlertControls };
}
