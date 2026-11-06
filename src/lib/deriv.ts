// Deriv public market-data WebSocket client.
// Read-only: retrieves live prices and historical candles. No trading, no auth.

export type Candle = {
  epoch: number;
  open: number;
  high: number;
  low: number;
  close: number;
  symbol?: string;
};

type ReqId = number;
type JsonRecord = Record<string, unknown>;

type Pending = {
  resolve: (data: JsonRecord) => void;
  reject: (err: Error) => void;
};

export type OhlcUpdate = {
  granularity: number;
  candle: Candle;
  subscriptionId?: string;
};

type OhlcHandler = (update: OhlcUpdate) => void;
type StatusHandler = (status: ConnectionStatus, detail?: string) => void;
type OpenHandler = (resubscribe: () => void) => void;

export type DerivSymbol = {
  symbol: string;
  displayName: string;
  market: string;
  digits: number;
  exchange?: 'DERIV' | 'BINANCE';
};

export type ConnectionStatus =
  | 'connecting'
  | 'open'
  | 'closed'
  | 'reconnecting'
  | 'error';

const ENDPOINTS = ['wss://api.derivws.com/trading/v1/options/ws/public'];
const MAX_RECONNECT_DELAY = 15000;
const BASE_RECONNECT_DELAY = 1500;
const PING_INTERVAL = 12000;
const SUBSCRIBE_STAGGER = 250;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class DerivClient {
  private ws: WebSocket | null = null;
  private endpointIndex = 0;
  private reqId: ReqId = 0;
  private pending = new Map<ReqId, Pending>();
  private ohlcHandlers = new Set<OhlcHandler>();
  private statusHandlers = new Set<StatusHandler>();
  private openHandlers = new Set<OpenHandler>();
  private status: ConnectionStatus = 'closed';
  private shouldRun = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private subToGranularity = new Map<string, number>();

  onOhlc(handler: OhlcHandler) {
    this.ohlcHandlers.add(handler);
    return () => this.ohlcHandlers.delete(handler);
  }

  onStatus(handler: StatusHandler) {
    this.statusHandlers.add(handler);
    handler(this.status);
    return () => this.statusHandlers.delete(handler);
  }

  onOpen(handler: OpenHandler) {
    this.openHandlers.add(handler);
    return () => this.openHandlers.delete(handler);
  }

  getStatus() {
    return this.status;
  }

  start() {
    if (this.shouldRun) return;
    this.shouldRun = true;
    this.connect();
  }

  stop() {
    this.shouldRun = false;
    this.clearTimers();
    this.subToGranularity.clear();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
  }

  private connect() {
    this.setStatus('connecting');
    const url = ENDPOINTS[this.endpointIndex % ENDPOINTS.length];
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      this.setStatus('error', errMessage(err));
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.subToGranularity.clear();
      this.setStatus('open');
      this.startPing();
      const resubscribe = () => this.fireOpen();
      resubscribe();
    };

    ws.onmessage = (evt) => this.handleMessage(evt.data as string);

    ws.onerror = () => {
      if (this.status === 'connecting') {
        this.setStatus('error', 'WebSocket handshake failed');
      }
    };

    ws.onclose = () => {
      this.stopPing();
      this.ws = null;
      for (const pending of this.pending.values()) {
        pending.reject(new Error('connection closed'));
      }
      this.pending.clear();
      this.subToGranularity.clear();
      if (this.shouldRun) {
        this.endpointIndex++;
        this.scheduleReconnect();
      } else {
        this.setStatus('closed');
      }
    };
  }

  private fireOpen() {
    for (const handler of this.openHandlers) handler(() => this.fireOpen());
  }

  private scheduleReconnect() {
    this.clearReconnect();
    if (!this.shouldRun) return;
    this.setStatus('reconnecting', `attempt ${this.reconnectAttempts + 1}`);
    const delay = Math.min(
      BASE_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts),
      MAX_RECONNECT_DELAY,
    );
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private clearReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearTimers() {
    this.clearReconnect();
    this.stopPing();
  }

  private startPing() {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ ping: 1 }));
      }
    }, PING_INTERVAL);
  }

  private stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private setStatus(status: ConnectionStatus, detail?: string) {
    this.status = status;
    for (const handler of this.statusHandlers) handler(status, detail);
  }

  private send(payload: JsonRecord): Promise<JsonRecord> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('socket not open'));
    }
    const id = ++this.reqId;
    const msg = { ...payload, req_id: id };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws!.send(JSON.stringify(msg));
    });
  }

  private handleMessage(raw: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (!isRecord(parsed)) return;
    const data = parsed;

    if (typeof data.req_id === 'number' && this.pending.has(data.req_id)) {
      const pending = this.pending.get(data.req_id)!;
      this.pending.delete(data.req_id);
      if (isRecord(data.error)) {
        pending.reject(new Error(
          typeof data.error.message === 'string' ? data.error.message : 'Deriv API error',
        ));
      } else {
        pending.resolve(data);
      }
    }

    if (data.msg_type !== 'ohlc' || !isRecord(data.ohlc)) return;
    const ohlc = data.ohlc;
    const subId = typeof ohlc.id === 'string' ? ohlc.id : undefined;
    let granularity: number | undefined;

    if (typeof ohlc.granularity === 'number') {
      granularity = ohlc.granularity;
      if (subId) this.subToGranularity.set(subId, granularity);
    } else if (isRecord(data.echo_req) && typeof data.echo_req.granularity === 'number') {
      granularity = data.echo_req.granularity;
      if (subId) this.subToGranularity.set(subId, granularity);
    } else if (subId) {
      granularity = this.subToGranularity.get(subId);
    }
    if (granularity == null) return;

    const candle: Candle = {
      epoch: Number(ohlc.open_time),
      open: Number(ohlc.open),
      high: Number(ohlc.high),
      low: Number(ohlc.low),
      close: Number(ohlc.close),
      symbol: typeof ohlc.symbol === 'string' ? ohlc.symbol : undefined,
    };
    for (const handler of this.ohlcHandlers) {
      handler({ granularity, candle, subscriptionId: subId });
    }
  }

  forgetAllCandles(): Promise<void> {
    return this.send({ forget_all: 'candles' })
      .then(() => { this.subToGranularity.clear(); })
      .catch(() => { /* non-fatal */ });
  }

  loadActiveSymbols(): Promise<DerivSymbol[]> {
    return this.send({ active_symbols: 'full' }).then((data) => {
      if (!Array.isArray(data.active_symbols)) return [];
      return data.active_symbols
        .filter((item): item is JsonRecord =>
          isRecord(item) && typeof item.underlying_symbol === 'string',
        )
        .map((item) => {
          const pipSize = Number(item.pip_size);
          const digits = Number.isFinite(pipSize) && pipSize > 0
            ? Math.max(0, Math.round(-Math.log10(pipSize)))
            : 4;
          const symbol = item.underlying_symbol as string;
          return {
            symbol,
            displayName: typeof item.underlying_symbol_name === 'string'
              ? item.underlying_symbol_name
              : symbol,
            market: typeof item.market === 'string' ? item.market : 'Other',
            digits,
          };
        });
    });
  }

  subscribeCandles(symbol: string, granularity: number, count = 200): Promise<Candle[]> {
    return this.send({
      ticks_history: symbol,
      granularity,
      count,
      end: 'latest',
      style: 'candles',
      subscribe: 1,
    }).then((data) => {
      if (isRecord(data.subscription) && typeof data.subscription.id === 'string'
        && isRecord(data.echo_req) && typeof data.echo_req.granularity === 'number') {
        this.subToGranularity.set(data.subscription.id, data.echo_req.granularity);
      }
      if (!Array.isArray(data.candles)) return [];
      return data.candles
        .filter(isRecord)
        .map((candle) => ({
          epoch: Number(candle.epoch),
          open: Number(candle.open),
          high: Number(candle.high),
          low: Number(candle.low),
          close: Number(candle.close),
        }));
    });
  }

  staggerSubscriptions(tasks: Array<() => Promise<void>>): Promise<void[]> {
    const results: Promise<void>[] = [];
    tasks.forEach((task, index) => {
      const result = new Promise<void>((resolve) => {
        setTimeout(() => { task().then(resolve).catch(() => resolve()); },
          index * SUBSCRIBE_STAGGER);
      });
      results.push(result);
    });
    return Promise.all(results);
  }
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
