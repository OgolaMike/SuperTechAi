import { useCallback, useEffect, useRef, useState } from 'react';
import { playAlertTone, type AlertTone } from '@/lib/alertSound';
import { showSignalNotification } from '@/lib/deviceNotify';
import { formatPrice } from '@/lib/sma';
import type { M15StopIdea } from '@/lib/stopOrders';
import type { Toast } from './useSignalAlerts';
import { getAlertMode } from '@/lib/alertPreferences';
import { useSession } from '@/lib/sessionContext';

const STORAGE_KEY = 'supertech-pending-order-alert-events-v1';
const FRESH_SECONDS = 30 * 60;
const MAX_SEEN = 1500;
type SeenEvents = Record<string, number>;

function loadSeen(): SeenEvents {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value as SeenEvents : {};
  } catch { return {}; }
}

/** Member preferences affect delivery only; setup calculation and order tracking continue unchanged. */
export function usePendingOrderAlerts(ideas: M15StopIdea[], loaded: boolean, soundsEnabled: boolean) {
  const { session } = useSession();
  const userId = session.user.id;
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seenRef = useRef<SeenEvents>(loadSeen());
  const dismiss = useCallback((id: string) => setToasts((items) => items.filter((item) => item.id !== id)), []);

  useEffect(() => {
    if (!loaded) return;
    const now = Math.floor(Date.now() / 1000);
    const seen = seenRef.current;
    let changed = false;
    const created: Toast[] = [];

    const notify = (
      key: string, epoch: number, tone: AlertTone, category: 'pendingOrders' | 'targets' | 'stops',
      title: string, body: string, idea: M15StopIdea, price: number, message: string,
    ) => {
      if (now - epoch > FRESH_SECONDS || epoch > now + 60 || seen[key]) return;
      seen[key] = now;
      changed = true;
      const mode = getAlertMode(category, idea.symbol, userId);
      if (mode === 'muted') return;
      const levels = {
        entry: idea.entry, stopLoss: idea.stopLoss, tp1: idea.takeProfit,
        tp2: idea.takeProfit, tp3: idea.takeProfit,
        mean: (idea.entry + idea.takeProfit) / 2,
        deviation: Math.abs(idea.takeProfit - idea.entry) / 2,
      };
      created.push({
        id: `pending:${key}`, tag: `pending:${key}`,
        kind: category === 'pendingOrders' ? 'signal' : 'hit',
        tone, direction: idea.direction, symbol: idea.symbol, assetName: idea.assetName,
        timeframe: 'M15', granularity: 900, digits: idea.digits,
        message, price, levels, at: now,
      });
      if (mode === 'full') {
        if (soundsEnabled) playAlertTone(tone);
        void showSignalNotification(key, title, body).catch(() => undefined);
      }
    };

    for (const idea of ideas) {
      const entry = formatPrice(idea.entry, idea.digits);
      const stop = formatPrice(idea.stopLoss, idea.digits);
      const target = formatPrice(idea.takeProfit, idea.digits);
      const prefix = `PENDING ORDER: ${idea.assetName} ${idea.type}`;

      if (idea.status === 'TARGET HIT' && idea.takeProfitHitEpoch !== null) {
        notify(`${idea.id}:target:${idea.takeProfitHitEpoch}`, idea.takeProfitHitEpoch, 'TARGET', 'targets',
          `TARGET REACHED — ${idea.assetName}`, `${idea.type} target ${target} reached. Wait for the next order.`,
          idea, idea.takeProfit, 'Take-profit reached');
      } else if (idea.status === 'STOP-LOSS HIT' && idea.stopLossHitEpoch !== null) {
        notify(`${idea.id}:stop:${idea.stopLossHitEpoch}`, idea.stopLossHitEpoch, 'STOP', 'stops',
          `STOP-LOSS REACHED — ${idea.assetName}`, `${idea.type} stop-loss ${stop} reached. Wait for the next order.`,
          idea, idea.stopLoss, 'Stop-loss reached');
      } else if (idea.entryHitEpoch !== null) {
        notify(`${idea.id}:entry:${idea.entryHitEpoch}`, idea.entryHitEpoch, idea.direction, 'pendingOrders',
          `ENTRY REACHED — ${idea.assetName} ${idea.direction}`,
          `${idea.type} entry ${entry} reached. Stop-loss ${stop}; target ${target}.`,
          idea, idea.entry, 'Pending order entry reached');
      } else if (idea.status === 'WAITING') {
        notify(`${idea.id}:new`, idea.signalEpoch, idea.direction, 'pendingOrders',
          prefix, `New setup. Entry ${entry}; stop-loss ${stop}; target ${target}. Open Pending Orders to review it.`,
          idea, idea.entry, 'New pending order setup');
      }
    }

    if (changed) {
      const entries = Object.entries(seen).sort((a, b) => b[1] - a[1]).slice(0, MAX_SEEN);
      seenRef.current = Object.fromEntries(entries);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(seenRef.current)); } catch { /* in-memory fallback */ }
    }
    if (created.length) setToasts((current) => [...created, ...current].slice(0, 4));
  }, [ideas, loaded, soundsEnabled, userId]);

  return { toasts, dismiss };
}
