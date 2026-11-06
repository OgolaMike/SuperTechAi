import { useEffect, useRef } from 'react';
import { playAlertTone, type AlertTone } from '@/lib/alertSound';
import { showSignalNotification } from '@/lib/deviceNotify';
import { formatPrice } from '@/lib/sma';
import type { M15StopIdea } from '@/lib/stopOrders';

const STORAGE_KEY = 'supertech-pending-order-alert-events-v1';
const FRESH_SECONDS = 30 * 60;
const MAX_SEEN = 1500;

type SeenEvents = Record<string, number>;

function loadSeen(): SeenEvents {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value as SeenEvents : {};
  } catch {
    return {};
  }
}

/** Alerts only for the selected-asset proposals supplied by App. Event IDs persist across reloads. */
export function usePendingOrderAlerts(ideas: M15StopIdea[], loaded: boolean, soundsEnabled: boolean): void {
  const seenRef = useRef<SeenEvents>(loadSeen());

  useEffect(() => {
    if (!loaded) return;
    const now = Math.floor(Date.now() / 1000);
    const seen = seenRef.current;
    let changed = false;

    const notify = (key: string, epoch: number, tone: AlertTone, title: string, body: string) => {
      if (now - epoch > FRESH_SECONDS || epoch > now + 60 || seen[key]) return;
      seen[key] = now;
      changed = true;
      if (soundsEnabled) playAlertTone(tone);
      void showSignalNotification(key, title, body).catch(() => undefined);
    };

    for (const idea of ideas) {
      const entry = formatPrice(idea.entry, idea.digits);
      const stop = formatPrice(idea.stopLoss, idea.digits);
      const target = formatPrice(idea.takeProfit, idea.digits);
      const prefix = `PENDING ORDER: ${idea.assetName} ${idea.type}`;

      if (idea.status === 'TARGET HIT' && idea.takeProfitHitEpoch !== null) {
        notify(`${idea.id}:target:${idea.takeProfitHitEpoch}`, idea.takeProfitHitEpoch, 'TARGET',
          `TARGET REACHED — ${idea.assetName}`, `${idea.type} target ${target} reached. Wait for the next order.`);
      } else if (idea.status === 'STOP-LOSS HIT' && idea.stopLossHitEpoch !== null) {
        notify(`${idea.id}:stop:${idea.stopLossHitEpoch}`, idea.stopLossHitEpoch, 'STOP',
          `STOP-LOSS REACHED — ${idea.assetName}`, `${idea.type} stop-loss ${stop} reached. Wait for the next order.`);
      } else if (idea.entryHitEpoch !== null) {
        notify(`${idea.id}:entry:${idea.entryHitEpoch}`, idea.entryHitEpoch, idea.direction,
          `ENTRY REACHED — ${idea.assetName} ${idea.direction}`,
          `${idea.type} entry ${entry} reached. Stop-loss ${stop}; target ${target}.`);
      } else if (idea.status === 'WAITING') {
        notify(`${idea.id}:new`, idea.signalEpoch, idea.direction,
          prefix, `New setup. Entry ${entry}; stop-loss ${stop}; target ${target}. Open Pending Orders to review it.`);
      }
    }

    if (changed) {
      const entries = Object.entries(seen).sort((a, b) => b[1] - a[1]).slice(0, MAX_SEEN);
      seenRef.current = Object.fromEntries(entries);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(seenRef.current));
      } catch {
        // Alerts remain active in memory if storage is unavailable.
      }
    }
  }, [ideas, loaded, soundsEnabled]);
}
