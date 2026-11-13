import { supabase } from '@/lib/supabase';

export type CryptoMover = {
  tradeDate: string;
  symbol: string;
  base: string;
  open: number;
  close: number;
  changePct: number;
  quoteVolume: number;
  volumeRank: number;
};

type MoverRow = {
  trade_date: string;
  symbol: string;
  base_asset: string;
  open_price: number | string;
  close_price: number | string;
  change_pct: number | string;
  quote_volume: number | string;
  volume_rank: number | string;
};

const LOOKBACK_DAYS = 7;
const COLUMNS = 'trade_date, symbol, base_asset, open_price, close_price, change_pct, quote_volume, volume_rank';

const isMoverRow = (row: MoverRow) =>
  typeof row.trade_date === 'string' && typeof row.symbol === 'string' && Number.isFinite(Number(row.change_pct));

async function readSnapshot(): Promise<MoverRow[]> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('crypto_daily_movers')
    .select(COLUMNS)
    .gte('trade_date', since)
    .order('trade_date', { ascending: false })
    .order('volume_rank', { ascending: true })
    .limit(2000);
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data : []) as MoverRow[];
}

async function fetchCurrentDayCryptoMoversUncached(): Promise<{ movers: CryptoMover[]; updatedAt: string }> {
  const { data, error } = await supabase.functions.invoke('crypto-movers', {
    method: 'POST',
    body: { period: 'today' },
  });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== 'object' || !Array.isArray(data.movers)) {
    throw new Error(data && typeof data === 'object' && 'error' in data ? String(data.error) : 'Current-day crypto data is unavailable.');
  }
  const payload = data as Record<string, unknown>;
  const rawMovers: unknown[] = Array.isArray(payload.movers) ? payload.movers : [];
  const movers = rawMovers.flatMap((value): CryptoMover[] => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return [];
    const row = value as Record<string, unknown>;
    const changePct = Number(row.changePct);
    const close = Number(row.close);
    if (typeof row.symbol !== 'string' || typeof row.base !== 'string'
      || !Number.isFinite(changePct) || !Number.isFinite(close)) return [];
    return [{
      tradeDate: String(payload.tradeDate ?? new Date().toISOString().slice(0, 10)),
      symbol: row.symbol,
      base: row.base,
      open: Number(row.open ?? 0),
      close,
      changePct,
      quoteVolume: Number(row.quoteVolume ?? 0),
      volumeRank: Number(row.volumeRank ?? 0),
    }];
  });
  if (movers.length < 10) throw new Error('Current-day market data returned too few valid assets.');
  return { movers, updatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt : new Date().toISOString() };
}

async function fetchCryptoMoversUncached(): Promise<CryptoMover[]> {
  let rows = await readSnapshot();
  const savedDates = new Set(rows.map((row) => row.trade_date));

  // Keep a rolling seven-day history. Capture each missing completed UTC day
  // separately so the history is backfilled even when the daily cron was missed.
  for (let daysAgo = 1; daysAgo <= 7; daysAgo += 1) {
    const date = new Date(Date.UTC(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth(),
      new Date().getUTCDate() - daysAgo,
    )).toISOString().slice(0, 10);

    if (savedDates.has(date)) continue;

    const { data, error } = await supabase.functions.invoke('crypto-movers', {
      method: 'POST',
      body: { date },
    });

    if (error || (data && typeof data === 'object' && 'error' in data)) {
      // Preserve and show any days that did load; a later refresh retries
      // missing dates rather than hiding usable history.
      continue;
    }
  }

  rows = await readSnapshot();
  if (rows.length === 0) {
    throw new Error('No completed-day crypto history is available. Please refresh shortly.');
  }

  return rows.filter(isMoverRow).map((row) => ({
    tradeDate: row.trade_date,
    symbol: row.symbol,
    base: row.base_asset,
    open: Number(row.open_price),
    close: Number(row.close_price),
    changePct: Number(row.change_pct),
    quoteVolume: Number(row.quote_volume),
    volumeRank: Number(row.volume_rank),
  }));
}

export function formatUsd(value: number): string {
  const digits = value >= 1000 ? 2 : value >= 1 ? 4 : 6;
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function formatCompactUsd(value: number): string {
  return `$${new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value)}`;
}

export function formatChange(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}


// Keep completed-day snapshots warm between page visits. Live rankings have a
// shorter cache because they are refreshed frequently.
let historyCache: { value: CryptoMover[]; expiresAt: number } | null = null;
let historyRequest: Promise<CryptoMover[]> | null = null;
let todayCache: { value: { movers: CryptoMover[]; updatedAt: string }; expiresAt: number } | null = null;
let todayRequest: Promise<{ movers: CryptoMover[]; updatedAt: string }> | null = null;

export async function fetchCryptoMovers(forceRefresh = false): Promise<CryptoMover[]> {
  if (!forceRefresh && historyCache && historyCache.expiresAt > Date.now()) return historyCache.value;
  if (historyRequest) return historyRequest;
  historyRequest = fetchCryptoMoversUncached().then((value) => {
    historyCache = { value, expiresAt: Date.now() + 60_000 };
    return value;
  }).finally(() => { historyRequest = null; });
  return historyRequest;
}

export async function fetchCurrentDayCryptoMovers(forceRefresh = false): Promise<{ movers: CryptoMover[]; updatedAt: string }> {
  if (!forceRefresh && todayCache && todayCache.expiresAt > Date.now()) return todayCache.value;
  if (todayRequest) return todayRequest;
  todayRequest = fetchCurrentDayCryptoMoversUncached().then((value) => {
    todayCache = { value, expiresAt: Date.now() + 20_000 };
    return value;
  }).finally(() => { todayRequest = null; });
  return todayRequest;
}
