import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BINANCE_BASE = "https://data-api.binance.vision/api/v3";
const UNIVERSE_SIZE = 100;
const CONCURRENCY = 10;
const DAY_MS = 86_400_000;
const EXCLUDED_BASES = new Set(["USDC", "USDT", "BUSD", "TUSD", "FDUSD", "DAI", "USDP", "EUR", "GBP", "AEUR", "PAXG"]);
const LEVERAGED_SUFFIX = /(UP|DOWN|BULL|BEAR)$/;

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

type Ticker24h = { symbol: string; quoteVolume: string };
type ExchangeSymbol = { symbol: string; baseAsset: string; quoteAsset: string; status: string; isSpotTradingAllowed?: boolean };

function isTicker24h(value: unknown): value is Ticker24h {
  return typeof value === "object" && value !== null
    && "symbol" in value && typeof value.symbol === "string"
    && "quoteVolume" in value && typeof value.quoteVolume === "string";
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getJson(path: string): Promise<unknown> {
  const response = await fetch(`${BINANCE_BASE}${path}`);
  if (!response.ok) throw new Error(`Market data source responded with status ${response.status}`);
  return response.json();
}

function utcDayStart(daysAgo: number): number {
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  return now.getTime() - daysAgo * DAY_MS;
}

function usdtBase(symbol: string): string | null {
  if (!symbol.endsWith("USDT")) return null;
  const base = symbol.slice(0, -4);
  if (base.length < 2 || EXCLUDED_BASES.has(base) || LEVERAGED_SUFFIX.test(base)) return null;
  return base;
}

async function mapInBatches<T, R>(items: T[], size: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let index = 0; index < items.length; index += size) {
    results.push(...(await Promise.all(items.slice(index, index + size).map(task))));
  }
  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  try {
    const body: unknown = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const isToday = typeof body === "object" && body !== null && "period" in body && body.period === "today";
    if (isToday) {
      const [ticker24h, exchangeData] = await Promise.all([
        getJson("/ticker/24hr"),
        getJson("/exchangeInfo"),
      ]);
      if (!Array.isArray(ticker24h) || !Array.isArray((exchangeData as { symbols?: unknown })?.symbols)) {
        throw new Error("Market data source returned an invalid spot market list");
      }
      const tradable = new Set(
        (exchangeData as { symbols: ExchangeSymbol[] }).symbols
          .filter((item) => item.status === "TRADING" && item.quoteAsset === "USDT" && item.isSpotTradingAllowed !== false)
          .filter((item) => usdtBase(item.symbol) !== null)
          .map((item) => item.symbol),
      );
      const liquidUniverse = ticker24h
        .filter(isTicker24h)
        .filter((ticker) => tradable.has(ticker.symbol))
        .sort((a, b) => Number(b.quoteVolume) - Number(a.quoteVolume))
        .slice(0, UNIVERSE_SIZE)
        .map((ticker) => ticker.symbol);
      if (liquidUniverse.length < 10) throw new Error("Not enough eligible USDT spot pairs were found");
      const tickerData = await getJson("/ticker/tradingDay?symbols=" + encodeURIComponent(JSON.stringify(liquidUniverse)) + "&timeZone=3&type=FULL");
      if (!Array.isArray(tickerData)) throw new Error("Binance returned an invalid current trading-day response");
      const liveRows = tickerData
        .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
        .filter((item) => typeof item.symbol === "string" && tradable.has(item.symbol))
        .map((item) => {
          const symbol = String(item.symbol);
          const open = Number(item.openPrice);
          const close = Number(item.lastPrice);
          const changePct = Number(item.priceChangePercent);
          const quoteVolume = Number(item.quoteVolume);
          return { symbol, base: usdtBase(symbol)!, open, close, changePct, quoteVolume };
        })
        .filter((item) => item.open > 0 && item.close > 0 && Number.isFinite(item.changePct) && Number.isFinite(item.quoteVolume))
        .sort((a, b) => b.quoteVolume - a.quoteVolume)
        .map((item, index) => ({ ...item, volumeRank: index + 1 }));
      if (liveRows.length < 10) return jsonResponse({ error: "Not enough current-day market data was returned" }, 502);
      return jsonResponse({ period: "today", tradeDate: new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date()), updatedAt: new Date().toISOString(), movers: liveRows });
    }
    const requestedDate = typeof body === "object" && body !== null && "date" in body
      ? body.date
      : undefined;
    const dayStart = typeof requestedDate === "string"
      ? Date.parse(`${requestedDate}T00:00:00Z`)
      : utcDayStart(1);
    if (!Number.isFinite(dayStart)) return jsonResponse({ error: "Date must look like YYYY-MM-DD" }, 400);
    if (dayStart >= utcDayStart(0)) return jsonResponse({ error: "Only completed UTC days can be stored" }, 400);
    const tradeDate = new Date(dayStart).toISOString().slice(0, 10);

    const [tickerData, exchangeData] = await Promise.all([
      getJson("/ticker/24hr"),
      getJson("/exchangeInfo"),
    ]);
    if (!Array.isArray(tickerData) || !Array.isArray((exchangeData as { symbols?: unknown })?.symbols)) {
      throw new Error("Market data source returned an invalid spot market list");
    }
    const tradableSymbols = new Set(
      (exchangeData as { symbols: ExchangeSymbol[] }).symbols
        .filter((item) => item.status === "TRADING" && item.quoteAsset === "USDT" && item.isSpotTradingAllowed !== false)
        .filter((item) => usdtBase(item.symbol) !== null)
        .map((item) => item.symbol),
    );
    const tickers = tickerData.filter(isTicker24h);
    const universe = tickers
      .filter((ticker) => tradableSymbols.has(ticker.symbol))
      .sort((a, b) => Number(b.quoteVolume) - Number(a.quoteVolume))
      .slice(0, UNIVERSE_SIZE);

    const candles = await mapInBatches(universe, CONCURRENCY, async (ticker) => {
      const rows = await getJson(`/klines?symbol=${ticker.symbol}&interval=1d&startTime=${dayStart}&limit=1`);
      const candle = Array.isArray(rows) ? rows[0] : null;
      if (!Array.isArray(candle) || Number(candle[0]) !== dayStart) return null;
      const open = Number(candle[1]);
      const close = Number(candle[4]);
      if (!(open > 0) || !Number.isFinite(close)) return null;
      return {
        symbol: ticker.symbol,
        base: usdtBase(ticker.symbol) as string,
        open,
        high: Number(candle[2]),
        low: Number(candle[3]),
        close,
        quoteVolume: Number(candle[7]),
      };
    });

    const valid = candles
      .filter((candle): candle is NonNullable<typeof candle> => candle !== null)
      .sort((a, b) => b.quoteVolume - a.quoteVolume);

    if (valid.length < 10) return jsonResponse({ error: "Not enough market data was returned for that day" }, 502);

    const capturedAt = new Date().toISOString();
    const rows = valid.map((candle, index) => ({
      trade_date: tradeDate,
      symbol: candle.symbol,
      base_asset: candle.base,
      open_price: candle.open,
      close_price: candle.close,
      high_price: candle.high,
      low_price: candle.low,
      change_pct: ((candle.close - candle.open) / candle.open) * 100,
      quote_volume: candle.quoteVolume,
      volume_rank: index + 1,
      captured_at: capturedAt,
    }));

    const { error } = await db.from("crypto_daily_movers").upsert(rows, { onConflict: "trade_date,symbol" });
    if (error) throw new Error(`Could not save daily movers: ${error.message}`);

    return jsonResponse({ tradeDate, stored: rows.length });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Request failed" }, 500);
  }
});
