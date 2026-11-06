export type SymbolInfo = { symbol: string; name: string; digits: number; exchange?: 'DERIV' | 'BINANCE' };
export type Candle = { epoch: number; open?: number; high?: number; low?: number; close: number };

const DERIV_WS_URL = "wss://api.derivws.com/trading/v1/options/ws/public";
const OPEN_TIMEOUT_MS = 15000;
const REQUEST_TIMEOUT_MS = 15000;

type JsonRecord = Record<string, unknown>;
type Pending = { resolve: (message: JsonRecord) => void; reject: (error: Error) => void; timer: number };

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class DerivFeed {
  private nextId = 1;
  private pending = new Map<number, Pending>();

  private constructor(private ws: WebSocket) {
    ws.onmessage = (event) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (!isRecord(parsed) || typeof parsed.req_id !== "number") return;
      const message = parsed;
      const entry = this.pending.get(message.req_id);
      if (!entry) return;
      this.pending.delete(message.req_id);
      clearTimeout(entry.timer);
      if (isRecord(message.error)) {
        entry.reject(new Error(
          typeof message.error.message === "string" ? message.error.message : "Deriv API error",
        ));
      } else {
        entry.resolve(message);
      }
    };
    ws.onclose = () => this.rejectAll("Deriv connection closed");
  }

  static open(): Promise<DerivFeed> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(DERIV_WS_URL);
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error("Deriv connection timed out"));
      }, OPEN_TIMEOUT_MS);
      ws.onopen = () => {
        clearTimeout(timer);
        resolve(new DerivFeed(ws));
      };
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error("Deriv connection failed"));
      };
    });
  }

  request(payload: Record<string, unknown>): Promise<JsonRecord> {
    const reqId = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(reqId);
        reject(new Error("Deriv request timed out"));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(reqId, { resolve, reject, timer });
      try {
        this.ws.send(JSON.stringify({ ...payload, req_id: reqId }));
      } catch {
        this.pending.delete(reqId);
        clearTimeout(timer);
        reject(new Error("Deriv connection is not open"));
      }
    });
  }

  close() {
    this.ws.close();
  }

  private rejectAll(message: string) {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error(message));
    }
    this.pending.clear();
  }
}

export async function loadSymbols(feed: DerivFeed): Promise<SymbolInfo[]> {
  const message = await withRateLimitRetry(() => feed.request({ active_symbols: "full" }));
  if (!Array.isArray(message.active_symbols)) throw new Error("Deriv returned no symbol list");
  const byCode = new Map<string, SymbolInfo>();
  for (const item of message.active_symbols) {
    if (!isRecord(item) || typeof item.underlying_symbol !== "string") continue;
    const pipSize = Number(item.pip_size);
    const digits = Number.isFinite(pipSize) && pipSize > 0 ? Math.max(0, Math.round(-Math.log10(pipSize))) : 4;
    byCode.set(item.underlying_symbol, {
      symbol: item.underlying_symbol,
      name: typeof item.underlying_symbol_name === "string"
        ? item.underlying_symbol_name
        : item.underlying_symbol,
      digits,
      exchange: 'DERIV',
    });
  }
  return [...byCode.values()];
}

async function withRateLimitRetry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const rateLimited = error instanceof Error && /rate limit/i.test(error.message);
      if (!rateLimited || attempt >= 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
    }
  }
}

export async function fetchCandles(
  feed: DerivFeed,
  symbol: string,
  granularity: number,
  count: number,
): Promise<Candle[]> {
  return withRateLimitRetry(() => requestCandles(feed, symbol, granularity, count));
}

async function requestCandles(
  feed: DerivFeed,
  symbol: string,
  granularity: number,
  count: number,
): Promise<Candle[]> {
  const message = await feed.request({
    ticks_history: symbol,
    style: "candles",
    granularity,
    count,
    end: "latest",
  });
  if (!Array.isArray(message.candles)) throw new Error(`No candles returned for ${symbol}`);
  return message.candles
    .filter(isRecord)
    .map((candle) => ({ epoch: Number(candle.epoch), open: Number(candle.open), high: Number(candle.high), low: Number(candle.low), close: Number(candle.close) }))
    .filter((candle) => Number.isFinite(candle.epoch) && Number.isFinite(candle.close) && Number.isFinite(candle.open) && Number.isFinite(candle.high) && Number.isFinite(candle.low))
    .sort((a, b) => a.epoch - b.epoch);
}
