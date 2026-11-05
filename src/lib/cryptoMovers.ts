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

const LOOKBACK_DAYS = 14;
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

export async function fetchCryptoMovers(): Promise<CryptoMover[]> {
  let rows = await readSnapshot();

  // The database cron can be unavailable during DNS/network incidents. If no
  // saved snapshot exists, ask the authenticated Edge Function to capture the
  // last completed UTC day, then read the persisted snapshot again.
  if (rows.length === 0) {
    const { data, error } = await supabase.functions.invoke('crypto-movers', {
      method: 'POST',
      body: {},
    });
    if (error) {
      const context = (error as { context?: Response }).context;
      const payload = context && typeof context.json === 'function'
        ? await context.clone().json().catch(() => null)
        : null;
      const message = typeof payload?.error === 'string'
        ? payload.error
        : error.message || 'The crypto snapshot service is unavailable.';
      throw new Error(message);
    }
    if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
      throw new Error(data.error);
    }
    rows = await readSnapshot();
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
