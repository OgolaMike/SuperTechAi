// Deriv public market-data WebSocket client.
// Read-only: retrieves live prices and historical candles. No trading, no auth.

export type Candle = {
  epoch: number; // open time, seconds
  open: number;
  high: number;
  low: number;
  close: number;
  symbol?: string;
};

type ReqId = number;

type Pending = {
  resolve: (data: any) => void;
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
};

export type ConnectionStatus =
  | 'connecting'
  | 'open'
  | 'closed'
  | 'reconnecting'
  | 'error';

// Deriv public market-data WebSocket endpoint (Options API public channel).
// No authentication required; streams live quotes, ticks, and OHLC.
// Legacy ws.derivws.com / ws.binaryws.com endpoints are deprecated; this is
// the current public endpoint documented at developers.deriv.com.
const ENDPOINTS = [
  'wss://api.derivws.com/trading/v1/options/ws/public',
];

const MAX_RECONNECT_DELAY = 15000;
const BASE_RECONNECT_DELAY = 1500;
const PING_INTERVAL = 12000;
const SUBSCRIBE_STAGGER = 250; // ms between subscription requests

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
  // Map subscription id -> granularity, so streaming updates map back to a tf
  // even when echo_req is absent.
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

    ws.onmessage = (evt) => {
      this.handleMessage(evt.data as string);
    };

    ws.onerror = () => {
      // Don't flip to 'error' status on every transient error; the onclose
      // handler will trigger reconnect. Only set error if still connecting.
      if (this.status === 'connecting') {
        this.setStatus('error', 'WebSocket handshake failed');
      }
    };

    ws.onclose = () => {
      this.stopPing();
      this.ws = null;
      for (const p of this.pending.values()) {
        p.reject(new Error('connection closed'));
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
    for (const h of this.openHandlers) {
      h(() => this.fireOpen());
    }
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
        // Ping is fire-and-forget; no req_id tracking needed.
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
    for (const h of this.statusHandlers) h(status, detail);
  }

  private send(payload: Record<string, any>): Promise<any> {
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
    let data: any;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }

    if (data.req_id && this.pending.has(data.req_id)) {
      const p = this.pending.get(data.req_id)!;
      this.pending.delete(data.req_id);
      if (data.error) {
        p.reject(new Error(data.error.message || 'Deriv API error'));
      } else {
        p.resolve(data);
      }
    }

    // OHLC stream update (subscription response or live update)
    if (data.msg_type === 'ohlc' && data.ohlc) {
      const ohlc = data.ohlc;
      const subId: string | undefined = ohlc.id;
      // The new public endpoint includes granularity directly on the ohlc
      // object; fall back to echo_req, then to our subscription map.
      let granularity: number | undefined;
      if (typeof ohlc.granularity === 'number') {
        const g: number = ohlc.granularity;
        granularity = g;
        if (subId) this.subToGranularity.set(subId, g);
      } else if (data.echo_req && typeof data.echo_req.granularity === 'number') {
        const g: number = data.echo_req.granularity;
        granularity = g;
        if (subId) this.subToGranularity.set(subId, g);
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
      for (const h of this.ohlcHandlers) {
        h({ granularity, candle, subscriptionId: subId });
      }
    }
  }

  // Forget all active candle subscriptions on the server. Call on reconnect
  // before re-subscribing to avoid duplicate streams.
  forgetAllCandles(): Promise<void> {
    return this.send({ forget_all: 'candles' })
      .then(() => {
        this.subToGranularity.clear();
      })
      .catch(() => {
        /* non-fatal */
      });
  }

  loadActiveSymbols(): Promise<DerivSymbol[]> {
    return this.send({ active_symbols: 'full' }).then((data) => {
      if (!Array.isArray(data.active_symbols)) return [];
      return data.active_symbols
        .filter((item: any) => typeof item.underlying_symbol === 'string')
        .map((item: any) => {
          const pipSize = Number(item.pip_size);
          const digits = Number.isFinite(pipSize) && pipSize > 0
            ? Math.max(0, Math.round(-Math.log10(pipSize)))
            : 4;
          return {
            symbol: item.underlying_symbol,
            displayName: item.underlying_symbol_name || item.underlying_symbol,
            market: item.market || 'Other',
            digits,
          };
        });
    });
  }

  // Request historical candles and subscribe to live OHLC updates.
  subscribeCandles(
    symbol: string,
    granularity: number,
    count = 200,
  ): Promise<Candle[]> {
    return this.send({
      ticks_history: symbol,
      granularity,
      count,
      end: 'latest',
      style: 'candles',
      subscribe: 1,
    }).then((data) => {
      if (data.subscription?.id && data.echo_req?.granularity != null) {
        this.subToGranularity.set(
          data.subscription.id,
          data.echo_req.granularity,
        );
      }
      if (!data.candles) return [];
      // New API returns candle objects with open/high/low/close/epoch fields.
      return (data.candles as Array<{
        epoch: number;
        open: number | string;
        high: number | string;
        low: number | string;
        close: number | string;
      }>).map((c) => ({
        epoch: Number(c.epoch),
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
      }));
    });
  }

  // Stagger a list of subscription actions so the server isn't hit with many
  // concurrent requests at once (which can trigger rate-limit drops).
  staggerSubscriptions(tasks: Array<() => Promise<void>>): Promise<void[]> {
    const results: Promise<void>[] = [];
    tasks.forEach((task, i) => {
      const p = new Promise<void>((resolve) => {
        setTimeout(() => {
          task().then(resolve).catch(() => resolve());
        }, i * SUBSCRIBE_STAGGER);
      });
      results.push(p);
    });
    return Promise.all(results);
  }
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
