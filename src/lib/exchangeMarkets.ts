import type { Candle } from '@/lib/deriv';
import { supabase } from '@/lib/supabase';
import { TIMEFRAMES, aggregateHourlyCandles, computeTfState, type TfState } from '@/lib/sma';

export const EXCHANGE_OPTIONS = [
  { id: 'OKX', name: 'OKX', quote: 'USDT' },
  { id: 'BYBIT', name: 'Bybit', quote: 'USDT' },
  { id: 'KUCOIN', name: 'KuCoin', quote: 'USDT' },
  { id: 'GATEIO', name: 'Gate.io', quote: 'USDT' },
  { id: 'BITGET', name: 'Bitget', quote: 'USDT' },
  { id: 'MEXC', name: 'MEXC', quote: 'USDT' },
  { id: 'COINEX', name: 'CoinEx', quote: 'USDT' },
  { id: 'BINGX', name: 'BingX', quote: 'USDT' },
  { id: 'BITMART', name: 'BitMart', quote: 'USDT' },
] as const;

export type ExchangeId = typeof EXCHANGE_OPTIONS[number]['id'];
export type ExchangeTicker = { exchange: ExchangeId; symbol: string; base: string; quote: string; price: number; open24h: number; changePct: number; quoteVolume: number };
export type ExchangeAssetState = { ticker: ExchangeTicker; candles: Candle[]; states: Record<number, TfState> };

const INTERVALS: Record<number, string> = { 900: '15m', 1800: '30m', 3600: '1h', 14400: '4h', 28800: '8h', 86400: '1d' };
const clean = (v: unknown) => typeof v === 'string' ? v : String(v ?? '');
const num = (v: unknown) => Number(v);
const valid = (v: number) => Number.isFinite(v) && v > 0;
const get = async (url: string) => {
  const { data, error } = await supabase.functions.invoke('exchange-market', { method: 'POST', body: { url } });
  if (error) throw new Error(error.message || 'Exchange market data proxy is unavailable');
  if (!data || typeof data !== 'object' || 'error' in data) throw new Error(data && typeof data === 'object' && 'error' in data ? String(data.error) : 'Invalid exchange market response');
  return data;
};

