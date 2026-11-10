import type { Candle, SymbolInfo } from './deriv.ts';

const REST_BASE = 'https://data-api.binance.vision/api/v3';
const EXCLUDED_BASES = new Set(['USDC','USDT','BUSD','TUSD','FDUSD','DAI','USDP','EUR','GBP','AEUR','PAXG']);
const LEVERAGED_SUFFIX = /(UP|DOWN|BULL|BEAR)$/;
const INTERVALS: Record<number, string> = {
  60: '1m', 300: '5m', 900: '15m', 1800: '30m',
  3600: '1h', 14400: '4h', 28800: '8h', 86400: '1d',
};

type Ticker = { symbol: string; quoteVolume: string };
type ExchangeSymbol = {
  symbol: string; baseAsset: string; quoteAsset: string; status: string;
  isSpotTradingAllowed?: boolean; filters?: Array<{ filterType?: string; tickSize?: string }>;
};

function digitsFromTickSize(value?: string): number {
  if (!value) return 8;
  const decimals = value.includes('.') ? value.split('.')[1].replace(/0+$/, '').length : 0;
  return Math.min(12, Math.max(0, decimals));
}

async function getJson(path: string): Promise<unknown> {
  const response = await fetch(`${REST_BASE}${path}`);
  if (!response.ok) throw new Error(`Binance API returned ${response.status}`);
  return response.json();
}

export async function loadBinanceSymbols(): Promise<SymbolInfo[]> {
  const [tickers, exchangeInfo] = await Promise.all([
    getJson('/ticker/24hr'),
    getJson('/exchangeInfo'),
  ]);
  if (!Array.isArray(tickers) || !Array.isArray((exchangeInfo as { symbols?: unknown })?.symbols)) {
    throw new Error('Binance returned an invalid spot market list');
  }
  const tradable = new Map<string, ExchangeSymbol>();
  for (const item of (exchangeInfo as { symbols: ExchangeSymbol[] }).symbols) {
    if (item.status === 'TRADING' && item.quoteAsset === 'USDT' && item.isSpotTradingAllowed !== false &&
        item.baseAsset.length >= 2 && !EXCLUDED_BASES.has(item.baseAsset) && !LEVERAGED_SUFFIX.test(item.baseAsset)) {
      tradable.set(item.symbol, item);
    }
  }
  return (tickers as Ticker[])
    .filter((ticker) => tradable.has(ticker.symbol) && Number.isFinite(Number(ticker.quoteVolume)))
    .sort((a, b) => Number(b.quoteVolume) - Number(a.quoteVolume))
    .slice(0, 100)
    .map((ticker) => {
      const item = tradable.get(ticker.symbol)!;
      const tickSize = item.filters?.find((filter) => filter.filterType === 'PRICE_FILTER')?.tickSize;
      return {
        symbol: item.symbol,
        name: item.baseAsset,
        digits: digitsFromTickSize(tickSize),
        exchange: 'BINANCE',
      };
    });
}

export async function fetchBinanceCandles(symbol: string, granularity: number, count: number): Promise<Candle[]> {
  const interval = INTERVALS[granularity];
  if (!interval) throw new Error(`Unsupported Binance interval: ${granularity}`);
  const rows = await getJson(`/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${Math.min(1000, count)}`);
  if (!Array.isArray(rows)) throw new Error(`Binance returned invalid candles for ${symbol}`);
  return rows.map((row: unknown) => {
    if (!Array.isArray(row)) return null;
    return {
      epoch: Math.floor(Number(row[0]) / 1000),
      open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]),
    };
  }).filter((candle): candle is Candle => candle !== null && Number.isFinite(candle.epoch) &&
    [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite))
    .sort((a, b) => a.epoch - b.epoch);
}
