import type { Candle } from '@/lib/deriv';
import { TIMEFRAMES, aggregateHourlyCandles, computeTfState, type TfState } from '@/lib/sma';

export const EXCHANGE_OPTIONS = [
  { id: 'OKX', name: 'OKX', quote: 'USDT' },
  { id: 'BYBIT', name: 'Bybit', quote: 'USDT' },
  { id: 'KUCOIN', name: 'KuCoin', quote: 'USDT' },
  { id: 'GATEIO', name: 'Gate.io', quote: 'USDT' },
  { id: 'BITGET', name: 'Bitget', quote: 'USDT' },
  { id: 'MEXC', name: 'MEXC', quote: 'USDT' },
  { id: 'HTX', name: 'HTX', quote: 'USDT' },
] as const;

export type ExchangeId = typeof EXCHANGE_OPTIONS[number]['id'];
export type ExchangeTicker = { exchange: ExchangeId; symbol: string; base: string; quote: string; price: number; open24h: number; changePct: number; quoteVolume: number };
export type ExchangeAssetState = { ticker: ExchangeTicker; candles: Candle[]; states: Record<number, TfState> };

const INTERVALS: Record<number, string> = { 900: '15m', 1800: '30m', 3600: '1h', 14400: '4h', 28800: '8h', 86400: '1d' };
const clean = (v: unknown) => typeof v === 'string' ? v : String(v ?? '');
const num = (v: unknown) => Number(v);
const valid = (v: number) => Number.isFinite(v) && v > 0;
const get = async (url: string) => {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Exchange market data unavailable (${response.status})`);
  return response.json();
};

export async function fetchExchangeTickers(exchange: ExchangeId): Promise<ExchangeTicker[]> {
  let rows: ExchangeTicker[] = [];
  if (exchange === 'OKX') {
    const d = await get('https://www.okx.com/api/v5/market/tickers?instType=SPOT');
    rows = (d.data ?? []).flatMap((x: any) => {
      const [base, quote] = clean(x.instId).split('-');
      const price = num(x.last), open24h = num(x.open24h);
      if (quote !== 'USDT' || !valid(price) || !valid(open24h)) return [];
      return [{ exchange, symbol: x.instId, base, quote, price, open24h, changePct: (price / open24h - 1) * 100, quoteVolume: num(x.volCcy24h) * price }];
    });
  } else if (exchange === 'BYBIT') {
    const d = await get('https://api.bybit.com/v5/market/tickers?category=spot');
    rows = (d.result?.list ?? []).flatMap((x: any) => {
      const symbol = clean(x.symbol);
      if (!symbol.endsWith('USDT')) return [];
      const base = symbol.slice(0, -4), price = num(x.lastPrice), open24h = num(x.prevPrice24h);
      if (!valid(price) || !valid(open24h)) return [];
      return [{ exchange, symbol, base, quote: 'USDT', price, open24h, changePct: (price / open24h - 1) * 100, quoteVolume: num(x.turnover24h) }];
    });
  } else if (exchange === 'KUCOIN') {
    const d = await get('https://api.kucoin.com/api/v1/market/allTickers');
    rows = (d.data?.ticker ?? []).flatMap((x: any) => {
      const symbol = clean(x.symbol), [base, quote] = symbol.split('-');
      const price = num(x.last), open24h = num(x.last) / (1 + num(x.changeRate));
      if (quote !== 'USDT' || !valid(price) || !valid(open24h)) return [];
      return [{ exchange, symbol, base, quote, price, open24h, changePct: num(x.changeRate) * 100, quoteVolume: num(x.volValue ?? x.vol) }];
    });
  } else if (exchange === 'GATEIO') {
    const d = await get('https://api.gateio.ws/api/v4/spot/tickers');
    rows = (d ?? []).flatMap((x: any) => {
      const [base, quote] = clean(x.currency_pair).split('_');
      const price = num(x.last), open24h = num(x.last) / (1 + num(x.change_percentage) / 100);
      if (quote !== 'USDT' || !valid(price) || !valid(open24h)) return [];
      return [{ exchange, symbol: x.currency_pair, base, quote, price, open24h, changePct: num(x.change_percentage), quoteVolume: num(x.quote_volume) }];
    });
  } else if (exchange === 'BITGET') {
    const d = await get('https://api.bitget.com/api/v2/spot/market/tickers');
    rows = (d.data ?? []).flatMap((x: any) => {
      const symbol = clean(x.symbol);
      if (!symbol.endsWith('USDT')) return [];
      const base = symbol.slice(0, -4), price = num(x.lastPr), open24h = num(x.open);
      if (!valid(price) || !valid(open24h)) return [];
      return [{ exchange, symbol, base, quote: 'USDT', price, open24h, changePct: (price / open24h - 1) * 100, quoteVolume: num(x.usdtVolume) }];
    });
  } else if (exchange === 'MEXC') {
    const d = await get('https://api.mexc.com/api/v3/ticker/24hr');
    rows = (d ?? []).flatMap((x: any) => {
      const symbol = clean(x.symbol);
      if (!symbol.endsWith('USDT')) return [];
      const base = symbol.slice(0, -4), price = num(x.lastPrice), open24h = num(x.openPrice);
      if (!valid(price) || !valid(open24h)) return [];
      return [{ exchange, symbol, base, quote: 'USDT', price, open24h, changePct: num(x.priceChangePercent), quoteVolume: num(x.quoteVolume) }];
    });
  } else if (exchange === 'HTX') {
    const d = await get('https://api.huobi.pro/market/tickers');
    rows = (d.data ?? []).flatMap((x: any) => {
      const symbol = clean(x.symbol).toUpperCase();
      if (!symbol.endsWith('USDT')) return [];
      const base = symbol.slice(0, -4), price = num(x.close), open24h = num(x.open);
      if (!valid(price) || !valid(open24h)) return [];
      return [{ exchange, symbol: clean(x.symbol), base, quote: 'USDT', price, open24h, changePct: (price / open24h - 1) * 100, quoteVolume: num(x.amount) * price }];
    });
  }
  return rows.filter((x) => valid(x.quoteVolume)).sort((a, b) => b.quoteVolume - a.quoteVolume).slice(0, 150);
}

export async function fetchExchangeCandles(exchange: ExchangeId, symbol: string, granularity: number): Promise<Candle[]> {
  const interval = INTERVALS[granularity];
  if (!interval) throw new Error('Unsupported exchange candle interval');
  let rows: any[] = [];
  if (exchange === 'OKX') {
    const bar = ({ '15m': '15m', '30m': '30m', '1h': '1H', '4h': '4H', '8h': '8H', '1d': '1D' } as Record<string, string>)[interval];
    const d = await get(`https://www.okx.com/api/v5/market/candles?instId=${encodeURIComponent(symbol)}&bar=${bar}&limit=200`);
    rows = (d.data ?? []).map((x: any) => ({ epoch: Math.floor(num(x[0]) / 1000), open: num(x[1]), high: num(x[2]), low: num(x[3]), close: num(x[4]) }));
  } else if (exchange === 'BYBIT') {
    const map: Record<string, string> = { '15m': '15', '30m': '30', '1h': '60', '4h': '240', '8h': '480', '1d': 'D' };
    const d = await get(`https://api.bybit.com/v5/market/kline?category=spot&symbol=${encodeURIComponent(symbol)}&interval=${map[interval]}&limit=200`);
    rows = (d.result?.list ?? []).map((x: any) => ({ epoch: Math.floor(num(x[0]) / 1000), open: num(x[1]), high: num(x[2]), low: num(x[3]), close: num(x[4]) }));
  } else if (exchange === 'KUCOIN') {
    const map: Record<string, string> = { '15m': '15min', '30m': '30min', '1h': '1hour', '4h': '4hour', '8h': '8hour', '1d': '1day' };
    const d = await get(`https://api.kucoin.com/api/v1/market/candles?symbol=${encodeURIComponent(symbol)}&type=${map[interval]}`);
    rows = (d.data ?? []).map((x: any) => ({ epoch: num(x[0]), open: num(x[1]), close: num(x[2]), high: num(x[3]), low: num(x[4]) }));
  } else if (exchange === 'GATEIO') {
    const map: Record<string, string> = { '15m': '15m', '30m': '30m', '1h': '1h', '4h': '4h', '8h': '8h', '1d': '1d' };
    const d = await get(`https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=${encodeURIComponent(symbol)}&interval=${map[interval]}&limit=200`);
    rows = (d ?? []).map((x: any) => ({ epoch: num(x[0]), open: num(x[5]), high: num(x[3]), low: num(x[4]), close: num(x[2]) }));
  } else if (exchange === 'BITGET') {
    const map: Record<string, string> = { '15m': '15min', '30m': '30min', '1h': '1H', '4h': '4H', '8h': '8H', '1d': '1D' };
    const d = await get(`https://api.bitget.com/api/v2/spot/market/candles?symbol=${encodeURIComponent(symbol)}&granularity=${map[interval]}&limit=200`);
    rows = (d.data ?? []).map((x: any) => ({ epoch: Math.floor(num(x[0]) / 1000), open: num(x[1]), high: num(x[2]), low: num(x[3]), close: num(x[4]) }));
  } else if (exchange === 'MEXC') {
    const d = await get(`https://api.mexc.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=200`);
    rows = (d ?? []).map((x: any) => ({ epoch: Math.floor(num(x[0]) / 1000), open: num(x[1]), high: num(x[2]), low: num(x[3]), close: num(x[4]) }));
  } else if (exchange === 'HTX') {
    const period: Record<string, string> = { '15m': '15min', '30m': '30min', '1h': '60min', '4h': '4hour', '8h': '8hour', '1d': '1day' };
    const d = await get(`https://api.huobi.pro/market/history/kline?symbol=${encodeURIComponent(symbol.toLowerCase())}&period=${period[interval]}&size=200`);
    rows = (d.data ?? []).map((x: any) => ({ epoch: num(x.id), open: num(x.open), high: num(x.high), low: num(x.low), close: num(x.close) }));
  }
  return rows.filter((x) => [x.epoch, x.open, x.high, x.low, x.close].every(Number.isFinite))
    .map((x) => ({ ...x, symbol })).sort((a, b) => a.epoch - b.epoch);
}

export async function buildExchangeStates(exchange: ExchangeId, symbol: string): Promise<ExchangeAssetState['states']> {
  const requested = [900, 1800, 3600, 14400, 28800, 86400];
  const results = await Promise.all(requested.map(async (granularity) => {
    try { return [granularity, await fetchExchangeCandles(exchange, symbol, granularity)] as const; }
    catch { return [granularity, [] as Candle[]] as const; }
  }));
  const byGranularity = Object.fromEntries(results) as Record<number, Candle[]>;
  const hourly = byGranularity[3600] ?? [];
  const all: Record<number, Candle[]> = { ...byGranularity };
  all[7200] = aggregateHourlyCandles(hourly, 7200);
  all[10800] = aggregateHourlyCandles(hourly, 10800);
  const now = Math.floor(Date.now() / 1000);
  return Object.fromEntries(TIMEFRAMES.map((tf) => [tf.granularity, computeTfState(tf, all[tf.granularity] ?? [], now)]));
}