async function fetchExchangeTickersUncached(exchange: ExchangeId): Promise<ExchangeTicker[]> {
  let rows: ExchangeTicker[] = [];
  if (exchange === 'OKX') {
    const d = await get('https://www.okx.com/api/v5/market/tickers?instType=SPOT');
    rows = (d.data ?? []).flatMap((x: Record<string, unknown>) => {
      const [base, quote] = clean(x.instId).split('-');
      const price = num(x.last), open24h = num(x.open24h);
      if (quote !== 'USDT' || !valid(price) || !valid(open24h)) return [];
      return [{ exchange, symbol: clean(x.instId), base, quote, price, open24h, changePct: (price / open24h - 1) * 100, quoteVolume: num(x.volCcy24h) * price }];
    });
  } else if (exchange === 'BYBIT') {
    const d = await get('https://api.bybit.com/v5/market/tickers?category=spot');
    rows = (d.result?.list ?? []).flatMap((x: Record<string, unknown>) => {
      const symbol = clean(x.symbol);
      if (!symbol.endsWith('USDT')) return [];
      const base = symbol.slice(0, -4), price = num(x.lastPrice), open24h = num(x.prevPrice24h);
      if (!valid(price) || !valid(open24h)) return [];
      return [{ exchange, symbol, base, quote: 'USDT', price, open24h, changePct: (price / open24h - 1) * 100, quoteVolume: num(x.turnover24h) }];
    });
  } else if (exchange === 'KUCOIN') {
    const d = await get('https://api.kucoin.com/api/v1/market/allTickers');
    rows = (d.data?.ticker ?? []).flatMap((x: Record<string, unknown>) => {
      const symbol = clean(x.symbol), [base, quote] = symbol.split('-');
      const price = num(x.last), open24h = num(x.last) / (1 + num(x.changeRate));
      if (quote !== 'USDT' || !valid(price) || !valid(open24h)) return [];
      return [{ exchange, symbol, base, quote, price, open24h, changePct: num(x.changeRate) * 100, quoteVolume: num(x.volValue ?? x.vol) }];
    });
  } else if (exchange === 'GATEIO') {
    const d = await get('https://api.gateio.ws/api/v4/spot/tickers');
    rows = (d ?? []).flatMap((x: Record<string, unknown>) => {
      const [base, quote] = clean(x.currency_pair).split('_');
      const price = num(x.last), open24h = num(x.last) / (1 + num(x.change_percentage) / 100);
      if (quote !== 'USDT' || !valid(price) || !valid(open24h)) return [];
      return [{ exchange, symbol: clean(x.currency_pair), base, quote, price, open24h, changePct: num(x.change_percentage), quoteVolume: num(x.quote_volume) }];
    });
  } else if (exchange === 'BITGET') {
    const d = await get('https://api.bitget.com/api/v2/spot/market/tickers');
    rows = (d.data ?? []).flatMap((x: Record<string, unknown>) => {
      const symbol = clean(x.symbol);
      if (!symbol.endsWith('USDT')) return [];
      const base = symbol.slice(0, -4), price = num(x.lastPr), open24h = num(x.open);
      if (!valid(price) || !valid(open24h)) return [];
      return [{ exchange, symbol, base, quote: 'USDT', price, open24h, changePct: (price / open24h - 1) * 100, quoteVolume: num(x.usdtVolume) }];
    });
  } else if (exchange === 'MEXC') {
    const d = await get('https://api.mexc.com/api/v3/ticker/24hr');
    rows = (d ?? []).flatMap((x: Record<string, unknown>) => {
      const symbol = clean(x.symbol);
      if (!symbol.endsWith('USDT')) return [];
      const base = symbol.slice(0, -4), price = num(x.lastPrice), open24h = num(x.openPrice);
      if (!valid(price) || !valid(open24h)) return [];
      return [{ exchange, symbol, base, quote: 'USDT', price, open24h, changePct: num(x.priceChangePercent), quoteVolume: num(x.quoteVolume) }];
    });
  } else if (exchange === 'COINEX') {
    const d = await get('https://api.coinex.com/v2/spot/ticker');
    rows = (d.data ?? []).flatMap((x: Record<string, unknown>) => {
      const symbol = clean(x.market), base = symbol.endsWith('USDT') ? symbol.slice(0, -4) : '';
      const price = num(x.last), open24h = num(x.open);
      if (!base || !valid(price) || !valid(open24h)) return [];
      return [{ exchange, symbol, base, quote: 'USDT', price, open24h, changePct: (price / open24h - 1) * 100, quoteVolume: num(x.value) }];
    });
  } else if (exchange === 'BINGX') {
    const d = await get('https://open-api.bingx.com/openApi/spot/v1/ticker/24hr');
    rows = (d.data?.tickers ?? []).flatMap((x: Record<string, unknown>) => {
      const symbol = clean(x.symbol), base = symbol.endsWith('-USDT') ? symbol.slice(0, -5) : '';
      const price = num(x.lastPrice), open24h = num(x.openPrice);
      if (!base || !valid(price) || !valid(open24h)) return [];
      return [{ exchange, symbol, base, quote: 'USDT', price, open24h, changePct: num(x.priceChangePercent ?? ((price / open24h - 1) * 100)), quoteVolume: num(x.quoteVolume) }];
    });
  } else if (exchange === 'BITMART') {
    const d = await get('https://api-cloud.bitmart.com/spot/quotation/v3/tickers');
    rows = (d.data ?? []).flatMap((x: unknown[]) => {
      const symbol = clean(x[0]), [base, quote] = symbol.split('_');
      const price = num(x[1]), open24h = num(x[2]);
      if (quote !== 'USDT' || !valid(price) || !valid(open24h)) return [];
      return [{ exchange, symbol, base, quote, price, open24h, changePct: (price / open24h - 1) * 100, quoteVolume: num(x[6]) }];
    });
  }
  return rows.filter((x) => valid(x.quoteVolume)).sort((a, b) => b.quoteVolume - a.quoteVolume).slice(0, 150);
}

