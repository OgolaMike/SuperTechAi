import { useEffect, useRef, useState, useCallback } from 'react';
import type { Asset, TfState } from '@/lib/sma';
import type { Toast } from './useSignalAlerts';
import { buildBreakRetestSetups } from '@/lib/breakRetest';
import { playAlertTone } from '@/lib/alertSound';
import { showSignalNotification } from '@/lib/deviceNotify';

export function useBreakRetestAlerts(assets: Asset[], states: Record<string, Record<number, TfState>>, loaded: boolean, soundsEnabled: boolean) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seen = useRef<Set<string>>(new Set());
  const seeded = useRef(false);
  const dismiss = useCallback((id: string) => setToasts(current => current.filter(item => item.id !== id)), []);
  useEffect(() => {
    if (!loaded) return;
    const setups = buildBreakRetestSetups(assets, states);
    if (!seeded.current) { setups.forEach(item => seen.current.add(item.key)); seeded.current = true; return; }
    // M1 setups remain calculated and tracked, but do not create member-facing alerts.
    const fresh = setups.filter(item => item.granularity !== 60 && !seen.current.has(item.key));
    setups.forEach(item => seen.current.add(item.key));
    if (!fresh.length) return;
    const created: Toast[] = fresh.slice(0, 4).map(item => ({
      id: `break-retest:${item.key}`, tag: `break-retest:${item.key}`, kind: 'break-retest',
      tone: item.direction, direction: item.direction, symbol: item.symbol, assetName: item.assetName,
      timeframe: item.timeframe, granularity: item.granularity, chartTargetId: `break-retest:${item.key}`,
      digits: 5, message: item.direction === 'BUY' ? 'BUY below the confirmation candle.' : 'SELL above the confirmation candle.',
      price: item.entry,
      levels: { entry: item.entry, stopLoss: item.stopLoss, tp1: item.target, tp2: item.target, tp3: item.target, mean: (item.zoneLow + item.zoneHigh) / 2, deviation: Math.abs(item.zoneHigh - item.zoneLow) / 2 },
      at: item.confirmationEpoch,
    }));
    setToasts(current => [...created, ...current].slice(0, 4));
    for (const toast of created) {
      if (soundsEnabled) playAlertTone(toast.direction);
      void showSignalNotification(toast.tag, `BREAK & RETEST ${toast.direction}: ${toast.assetName} · ${toast.timeframe}`,
        `${toast.message} Market entry ${toast.price}. 5R target ${toast.levels.tp1}; stop loss ${toast.levels.stopLoss}, placed outside the retest zone.`).catch(() => undefined);
    }
  }, [assets, states, loaded, soundsEnabled]);
  return { toasts, dismiss };
}
