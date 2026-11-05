import { useCallback, useEffect, useRef, useState } from 'react';
import type { SuperSignal } from '@/lib/intelligence';
import type { Toast } from './useSignalAlerts';
import { playAlertTone } from '@/lib/alertSound';
import { showSignalNotification } from '@/lib/deviceNotify';

export function useSuperSignalAlerts(signals: SuperSignal[], loaded: boolean, soundsEnabled: boolean) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const seededRef = useRef(false);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const currentKeys = new Set(signals.map((signal) => `${signal.symbol}|${signal.direction}|${signal.signalEpoch}`));
    if (!seededRef.current) {
      currentKeys.forEach((key) => seenRef.current.add(key));
      seededRef.current = true;
      return;
    }

    const created: Toast[] = [];
    for (const signal of signals) {
      const key = `${signal.symbol}|${signal.direction}|${signal.signalEpoch}`;
      if (seenRef.current.has(key)) continue;
      seenRef.current.add(key);
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
        digits: signal.digits,
        message,
        price: signal.levels.entry,
        levels: signal.levels,
        at: Math.floor(Date.now() / 1000),
      };
      created.push(toast);
      if (soundsEnabled) playAlertTone(signal.direction);
      void showSignalNotification(
        toast.tag,
        `SUPER SIGNAL CONFIRMED: ${signal.direction} — ${signal.name}`,
        `${message} Entry ${signal.levels.entry.toFixed(signal.digits)}. Stop-loss ${signal.levels.stopLoss.toFixed(signal.digits)}.`,
      ).catch(() => undefined);
    }
    if (created.length) setToasts((current) => [...created, ...current].slice(0, 4));
  }, [signals, loaded, soundsEnabled]);

  return { toasts, dismiss };
}
