import { useCallback, useEffect, useRef, useState } from 'react';
import type { SuperSignal } from '@/lib/intelligence';
import type { Toast } from './useSignalAlerts';
import { playAlertTone } from '@/lib/alertSound';
import { showSignalNotification } from '@/lib/deviceNotify';
import { getAlertMode } from '@/lib/alertPreferences';
import { useSession } from '@/lib/sessionContext';

const SUPER_SIGNAL_GRANULARITY = 900;
const FRESH_CANDLES = 2;

function isFreshSignal(signalEpoch: number, nowEpoch: number): boolean {
  const age = nowEpoch - signalEpoch;
  return age >= 0 && age <= SUPER_SIGNAL_GRANULARITY * FRESH_CANDLES;
}

export function useSuperSignalAlerts(signals: SuperSignal[], loaded: boolean, soundsEnabled: boolean) {
  const { session } = useSession();
  const userId = session.user.id;
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const seededRef = useRef(false);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  // Remove bubbles that expired while the device/browser was suspended.
  useEffect(() => {
    const discardExpired = () => {
      const now = Math.floor(Date.now() / 1000);
      setToasts((current) => current.filter((toast) =>
        toast.signalEpoch !== undefined && isFreshSignal(toast.signalEpoch, now),
      ));
    };
    document.addEventListener('visibilitychange', discardExpired);
    window.addEventListener('focus', discardExpired);
    return () => {
      document.removeEventListener('visibilitychange', discardExpired);
      window.removeEventListener('focus', discardExpired);
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const nowEpoch = Math.floor(Date.now() / 1000);
    const currentKeys = new Set(signals.map((signal) => `${signal.symbol}|${signal.direction}|${signal.signalEpoch}`));
    if (getAlertMode('superSignals', undefined, userId) === 'muted') {
      currentKeys.forEach((key) => seenRef.current.add(key));
      seededRef.current = true;
      return;
    }
    if (!seededRef.current) {
      currentKeys.forEach((key) => seenRef.current.add(key));
      seededRef.current = true;
      return;
    }

    const created: Toast[] = [];
    for (const signal of signals) {
      const key = `${signal.symbol}|${signal.direction}|${signal.signalEpoch}`;
      if (seenRef.current.has(key)) continue;
      // Record even expired signals as seen so they can never replay after resume.
      seenRef.current.add(key);
      if (!isFreshSignal(signal.signalEpoch, nowEpoch)) continue;
      const alertMode = getAlertMode('superSignals', signal.symbol, userId);
      if (alertMode === 'muted') continue;
      const message = `All eight timeframes agree. A new ${signal.direction} opportunity has been confirmed.`;
      const toast: Toast = {
        id: `super:${key}`,
        tag: `super:${key}`,
        kind: 'signal',
        tone: signal.direction,
        direction: signal.direction,
        symbol: signal.symbol,
        assetName: signal.name,
        timeframe: 'SUPER SIGNAL',
        granularity: SUPER_SIGNAL_GRANULARITY,
        signalEpoch: signal.signalEpoch,
        chartTargetId: `super-signal-chart-${encodeURIComponent(signal.symbol)}-${signal.signalEpoch}-${signal.direction}`,
        digits: signal.digits,
        message,
        price: signal.levels.entry,
        levels: signal.levels,
        at: nowEpoch,
      };
      created.push(toast);
      if (alertMode === 'full') {
        if (soundsEnabled) playAlertTone(signal.direction);
        void showSignalNotification(
          toast.tag,
          `SUPER SIGNAL CONFIRMED: ${signal.direction} — ${signal.name}`,
          `${message} Entry ${signal.levels.entry.toFixed(signal.digits)}. Stop-loss ${signal.levels.stopLoss.toFixed(signal.digits)}.`,
        ).catch(() => undefined);
      }
    }
    if (created.length) setToasts((current) => [...created, ...current].slice(0, 4));
  }, [signals, loaded, soundsEnabled, userId]);

  return { toasts, dismiss };
}
