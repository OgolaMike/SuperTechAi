import { useEffect, useRef, useState } from 'react';
import type { Asset, TfState } from '@/lib/sma';
import { buildStopOrderIdeas, type StopOrderIdea } from '@/lib/stopOrders';

type ScanInput = {
  assets: Asset[];
  states: Record<string, Record<number, TfState>>;
  prices: Record<string, number>;
  aiModel: unknown;
  nowEpoch: number;
};

type ScheduledWork = { kind: 'idle' | 'timeout'; handle: number };

type IdleSchedulerWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

/**
 * Pending-order idea scans are notification work, not part of the first dashboard
 * paint. Schedule them after commit, coalesce rapid feed updates, and use a short
 * idle deadline so continuous market traffic cannot postpone alert evaluation.
 */
export function useDeferredStopOrderIdeas(
  assets: Asset[],
  states: Record<string, Record<number, TfState>>,
  prices: Record<string, number>,
  aiModel: unknown,
  nowEpoch: number,
): StopOrderIdea[] {
  const [ideas, setIdeas] = useState<StopOrderIdea[]>([]);
  const latestInput = useRef<ScanInput>({ assets, states, prices, aiModel, nowEpoch });
  const scheduledWork = useRef<ScheduledWork | null>(null);
  latestInput.current = { assets, states, prices, aiModel, nowEpoch };

  useEffect(() => {
    if (scheduledWork.current) return;

    const runScan = () => {
      scheduledWork.current = null;
      const latest = latestInput.current;
      setIdeas(buildStopOrderIdeas(latest.assets, latest.states, latest.prices, latest.aiModel, latest.nowEpoch));
    };

    const idleWindow = window as IdleSchedulerWindow;
    if (typeof idleWindow.requestIdleCallback === 'function') {
      const handle = idleWindow.requestIdleCallback(runScan, { timeout: 100 });
      scheduledWork.current = { kind: 'idle', handle };
    } else {
      const handle = window.setTimeout(runScan, 0);
      scheduledWork.current = { kind: 'timeout', handle };
    }
  }, [assets, states, prices, aiModel, nowEpoch]);

  useEffect(() => () => {
    const pending = scheduledWork.current;
    if (!pending) return;
    if (pending.kind === 'idle') {
      const idleWindow = window as IdleSchedulerWindow;
      idleWindow.cancelIdleCallback?.(pending.handle);
    } else {
      window.clearTimeout(pending.handle);
    }
    scheduledWork.current = null;
  }, []);

  return ideas;
}
