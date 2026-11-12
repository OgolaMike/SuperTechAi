import { useCallback, useEffect, useRef, useState } from 'react';
import { playAlertTone, type AlertTone } from '@/lib/alertSound';
import { showSignalNotification } from '@/lib/deviceNotify';
import { formatPrice } from '@/lib/sma';
import { getAlertMode } from '@/lib/alertPreferences';
import { useSession } from '@/lib/sessionContext';
import type { Direction, SignalLevels, SignalView } from '@/lib/signals';

export type ToastKind = 'signal' | 'reversal' | 'hit' | 'break-retest';

export type Toast = {
  id: string;
  tag: string;
  kind: ToastKind;
  tone: AlertTone;
  direction: Direction;
  previousDirection?: Direction;
  previousSignalEpoch?: number;
  symbol: string;
  assetName: string;
  timeframe: string;
  granularity: number;
  chartTargetId?: string;
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

function seriesKey(view: SignalView): string {
  return `${view.symbol}|${view.granularity}`;
}

function toastFor(
  view: SignalView,
  kind: ToastKind,
  hit: HitLabel | null,
  at: number,
  previous?: SignalView,
): Toast {
  const { signal } = view;
  const base = {
    tag: `${view.key}|${kind === 'hit' ? hit : kind}`,
    symbol: view.symbol,
    assetName: view.assetName,
    timeframe: view.timeframe,
    granularity: view.granularity,
    digits: view.digits,
    direction: signal.direction,
    levels: signal.levels,
    at,
  };
  if (kind === 'signal' || kind === 'reversal') {
    const reversalMessage = previous
      ? signal.direction === 'SELL'
        ? 'The market is turning down. If you entered the previous BUY signal, consider closing it.'
        : 'The market is turning up. If you entered the previous SELL signal, consider closing it.'
      : 'New signal on candle close';
    return {
      ...base,
      id: `${view.key}:${kind}:${at}`,
      kind,
      tone: signal.direction,
      message: reversalMessage,
      previousDirection: previous?.signal.direction,
      previousSignalEpoch: previous?.signal.signalEpoch,
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
  const { session } = useSession();
  const userId = session.user.id;
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seenRef = useRef<Map<string, string>>(new Map());
  const latestSignalRef = useRef<Map<string, SignalView>>(new Map());
  const seededRef = useRef(false);

  const dismiss = useCallback((id: string) => {
    setToasts((previous) => previous.filter((toast) => toast.id !== id));
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const nowEpoch = Math.floor(Date.now() / 1000);
    const seen = seenRef.current;
    const latest = latestSignalRef.current;

    // Establish the existing history as a baseline. Never announce old signals
    // as fresh reversals when the app first loads or the page is refreshed.
    if (!seededRef.current) {
      seededRef.current = true;
      for (const view of views) {
        seen.set(view.key, JSON.stringify(outcomeFields(view)));
        const key = seriesKey(view);
        const current = latest.get(key);
        if (!current || view.signal.signalEpoch > current.signal.signalEpoch) {
          latest.set(key, view);
        }
      }
      return;
    }

    const created: Toast[] = [];
    // Process chronologically so multiple newly-discovered signals in one
    // update are compared against the immediately preceding signal.
    const chronological = [...views].sort((a, b) => a.signal.signalEpoch - b.signal.signalEpoch);
    for (const view of chronological) {
      const fields = outcomeFields(view);
      const signature = JSON.stringify(fields);
      const previousSignature = seen.get(view.key);

      // Keep M1 calculations and history current, but mute all M1 member-facing
      // signal/reversal/target/stop alerts, sounds, and push notifications.
      if (view.granularity === 60) {
        seen.set(view.key, signature);
        const key = seriesKey(view);
        const current = latest.get(key);
        if (!current || view.signal.signalEpoch > current.signal.signalEpoch) {
          latest.set(key, view);
        }
        continue;
      }

      if (previousSignature === signature) continue;

      if (previousSignature === undefined) {
        seen.set(view.key, signature);
        const key = seriesKey(view);
        const previousSignal = latest.get(key);
        const isNewer = !previousSignal || view.signal.signalEpoch > previousSignal.signal.signalEpoch;

        if (isNewer) {
          const isReversal = Boolean(previousSignal && previousSignal.signal.direction !== view.signal.direction);
          if (isFresh(view.signal.signalEpoch, view.granularity, nowEpoch)) {
            created.push(toastFor(view, isReversal ? 'reversal' : 'signal', null, nowEpoch, isReversal ? previousSignal : undefined));
          }
          latest.set(key, view);
        }
        continue;
      }

      const before = JSON.parse(previousSignature) as Record<HitLabel, number | null>;
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
    const visible = created.filter((toast) => {
      const category = toast.kind === 'hit' ? (toast.tone === 'STOP' ? 'stops' : 'targets') : 'signals';
      return getAlertMode(category, toast.symbol, userId) !== 'muted';
    });
    if (visible.length) setToasts((previous) => [...visible, ...previous].slice(0, MAX_TOASTS));

    const signalToasts = visible.filter((toast) => getAlertMode('signals', toast.symbol, userId) === 'full' && (toast.kind === 'signal' || toast.kind === 'reversal'));
    for (const toast of signalToasts) {
      if (soundsEnabled) playAlertTone(toast.tone);
      void showSignalNotification(
        toast.tag,
        `${toast.direction} SIGNAL: ${toast.assetName} ${toast.timeframe}`,
        `${toast.message} Entry ${formatPrice(toast.levels.entry, toast.digits)}, stop-loss ${formatPrice(toast.levels.stopLoss, toast.digits)}`,
      ).catch(() => undefined);
    }
    const fullHit = visible.find((toast) => toast.kind === 'hit' && getAlertMode(toast.tone === 'STOP' ? 'stops' : 'targets', toast.symbol, userId) === 'full');
    if (soundsEnabled && fullHit) playAlertTone(fullHit.tone);
  }, [views, loaded, soundsEnabled, userId]);

  return { toasts, dismiss };
}
