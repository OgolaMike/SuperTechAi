import type { Candle } from './deriv';
import type { Timeframe } from './sma';

const REST_BASE = 'https://data-api.binance.vision/api/v3';
const STREAM_BASE = 'wss://stream.binance.com:9443/stream?streams=';
const EXCLUDED_BASES = new Set(['USDC','USDT','BUSD','TUSD','FDUSD','DAI','USDP','EUR','GBP','AEUR','PAXG']);
const LEVERAGED_SUFFIX = /(UP|DOWN|BULL|BEAR)$/;
const INTERVALS: Record<number, string> = {
  60: '1m', 300: '5m', 900: '15m', 1800: '30m',
  3600: '1h', 14400: '4h', 28800: '8h', 86400: '1d',
};
type BinanceTicker = { symbol: string; quoteVolume: string; lastPrice: string };
type BinanceExchangeSymbol = {
  symbol: string; baseAsset: string; quoteAsset: string; status: string;
  isSpotTradingAllowed?: boolean; filters?: Array<{ filterType?: string; tickSize?: string }>;
};
export type BinanceAsset = {
  symbol: string; name: string; displayName: string; market: string; digits: number;
};

function digitsFromTickSize(value?: string): number {
  if (!value) return 8;
  const decimals = value.includes('.') ? value.split('.')[1].replace(/0+$/, '').length : 0;
  return Math.min(12, Math.max(0, decimals));
}

export async function loadBinanceAssets(): Promise<BinanceAsset[]> {
  const [tickerResponse, exchangeResponse] = await Promise.all([
    fetch(`${REST_BASE}/ticker/24hr`),
    fetch(`${REST_BASE}/exchangeInfo`),
  ]);
  if (!tickerResponse.ok || !exchangeResponse.ok) throw new Error('Binance market list is temporarily unavailable');
  const [tickers, exchangeInfo] = await Promise.all([tickerResponse.json(), exchangeResponse.json()]);
  if (!Array.isArray(tickers) || !Array.isArray(exchangeInfo?.symbols)) throw new Error('Binance returned an invalid market list');
  const tradable = new Map<string, BinanceExchangeSymbol>();
  for (const item of exchangeInfo.symbols as BinanceExchangeSymbol[]) {
    if (item.status === 'TRADING' && item.quoteAsset === 'USDT' && item.isSpotTradingAllowed !== false &&
        item.baseAsset.length >= 2 && !EXCLUDED_BASES.has(item.baseAsset) && !LEVERAGED_SUFFIX.test(item.baseAsset)) {
      tradable.set(item.symbol, item);
    }
  }
  return (tickers as BinanceTicker[])
    .filter((ticker) => tradable.has(ticker.symbol) && Number.isFinite(Number(ticker.quoteVolume)))
    .sort((a, b) => Number(b.quoteVolume) - Number(a.quoteVolume))
    .slice(0, 100)
    .map((ticker) => {
      const item = tradable.get(ticker.symbol)!;
      const priceFilter = item.filters?.find((filter) => filter.filterType === 'PRICE_FILTER');
      return {
        symbol: item.symbol,
        name: item.baseAsset,
        displayName: `${item.baseAsset}/USDT`,
        market: 'Binance Spot',
        digits: digitsFromTickSize(priceFilter?.tickSize),
      };
    });
}

export async function fetchBinanceCandles(symbol: string, timeframe: Timeframe, count: number): Promise<Candle[]> {
  const interval = INTERVALS[timeframe.granularity];
  if (!interval) throw new Error(`Unsupported Binance timeframe: ${timeframe.label}`);
  const response = await fetch(`${REST_BASE}/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${Math.min(1000, count)}`);
  if (!response.ok) throw new Error(`Binance candle request failed for ${symbol} ${timeframe.label}: ${response.status}`);
  const rows: unknown = await response.json();
  if (!Array.isArray(rows)) throw new Error(`Binance returned invalid candles for ${symbol}`);
  return rows.map((row: unknown) => {
    if (!Array.isArray(row)) return null;
    return {
      epoch: Math.floor(Number(row[0]) / 1000),
      open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]),
      symbol,
    } satisfies Candle;
  }).filter((candle): candle is Candle => candle !== null && Number.isFinite(candle.epoch) &&
    [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite));
}

export class BinanceStream {
  private socket: WebSocket | null = null;

  start(symbols: string[], timeframes: Timeframe[], onCandle: (granularity: number, candle: Candle) => void): void {
    this.stop();
    if (symbols.length === 0) return;
    const intervals = new Map(Object.entries(INTERVALS).map(([seconds, interval]) => [interval, Number(seconds)]));
    const streams = symbols.flatMap((symbol) => timeframes.map((timeframe) => {
      const interval = INTERVALS[timeframe.granularity];
      return `${symbol.toLowerCase()}@kline_${interval}`;
    }));
    this.socket = new WebSocket(STREAM_BASE + streams.join('/'));
    this.socket.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data));
        const data = message?.data;
        const kline = data?.k;
        if (!kline || typeof data.s !== 'string' || typeof kline.i !== 'string') return;
        const granularity = intervals.get(kline.i);
        if (!granularity) return;
        onCandle(granularity, {
          epoch: Math.floor(Number(kline.t) / 1000),
          open: Number(kline.o), high: Number(kline.h), low: Number(kline.l), close: Number(kline.c),
          symbol: data.s,
        });
      } catch {
        // Ignore malformed public stream messages.
      }
    };
  }

  stop(): void {
    if (this.socket) {
      this.socket.onmessage = null;
      this.socket.close();
      this.socket = null;
    }
  }
}
