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

export async function fetchCurrentDayCryptoMovers(): Promise<{ movers: CryptoMover[]; updatedAt: string }> {
  const { data, error } = await supabase.functions.invoke('crypto-movers', {
    method: 'POST',
    body: { period: 'today' },
  });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== 'object' || !Array.isArray(data.movers)) {
    throw new Error(data && typeof data === 'object' && 'error' in data ? String(data.error) : 'Current-day crypto data is unavailable.');
  }
  const movers = data.movers.filter((row: unknown): row is Record<string, unknown> =>
    typeof row === 'object' && row !== null && typeof row.symbol === 'string' && typeof row.base === 'string'
      && Number.isFinite(Number(row.changePct)) && Number.isFinite(Number(row.close)),
  ).map((row: Record<string, unknown>) => ({
    tradeDate: String(data.tradeDate ?? new Date().toISOString().slice(0, 10)),
    symbol: String(row.symbol),
    base: String(row.base),
    open: Number(row.open),
    close: Number(row.close),
    changePct: Number(row.changePct),
    quoteVolume: Number(row.quoteVolume ?? 0),
    volumeRank: Number(row.volumeRank ?? 0),
  })) as CryptoMover[];
  if (movers.length < 10) throw new Error('Current-day market data returned too few valid assets.');
  return { movers, updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString() };
}

export async function fetchCryptoMovers(): Promise<CryptoMover[]> {
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
