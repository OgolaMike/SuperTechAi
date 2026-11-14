import { supabase } from './supabase';
import type { SignalStatus, SignalView } from './signals';

export type SignalRecordRow = {
  signal_key: string;
  symbol: string;
  asset_name: string;
  timeframe: string;
  granularity: number;
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
  tp1_hit_epoch: number | null;
  tp2_hit_epoch: number | null;
  tp3_hit_epoch: number | null;
  sl_hit_epoch: number | null;
  status: SignalStatus;
  closed: boolean;
};

const UPSERT_CHUNK = 200;
const RECORD_LIMIT = 500;
const RECORD_COLUMNS =
  'signal_key, symbol, asset_name, timeframe, granularity, digits, direction, signal_epoch, entry, stop_loss, tp1, tp2, tp3, band_mean, band_deviation, tp1_hit_epoch, tp2_hit_epoch, tp3_hit_epoch, sl_hit_epoch, status, closed';

export function toRecordRow(view: SignalView): SignalRecordRow {
  const { signal } = view;
  const { levels, outcome } = signal;
  return {
    signal_key: view.key,
    symbol: view.symbol,
    asset_name: view.assetName,
    timeframe: view.timeframe,
    granularity: view.granularity,
    digits: view.digits,
    direction: signal.direction,
    signal_epoch: signal.signalEpoch,
    entry: levels.entry,
    stop_loss: levels.stopLoss,
    tp1: levels.tp1,
    tp2: levels.tp2,
    tp3: levels.tp3,
    band_mean: levels.mean,
    band_deviation: levels.deviation,
    tp1_hit_epoch: outcome.tp1Epoch,
    tp2_hit_epoch: outcome.tp2Epoch,
    tp3_hit_epoch: outcome.tp3Epoch,
    sl_hit_epoch: outcome.slEpoch,
    status: outcome.status,
    closed: outcome.closed,
  };
}

export async function upsertSignalRecords(rows: SignalRecordRow[]): Promise<void> {
  for (let start = 0; start < rows.length; start += UPSERT_CHUNK) {
    const chunk = rows.slice(start, start + UPSERT_CHUNK);
    const updatedAt = new Date().toISOString();
    const { error } = await supabase
      .from('signal_records')
      .upsert(
        chunk.map((row) => ({ ...row, updated_at: updatedAt })),
        { onConflict: 'signal_key' },
      );
    if (error) throw new Error(error.message);
  }
}

const RECORD_CACHE_TTL_MS = 15_000;
let cachedRecords: SignalRecordRow[] | null = null;
let cachedRecordsAt = 0;
let recordsRequest: Promise<SignalRecordRow[]> | null = null;

/**
 * Share the same short-lived result/request between the dashboard's AI model
 * and the Records section. This avoids duplicate history reads on first visit
 * and makes quick section revisits feel immediate. Manual refresh bypasses it.
 */
export async function fetchSignalRecords(options: { force?: boolean } = {}): Promise<SignalRecordRow[]> {
  const force = options.force === true;
  if (!force && cachedRecords && Date.now() - cachedRecordsAt < RECORD_CACHE_TTL_MS) {
    return cachedRecords;
  }
  if (!force && recordsRequest) return recordsRequest;

  const request = (async () => {
    const { data, error } = await supabase
      .from('signal_records')
      .select(RECORD_COLUMNS)
      .order('signal_epoch', { ascending: false })
      .limit(RECORD_LIMIT);
    if (error) throw new Error(error.message);
    if (!Array.isArray(data)) throw new Error('Unexpected response from the records service');
    cachedRecords = data as SignalRecordRow[];
    cachedRecordsAt = Date.now();
    return cachedRecords;
  })();

  recordsRequest = request;
  try {
    return await request;
  } finally {
    if (recordsRequest === request) recordsRequest = null;
  }
}