export async function fetchExchangeCandles(exchange: ExchangeId, symbol: string, granularity: number): Promise<Candle[]> {
  const interval = INTERVALS[granularity];
  if (!interval) throw new Error('Unsupported exchange candle interval');
  let rows: Array<{ epoch: number; open: number; high: number; low: number; close: number }> = [];
  if (exchange === 'OKX') {
    const bar = ({ '15m': '15m', '30m': '30m', '1h': '1H', '4h': '4H', '8h': '8H', '1d': '1D' } as Record<string, string>)[interval];
    const d = await get(`https://www.okx.com/api/v5/market/candles?instId=${encodeURIComponent(symbol)}&bar=${bar}&limit=200`);
    rows = (d.data ?? []).map((x: unknown[]) => ({ epoch: Math.floor(num(x[0]) / 1000), open: num(x[1]), high: num(x[2]), low: num(x[3]), close: num(x[4]) }));
  } else if (exchange === 'BYBIT') {
    const map: Record<string, string> = { '15m': '15', '30m': '30', '1h': '60', '4h': '240', '8h': '480', '1d': 'D' };
    const d = await get(`https://api.bybit.com/v5/market/kline?category=spot&symbol=${encodeURIComponent(symbol)}&interval=${map[interval]}&limit=200`);
    rows = (d.result?.list ?? []).map((x: unknown[]) => ({ epoch: Math.floor(num(x[0]) / 1000), open: num(x[1]), high: num(x[2]), low: num(x[3]), close: num(x[4]) }));
  } else if (exchange === 'KUCOIN') {
    const map: Record<string, string> = { '15m': '15min', '30m': '30min', '1h': '1hour', '4h': '4hour', '8h': '8hour', '1d': '1day' };
    const d = await get(`https://api.kucoin.com/api/v1/market/candles?symbol=${encodeURIComponent(symbol)}&type=${map[interval]}`);
    rows = (d.data ?? []).map((x: unknown[]) => ({ epoch: num(x[0]), open: num(x[1]), close: num(x[2]), high: num(x[3]), low: num(x[4]) }));
  } else if (exchange === 'GATEIO') {
    const map: Record<string, string> = { '15m': '15m', '30m': '30m', '1h': '1h', '4h': '4h', '8h': '8h', '1d': '1d' };
    const d = await get(`https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=${encodeURIComponent(symbol)}&interval=${map[interval]}&limit=200`);
    rows = (d ?? []).map((x: unknown[]) => ({ epoch: num(x[0]), open: num(x[5]), high: num(x[3]), low: num(x[4]), close: num(x[2]) }));
  } else if (exchange === 'BITGET') {
    const map: Record<string, string> = { '15m': '15min', '30m': '30min', '1h': '1H', '4h': '4H', '8h': '8H', '1d': '1D' };
    const d = await get(`https://api.bitget.com/api/v2/spot/market/candles?symbol=${encodeURIComponent(symbol)}&granularity=${map[interval]}&limit=200`);
    rows = (d.data ?? []).map((x: unknown[]) => ({ epoch: Math.floor(num(x[0]) / 1000), open: num(x[1]), high: num(x[2]), low: num(x[3]), close: num(x[4]) }));
  } else if (exchange === 'MEXC') {
    const d = await get(`https://api.mexc.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=200`);
    rows = (d ?? []).map((x: unknown[]) => ({ epoch: Math.floor(num(x[0]) / 1000), open: num(x[1]), high: num(x[2]), low: num(x[3]), close: num(x[4]) }));
  } else if (exchange === 'COINEX') {
    const period: Record<string, string> = { '15m': '15min', '30m': '30min', '1h': '1hour', '4h': '4hour', '8h': '8hour', '1d': '1day' };
    const d = await get(`https://api.coinex.com/v2/spot/kline?market=${encodeURIComponent(symbol)}&period=${period[interval]}&limit=200`);
    rows = (d.data ?? []).map((x: Record<string, unknown>) => ({ epoch: num(x.created_at), open: num(x.open), high: num(x.high), low: num(x.low), close: num(x.close) }));
  } else if (exchange === 'BINGX') {
    const d = await get(`https://open-api.bingx.com/openApi/spot/v2/market/kline?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=200`);
    rows = (d.data ?? []).map((x: Record<string, unknown>) => ({ epoch: Math.floor(num(x.time ?? x.timestamp) / 1000), open: num(x.open), high: num(x.high), low: num(x.low), close: num(x.close) }));
  } else if (exchange === 'BITMART') {
    const step: Record<string, number> = { '15m': 15, '30m': 30, '1h': 60, '4h': 240, '8h': 480, '1d': 1440 };
    const d = await get(`https://api-cloud.bitmart.com/spot/quotation/v3/klines?symbol=${encodeURIComponent(symbol)}&step=${step[interval]}&limit=200`);
    rows = (d.data ?? []).map((x: unknown[]) => ({ epoch: num(x[0]), open: num(x[1]), high: num(x[2]), low: num(x[3]), close: num(x[4]) }));
  }
  return rows.filter((x) => [x.epoch, x.open, x.high, x.low, x.close].every(Number.isFinite))
    .map((x) => ({ ...x, symbol })).sort((a, b) => a.epoch - b.epoch);
}

