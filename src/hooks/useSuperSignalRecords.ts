import { useCallback, useEffect, useRef, useState } from 'react';
import type { SuperSignal } from '@/lib/intelligence';
import { supabase } from '@/lib/supabase';

export type SuperSignalRecord = {
  signal_key: string;
  symbol: string;
  asset_name: string;
  digits: number;
  direction: 'BUY' | 'SELL';
  signal_epoch: number;
  entry: number;
  stop_loss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  band_mean: number;
  band_deviation: number;
  daily_bias: string;
  reads: SuperSignal['reads'];
  explanation: string;
  status: 'Open' | 'TP1' | 'TP2' | 'TP3' | 'Stopped' | 'Reversed';
  tp1_hit_epoch: number | null;
  tp2_hit_epoch: number | null;
  tp3_hit_epoch: number | null;
  sl_hit_epoch: number | null;
  closed: boolean;
  created_at: string;
};

const COLUMNS = 'signal_key,symbol,asset_name,digits,direction,signal_epoch,entry,stop_loss,tp1,tp2,tp3,band_mean,band_deviation,daily_bias,reads,explanation,status,tp1_hit_epoch,tp2_hit_epoch,tp3_hit_epoch,sl_hit_epoch,closed,created_at';

function toRow(signal: SuperSignal) {
  return {
    signal_key: `${signal.symbol}|900|${signal.signalEpoch}|${signal.direction}`,
    symbol: signal.symbol,
    asset_name: signal.name,
    digits: signal.digits,
    direction: signal.direction,
    signal_epoch: signal.signalEpoch,
    entry: signal.levels.entry,
    stop_loss: signal.levels.stopLoss,
    tp1: signal.levels.tp1,
    tp2: signal.levels.tp2,
    tp3: signal.levels.tp3,
    band_mean: signal.levels.mean,
    band_deviation: signal.levels.deviation,
    daily_bias: signal.dailyBias,
    reads: signal.reads,
    explanation: signal.explanation,
  };
}

export function useSuperSignalRecords(signals: SuperSignal[], loaded: boolean) {
  const [records, setRecords] = useState<SuperSignalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seen = useRef(new Set<string>());
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);

  useEffect(() => {
    const timer = window.setInterval(() => refresh(), 30000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .from('super_signal_records')
      .select(COLUMNS)
      .order('signal_epoch', { ascending: false })
      .limit(300)
      .then(({ data, error: queryError }) => {
        if (cancelled) return;
        if (queryError) throw queryError;
        setRecords((data ?? []) as unknown as SuperSignalRecord[]);
        setError(null);
        setLoading(false);
      })
      .then(undefined, (cause: Error) => {
        if (!cancelled) {
          setError(cause.message || 'Could not load Super Signal history');
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [refreshKey]);

  useEffect(() => {
    if (!loaded || signals.length === 0) return;
    const fresh = signals.filter((signal) => {
      const key = `${signal.symbol}|900|${signal.signalEpoch}|${signal.direction}`;
      if (seen.current.has(key)) return false;
      seen.current.add(key);
      return true;
    });
    if (fresh.length === 0) return;

    let cancelled = false;
    supabase
      .from('super_signal_records')
      .upsert(fresh.map(toRow), { onConflict: 'signal_key', ignoreDuplicates: true })
      .then(({ error: writeError }) => {
        if (cancelled) return;
        if (writeError) throw writeError;
        refresh();
      })
      .catch((cause: Error) => {
        if (!cancelled) setError(cause.message || 'Could not save Super Signal history');
        fresh.forEach((signal) => seen.current.delete(`${signal.symbol}|900|${signal.signalEpoch}|${signal.direction}`));
      });
    return () => { cancelled = true; };
  }, [signals, loaded, refresh]);

  return { records, loading, error, refresh };
}
