import { useCallback, useEffect, useRef, useState } from 'react';
import { playAlertTone, type AlertTone } from '@/lib/alertSound';
import { showSignalNotification } from '@/lib/deviceNotify';
import { formatPrice } from '@/lib/sma';
import type { Direction, SignalLevels, SignalView } from '@/lib/signals';

export type ToastKind = 'signal' | 'hit';

export type Toast = {
  id: string;
  tag: string;
  kind: ToastKind;
  tone: AlertTone;
  direction: Direction;
  symbol: string;
  assetName: string;
  timeframe: string;
  digits: number;
  message: string;
  price: number;
  levels: SignalLevels;
  at: number;
};

const MAX_TOASTS = 4;
const FRESH_CANDLES = 2;

type HitLabel = 'TP1' | 'TP2' | 'TP3' | 'SL';

function outcomeFields(view: SignalView): Record<HitLabel, number | null> {
  const { outcome } = view.signal;
  return { TP1: outcome.tp1Epoch, TP2: outcome.tp2Epoch, TP3: outcome.tp3Epoch, SL: outcome.slEpoch };
}

function isFresh(epoch: number, granularity: number, nowEpoch: number): boolean {
  return nowEpoch - epoch <= FRESH_CANDLES * granularity;
}

function hitMessage(hit: HitLabel): string {
  if (hit === 'SL') return 'Stop-loss hit';
  if (hit === 'TP3') return 'Target 3 reached. Close the position';
  return `${hit === 'TP1' ? 'Target 1' : 'Target 2'} reached`;
}

function hitPrice(view: SignalView, hit: HitLabel): number {
  const { levels } = view.signal;
  if (hit === 'SL') return levels.stopLoss;
  if (hit === 'TP1') return levels.tp1;
  if (hit === 'TP2') return levels.tp2;
  return levels.tp3;
}

function hitTone(hit: HitLabel): AlertTone {
  return hit === 'SL' ? 'STOP' : 'TARGET';
}

function toastFor(view: SignalView, kind: ToastKind, hit: HitLabel | null, at: number): Toast {
  const { signal } = view;
  const base = {
    tag: `${view.key}|${kind === 'signal' ? 'signal' : hit}`,
    symbol: view.symbol,
    assetName: view.assetName,
    timeframe: view.timeframe,
    digits: view.digits,
    direction: signal.direction,
    levels: signal.levels,
    at,
  };
  if (kind === 'signal') {
    return {
      ...base,
      id: `${view.key}:signal:${at}`,
      kind,
      tone: signal.direction,
      message: 'New signal on candle close',
      price: signal.levels.entry,
    };
  }
  const label = hit as HitLabel;
  return {
    ...base,
    id: `${view.key}:${label}:${at}`,
    kind,
    tone: hitTone(label),
    message: hitMessage(label),
    price: hitPrice(view, label),
  };
}

export function useSignalAlerts(
  views: SignalView[],
  loaded: boolean,
  soundsEnabled: boolean,
) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seenRef = useRef<Map<string, string>>(new Map());
  const seededRef = useRef(false);

  const dismiss = useCallback((id: string) => {
    setToasts((previous) => previous.filter((toast) => toast.id !== id));
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const nowEpoch = Math.floor(Date.now() / 1000);
    const seen = seenRef.current;

    if (!seededRef.current) {
      seededRef.current = true;
      for (const view of views) seen.set(view.key, JSON.stringify(outcomeFields(view)));
      return;
    }

    const created: Toast[] = [];
    for (const view of views) {
      const fields = outcomeFields(view);
      const signature = JSON.stringify(fields);
      const previous = seen.get(view.key);
      if (previous === signature) continue;

      if (previous === undefined) {
        seen.set(view.key, signature);
        if (isFresh(view.signal.signalEpoch, view.granularity, nowEpoch)) {
          created.push(toastFor(view, 'signal', null, nowEpoch));
        }
        continue;
      }

      const before = JSON.parse(previous) as Record<HitLabel, number | null>;
      seen.set(view.key, signature);
      (Object.keys(fields) as HitLabel[]).forEach((hit) => {
        const epoch = fields[hit];
        if (epoch === null || before[hit] !== null) return;
        if (isFresh(epoch, view.granularity, nowEpoch)) {
          created.push(toastFor(view, 'hit', hit, nowEpoch));
        }
      });
    }

    if (created.length === 0) return;
    setToasts((previous) => [...created, ...previous].slice(0, MAX_TOASTS));
    if (!soundsEnabled) return;
    const signalToasts = created.filter((toast) => toast.kind === 'signal');
    for (const toast of signalToasts) {
      void showSignalNotification(
        toast.tag,
        `${toast.assetName} ${toast.timeframe} ${toast.direction}`,
        `Entry ${formatPrice(toast.levels.entry, toast.digits)}, stop-loss ${formatPrice(toast.levels.stopLoss, toast.digits)}`,
      ).catch(() => undefined);
    }
    const hitToast = created.find((toast) => toast.kind === 'hit');
    if (hitToast) playAlertTone(hitToast.tone);
  }, [views, loaded, soundsEnabled]);

  return { toasts, dismiss };
}
