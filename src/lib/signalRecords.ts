import type { SignalStatus, SignalView } from './signals';
import { TIMEFRAMES } from './sma';
import { getIndependentSignalRecords, saveIndependentSignalRecords } from '@/lib/independentApi';

export type SignalRecordRow = {
  signal_key: string; symbol: string; asset_name: string; timeframe: string; granularity: number;
  digits: number; direction: 'BUY' | 'SELL'; signal_epoch: number; entry: number; stop_loss: number;
  tp1: number; tp2: number; tp3: number; band_mean: number; band_deviation: number;
  tp1_hit_epoch: number | null; tp2_hit_epoch: number | null; tp3_hit_epoch: number | null;
  sl_hit_epoch: number | null; status: SignalStatus; closed: boolean;
};
const STORAGE_KEY = 'supertech-independent-signal-records-v1';
const RECORD_LIMIT = 500;
export function toRecordRow(view: SignalView): SignalRecordRow {
  const { signal } = view;
  return { signal_key:view.key, symbol:view.symbol, asset_name:view.assetName, timeframe:view.timeframe,
    granularity:view.granularity, digits:view.digits, direction:signal.direction, signal_epoch:signal.signalEpoch,
    entry:signal.levels.entry, stop_loss:signal.levels.stopLoss, tp1:signal.levels.tp1, tp2:signal.levels.tp2,
    tp3:signal.levels.tp3, band_mean:signal.levels.mean, band_deviation:signal.levels.deviation,
    tp1_hit_epoch:signal.outcome.tp1Epoch, tp2_hit_epoch:signal.outcome.tp2Epoch,
    tp3_hit_epoch:signal.outcome.tp3Epoch, sl_hit_epoch:signal.outcome.slEpoch,
    status:signal.outcome.status, closed:signal.outcome.closed };
}
function readRows(): SignalRecordRow[] {
  try { const value=JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); return Array.isArray(value) ? value as SignalRecordRow[] : []; }
  catch { return []; }
}
export async function upsertSignalRecords(rows: SignalRecordRow[]): Promise<void> {
  const byKey=new Map(readRows().map(row=>[row.signal_key,row]));
  rows.forEach(row=>byKey.set(row.signal_key,row));
  const merged=[...byKey.values()].sort((a,b)=>b.signal_epoch-a.signal_epoch).slice(0,RECORD_LIMIT);
  localStorage.setItem(STORAGE_KEY,JSON.stringify(merged));
  await saveIndependentSignalRecords(rows);
}
export async function fetchSignalRecords(): Promise<SignalRecordRow[]> {
  const official=new Map(TIMEFRAMES.map(timeframe=>[timeframe.label,timeframe.granularity]));
  try {
    const remote=await getIndependentSignalRecords();
    const byKey=new Map(readRows().map(row=>[row.signal_key,row]));
    remote.forEach(row=>byKey.set(row.signal_key,row));
    const merged=[...byKey.values()].sort((a,b)=>b.signal_epoch-a.signal_epoch).slice(0,RECORD_LIMIT);
    localStorage.setItem(STORAGE_KEY,JSON.stringify(merged));
    return merged.filter(row=>official.get(row.timeframe)===row.granularity);
  } catch {
    return readRows().filter(row=>official.get(row.timeframe)===row.granularity).sort((a,b)=>b.signal_epoch-a.signal_epoch).slice(0,RECORD_LIMIT);
  }
}
