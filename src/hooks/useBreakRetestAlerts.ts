import { useCallback, useEffect, useRef, useState } from 'react';
import type { Asset, TfState } from '@/lib/sma';
import type { Toast } from './useSignalAlerts';
import { buildBreakRetestSetups } from '@/lib/breakRetest';
import { playAlertTone } from '@/lib/alertSound';
import { showSignalNotification } from '@/lib/deviceNotify';
import { formatPrice } from '@/lib/sma';
import { getAlertMode } from '@/lib/alertPreferences';
import { useSession } from '@/lib/sessionContext';

type Prices = Record<string, number>;
type ReachedLevel = 'ENTRY' | 'TARGET' | 'STOP';

export function useBreakRetestAlerts(
  assets: Asset[],
  states: Record<string, Record<number, TfState>>,
  prices: Prices,
  loaded: boolean,
  soundsEnabled: boolean,
) {
  const { session } = useSession();
  const userId = session.user.id;
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seenSetups = useRef<Set<string>>(new Set());
  const firedLevels = useRef<Set<string>>(new Set());
  const previousPrices = useRef<Map<string, number>>(new Map());
  const seeded = useRef(false);
  const dismiss = useCallback((id: string) => setToasts(current => current.filter(item => item.id !== id)), []);

  useEffect(() => {
    if (!loaded) return;
    const setups = buildBreakRetestSetups(assets, states);
    const currentPrices = new Map(Object.entries(prices).filter(([, price]) => Number.isFinite(price)));
    if (!seeded.current) {
      for (const item of setups) {
        const initialPrice = currentPrices.get(item.symbol);
        if (initialPrice === undefined) continue;
        const entryAlreadyPassed = item.direction === 'BUY'
          ? initialPrice <= item.entry
          : initialPrice >= item.entry;
        if (entryAlreadyPassed) firedLevels.current.add(`${item.key}:ENTRY`);
      }
      previousPrices.current = currentPrices;
      seeded.current = true;
      return;
    }

    const created: Toast[] = [];
    for (const item of setups) {
      // M1 remains calculated in the background, but all member-facing M1 alerts stay muted.
      if (item.granularity === 60) continue;
      const current = currentPrices.get(item.symbol);
      const previous = previousPrices.current.get(item.symbol);
      if (current === undefined || previous === undefined || current === previous) continue;

      const crossed = (level: number, upward: boolean) => upward
        ? previous < level && current >= level
        : previous > level && current <= level;
      const entryKey = `${item.key}:ENTRY`;
      const entryWasReached = firedLevels.current.has(entryKey)
        || (item.direction === 'BUY' ? current <= item.entry : current >= item.entry);
      const entryCrossed = !entryWasReached && (item.direction === 'BUY'
        ? crossed(item.entry, false)
        : crossed(item.entry, true));
      const targetCrossed = entryWasReached && (item.direction === 'BUY'
        ? crossed(item.target, true)
        : crossed(item.target, false));
      const stopCrossed = entryWasReached && (item.direction === 'BUY'
        ? crossed(item.stopLoss, false)
        : crossed(item.stopLoss, true));

      // Only monitor target/stop after entry. A terminal level takes priority
      // if one unusually large tick jumps across entry and the outcome level.
      const reached: ReachedLevel | null = stopCrossed ? 'STOP' : targetCrossed ? 'TARGET' : entryCrossed ? 'ENTRY' : null;
      if (!reached) continue;
      const levelKey = `${item.key}:${reached}`;
      if (firedLevels.current.has(levelKey)) continue;
      firedLevels.current.add(levelKey);

      const price = reached === 'ENTRY' ? item.entry : reached === 'TARGET' ? item.target : item.stopLoss;
      const message = reached === 'ENTRY'
        ? `${item.direction} entry level reached`
        : reached === 'TARGET'
          ? '5R target reached'
          : 'Stop loss reached';
      const tone = reached === 'STOP' ? 'STOP' : reached === 'TARGET' ? 'TARGET' : item.direction;
      const toast: Toast = {
        id: `break-retest-level:${levelKey}`,
        tag: `break-retest-level:${levelKey}`,
        kind: reached === 'ENTRY' ? 'break-retest' : 'hit',
        tone,
        direction: item.direction,
        symbol: item.symbol,
        assetName: item.assetName,
        timeframe: item.timeframe,
        granularity: item.granularity,
        chartTargetId: `break-retest:${item.key}`,
        digits: 5,
        message,
        price,
        levels: {
          entry: item.entry,
          stopLoss: item.stopLoss,
          tp1: item.target,
          tp2: item.target,
          tp3: item.target,
          mean: (item.zoneLow + item.zoneHigh) / 2,
          deviation: Math.abs(item.zoneHigh - item.zoneLow) / 2,
        },
        at: Math.floor(Date.now() / 1000),
      };
      created.push(toast);
    }

    setups.forEach(item => seenSetups.current.add(item.key));
    previousPrices.current = currentPrices;
    if (!created.length) return;
    const visible = created.filter((toast) => getAlertMode('limitOrders', toast.symbol, userId) !== 'muted');
    if (visible.length) setToasts(current => [...visible, ...current].slice(0, 4));
    for (const toast of visible) {
      if (getAlertMode('limitOrders', toast.symbol, userId) !== 'full') continue;
      if (soundsEnabled) playAlertTone(toast.tone);
      void showSignalNotification(
        toast.tag,
        `BREAK & RETEST ${toast.direction}: ${toast.assetName} · ${toast.timeframe}`,
        `${toast.message} ${formatPrice(toast.price, toast.digits)}. Entry ${formatPrice(toast.levels.entry, toast.digits)}, 5R target ${formatPrice(toast.levels.tp1, toast.digits)}, stop loss ${formatPrice(toast.levels.stopLoss, toast.digits)}.`,
      ).catch(() => undefined);
    }
  }, [assets, states, prices, loaded, soundsEnabled, userId]);

  return { toasts, dismiss };
}