async function buildExchangeStatesUncached(exchange: ExchangeId, symbol: string): Promise<ExchangeAssetState['states']> {
  const requested = [900, 1800, 3600, 14400, 86400];
  const results = await Promise.all(requested.map(async (granularity) => {
    try { return [granularity, await fetchExchangeCandles(exchange, symbol, granularity)] as const; }
    catch { return [granularity, [] as Candle[]] as const; }
  }));
  const byGranularity = Object.fromEntries(results) as Record<number, Candle[]>;
  const hourly = byGranularity[3600] ?? [];
  const all: Record<number, Candle[]> = { ...byGranularity };
  all[28800] = aggregateHourlyCandles(hourly, 28800);
  all[7200] = aggregateHourlyCandles(hourly, 7200);
  all[10800] = aggregateHourlyCandles(hourly, 10800);
  const now = Math.floor(Date.now() / 1000);
  return Object.fromEntries(TIMEFRAMES.map((tf) => [tf.granularity, computeTfState(tf, all[tf.granularity] ?? [], now)]));
}


// Short-lived in-memory caches make tab switches and repeat visits feel instant.
// Requests are shared while in flight to prevent duplicate exchange calls.
const TICKER_CACHE_MS = 45_000;
const CHART_CACHE_MS = 5 * 60_000;
const tickerCache = new Map<ExchangeId, { value: ExchangeTicker[]; expiresAt: number }>();
const tickerRequests = new Map<ExchangeId, Promise<ExchangeTicker[]>>();
const chartCache = new Map<string, { value: ExchangeAssetState['states']; expiresAt: number }>();
const chartRequests = new Map<string, Promise<ExchangeAssetState['states']>>();

export async function fetchExchangeTickers(exchange: ExchangeId): Promise<ExchangeTicker[]> {
  const cached = tickerCache.get(exchange);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const pending = tickerRequests.get(exchange);
  if (pending) return pending;
  const request = fetchExchangeTickersUncached(exchange).then((value) => {
    tickerCache.set(exchange, { value, expiresAt: Date.now() + TICKER_CACHE_MS });
    return value;
  }).finally(() => tickerRequests.delete(exchange));
  tickerRequests.set(exchange, request);
  return request;
}

export async function buildExchangeStates(exchange: ExchangeId, symbol: string): Promise<ExchangeAssetState['states']> {
  const key = exchange + ':' + symbol;
  const cached = chartCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const pending = chartRequests.get(key);
  if (pending) return pending;
  const request = buildExchangeStatesUncached(exchange, symbol).then((value) => {
    chartCache.set(key, { value, expiresAt: Date.now() + CHART_CACHE_MS });
    return value;
  }).finally(() => chartRequests.delete(key));
  chartRequests.set(key, request);
  return request;
}
