import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { DerivFeed, fetchCandles, loadSymbols, type Candle, type SymbolInfo } from "./deriv.ts";
import { fetchBinanceCandles, loadBinanceSymbols, fetchBinanceFuturesCandles, loadBinanceFuturesSymbols } from "./binance.ts";
import { computeSignals, type Signal } from "./strategy.ts";
import { buildBackendLimitIntent } from "./pendingIntents.ts";
import { buildHighRocStopSignal } from "./highRocSignals.ts";
import { reconcileBinanceSpotOrders, submitBinanceSpotLimitIntents } from "./binanceSpotAutomation.ts";
import { dispatchPending, loadVapid, type EventPayload, type PushEventRow } from "./webpush.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Scanner-Cron-Secret",
};

// Official analysis, charts and 8/8 grading share this exact high-to-low sequence.
// H2 and H3 are built from complete hourly candles so Deriv and Binance use matching bars.
const TIMEFRAMES = [
  { granularity: 86400, label: "D1", candleCount: 366 },
  { granularity: 28800, label: "H8", candleCount: 200 },
  { granularity: 14400, label: "H4", candleCount: 200 },
  { granularity: 10800, label: "H3", candleCount: 200 },
  { granularity: 7200, label: "H2", candleCount: 200 },
  { granularity: 3600, label: "H1", candleCount: 603 },
  { granularity: 1800, label: "M30", candleCount: 200 },
  { granularity: 900, label: "M15", candleCount: 200 },
];
type Timeframe = (typeof TIMEFRAMES)[number];

// Keep the separate M1/M5/M15 execution-quality gate intact; M1 and M5 are not
// members of the official eight-timeframe market-analysis or 8/8 grading set.
const AUTOMATION_TIMEFRAMES: Timeframe[] = [
  { granularity: 60, label: "M1", candleCount: 200 },
  { granularity: 300, label: "M5", candleCount: 200 },
  { granularity: 900, label: "M15", candleCount: 200 },
];
const SUPER_SIGNAL_FRESH_PRIMARY_SECONDS = 8 * 900;

function latestClosedEpoch(granularity: number, nowEpoch: number): number {
  return Math.floor(nowEpoch / granularity) * granularity - granularity;
}

function aggregateHourlyCandles(hourly: Candle[], targetGranularity: number): Candle[] {
  const hoursPerCandle = targetGranularity / 3600;
  if (!Number.isInteger(hoursPerCandle) || hoursPerCandle < 2) return [];
  const buckets = new Map<number, Candle[]>();
  for (const candle of hourly) {
    const bucketEpoch = Math.floor(candle.epoch / targetGranularity) * targetGranularity;
    const bucket = buckets.get(bucketEpoch) ?? [];
    bucket.push(candle);
    buckets.set(bucketEpoch, bucket);
  }
  return [...buckets.entries()].sort((a, b) => a[0] - b[0]).flatMap(([epoch, items]) => {
    const ordered = items.sort((a, b) => a.epoch - b.epoch);
    if (ordered.length !== hoursPerCandle ||
        ordered.some((candle, index) => candle.epoch !== epoch + index * 3600)) return [];
    return [{
      epoch,
      open: ordered[0].open ?? ordered[0].close,
      high: Math.max(...ordered.map((candle) => candle.high ?? candle.close)),
      low: Math.min(...ordered.map((candle) => candle.low ?? candle.close)),
      close: ordered[ordered.length - 1].close,
    }];
  });
}

async function loadTimeframeCandles(
  feed: DerivFeed | null,
  symbol: SymbolInfo,
  timeframe: Timeframe,
  nowEpoch: number,
  cache: Map<number, Candle[]>,
): Promise<Candle[]> {
  const cached = cache.get(timeframe.granularity);
  if (cached) return cached;

  // H2/H3 use fully formed UTC hourly buckets across Deriv, Binance Spot and Futures.
  if (timeframe.granularity === 7200 || timeframe.granularity === 10800) {
    const hoursPerCandle = timeframe.granularity / 3600;
    const hourlyFrame = TIMEFRAMES.find((frame) => frame.granularity === 3600)!;
    const hourlyCount = Math.min(1000, Math.max(hourlyFrame.candleCount, timeframe.candleCount * hoursPerCandle + hoursPerCandle));
    const hourly = await loadTimeframeCandles(
      feed, symbol, { ...hourlyFrame, candleCount: hourlyCount }, nowEpoch, cache,
    );
    const aggregated = aggregateHourlyCandles(hourly, timeframe.granularity);
    cache.set(timeframe.granularity, aggregated);
    return aggregated;
  }

  if (symbol.exchange !== "BINANCE" && symbol.exchange !== "BINANCE_FUTURES" && !feed) {
    throw new Error("Deriv feed is unavailable for this market");
  }
  const candles = symbol.exchange === "BINANCE_FUTURES"
    ? await fetchBinanceFuturesCandles(symbol.symbol, timeframe.granularity, timeframe.candleCount)
    : symbol.exchange === "BINANCE"
      ? await fetchBinanceCandles(symbol.symbol, timeframe.granularity, timeframe.candleCount)
      : await fetchCandles(feed!, symbol.symbol, timeframe.granularity, timeframe.candleCount);
  cache.set(timeframe.granularity, candles);
  return candles;
}

// Stop starting new Deriv requests after this, so the run finishes inside the function time limit.
const TIME_BUDGET_MS = 100_000;
const SCAN_CONCURRENCY = 1;
// Bound CPU work per invocation. The scheduler advances through deterministic symbol batches.
const SCAN_SYMBOLS_PER_RUN = 10;
// Events are only created for candles confirmed within this many periods, so outages never replay old signals.
const FRESH_CANDLES = 2;

const db: SupabaseClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

type SignalRow = {
  signal_key: string;
  symbol: string;
  asset_name: string;
  timeframe: string;
  granularity: number;
  digits: number;
  direction: "BUY" | "SELL";
  signal_epoch: number;
  entry: number;
  stop_loss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  band_mean: number;
  band_deviation: number;
  tp1_hit_epoch: number | null;
  tp2_hit_epoch: number | null;
  tp3_hit_epoch: number | null;
  sl_hit_epoch: number | null;
  status: string;
  closed: boolean;
  updated_at: string;
};

const ROW_STATE_FIELDS = ["status", "closed", "tp1_hit_epoch", "tp2_hit_epoch", "tp3_hit_epoch", "sl_hit_epoch"] as const;

const nowIso = () => new Date().toISOString();
const iso = (ms: number) => new Date(ms).toISOString();
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function updateHealth(patch: Record<string, unknown>): Promise<void> {
  const { error } = await db.from("scanner_state").update({ ...patch, updated_at: nowIso() }).eq("id", "main");
  if (error) console.error("Health update failed:", error.message);
}

async function loadMarks(): Promise<Map<string, number>> {
  const { data, error } = await db.from("scanner_candle_marks").select("symbol, granularity, last_candle_epoch");
  if (error) throw new Error(`Could not read scan progress: ${error.message}`);
  return new Map((data ?? []).map((row) => [`${row.symbol}|${row.granularity}`, Number(row.last_candle_epoch)]));
}

async function saveMarks(marks: { symbol: string; granularity: number; epoch: number }[]): Promise<void> {
  const { error } = await db.from("scanner_candle_marks").upsert(
    marks.map((mark) => ({
      symbol: mark.symbol,
      granularity: mark.granularity,
      last_candle_epoch: mark.epoch,
      updated_at: nowIso(),
    })),
    { onConflict: "symbol,granularity" },
  );
  if (error) throw new Error(`Could not save scan progress: ${error.message}`);
}

function toRow(symbol: SymbolInfo, timeframe: Timeframe, signal: Signal): SignalRow {
  const { levels, outcome } = signal;
  return {
    signal_key: `${symbol.symbol}|${timeframe.granularity}|${signal.signalEpoch}|${signal.direction}`,
    symbol: symbol.symbol,
    asset_name: symbol.name,
    timeframe: timeframe.label,
    granularity: timeframe.granularity,
    digits: symbol.digits,
    direction: signal.direction,
    signal_epoch: signal.signalEpoch,
    entry: levels.entry,
    stop_loss: levels.stopLoss,
    tp1: levels.tp1,
    tp2: levels.tp2,
    tp3: levels.tp3,
    band_mean: levels.mean,
    band_deviation: levels.deviation,
    tp1_hit_epoch: outcome.tp1Epoch,
    tp2_hit_epoch: outcome.tp2Epoch,
    tp3_hit_epoch: outcome.tp3Epoch,
    sl_hit_epoch: outcome.slEpoch,
    status: outcome.status,
    closed: outcome.closed,
    updated_at: nowIso(),
  };
}

async function loadExisting(keys: string[]): Promise<Map<string, Record<string, unknown>>> {
  if (keys.length === 0) return new Map();
  const { data, error } = await db
    .from("signal_records")
    .select("signal_key, status, closed, tp1_hit_epoch, tp2_hit_epoch, tp3_hit_epoch, sl_hit_epoch")
    .in("signal_key", keys);
  if (error) throw new Error(`Could not read signal records: ${error.message}`);
  return new Map((data ?? []).map((row) => [row.signal_key as string, row as Record<string, unknown>]));
}

function hasChanged(row: SignalRow, existing: Record<string, unknown> | undefined): boolean {
  if (!existing) return true;
  return ROW_STATE_FIELDS.some((field) => (existing[field] ?? null) !== (row[field] ?? null));
}

// Events are created only for candles newer than the last processed candle and still fresh.
// Existing events are never recreated because event keys are unique.
function eventsFor(row: SignalRow, previousMark: number, nowEpoch: number): PushEventRow[] {
  const isNew = (epoch: number) =>
    epoch > previousMark && nowEpoch - (epoch + row.granularity) <= FRESH_CANDLES * row.granularity;
  const payload = (label: string, price: number, eventEpoch: number): EventPayload => ({
    label,
    symbol: row.symbol,
    assetName: row.asset_name,
    timeframe: row.timeframe,
    direction: row.direction,
    digits: row.digits,
    signalEpoch: row.signal_epoch,
    entry: row.entry,
    stopLoss: row.stop_loss,
    tp1: row.tp1,
    tp2: row.tp2,
    tp3: row.tp3,
    price,
    eventEpoch,
  });

  const events: PushEventRow[] = [];
  if (isNew(row.signal_epoch)) {
    events.push({
      event_key: `${row.signal_key}|signal`,
      signal_key: row.signal_key,
      kind: "signal",
      payload: payload("signal", row.entry, row.signal_epoch),
    });
  }
  const hits: [string, number | null, PushEventRow["kind"], number][] = [
    ["TP1", row.tp1_hit_epoch, "target", row.tp1],
    ["TP2", row.tp2_hit_epoch, "target", row.tp2],
    ["TP3", row.tp3_hit_epoch, "target", row.tp3],
    ["SL", row.sl_hit_epoch, "stop", row.stop_loss],
  ];
  for (const [label, epoch, kind, price] of hits) {
    if (epoch === null || !isNew(epoch)) continue;
    events.push({
      event_key: `${row.signal_key}|${label}`,
      signal_key: row.signal_key,
      kind,
      payload: payload(label, price, epoch),
    });
  }
  return events;
}

async function processTimeframe(
  symbol: SymbolInfo,
  timeframe: Timeframe,
  candles: Candle[],
  nowEpoch: number,
  previousMark: number | undefined,
): Promise<{ rowsWritten: number; lastEpoch: number | null; signals: Signal[] }> {
  const { signals, lastConfirmedEpoch } = computeSignals(candles, timeframe.granularity, nowEpoch);
  const rows = signals.map((signal) => toRow(symbol, timeframe, signal));
  const existing = await loadExisting(rows.map((row) => row.signal_key));
  const changedRows = rows.filter((row) => hasChanged(row, existing.get(row.signal_key)));

  if (changedRows.length > 0) {
    const { error } = await db.from("signal_records").upsert(changedRows, { onConflict: "signal_key" });
    if (error) throw new Error(`Could not save signal records: ${error.message}`);
  }

  if (previousMark !== undefined) {
    const events = rows.flatMap((row) => eventsFor(row, previousMark, nowEpoch));
    if (events.length > 0) {
      const { error } = await db
        .from("push_events")
        .upsert(events, { onConflict: "event_key", ignoreDuplicates: true });
      if (error) throw new Error(`Could not queue push events: ${error.message}`);
    }
  }

  return { rowsWritten: changedRows.length, lastEpoch: lastConfirmedEpoch, signals };
}

function evaluateSuperSignal(
  candlesByFrame: Map<number, Candle[]>,
  nowEpoch: number,
): { direction: "BUY" | "SELL"; signalEpoch: number; entry: number; stopLoss: number; tp1: number; tp2: number; tp3: number } | null {
  const expectedFrames = TIMEFRAMES;
  const biases: string[] = [];
  let primary: ReturnType<typeof computeSignals>["signals"][number] | null = null;

  for (const frame of expectedFrames) {
    const candles = (candlesByFrame.get(frame.granularity) ?? [])
      .filter((candle) => candle.epoch + frame.granularity <= nowEpoch)
      .sort((a, b) => a.epoch - b.epoch);
    if (candles.length < 60) return null;
    const latest = candles[candles.length - 1];
    if (nowEpoch - (latest.epoch + frame.granularity) > 2 * frame.granularity) return null;
    const window = candles.slice(-60).map((candle) => candle.close);
    const mean = window.reduce((sum, value) => sum + value, 0) / 60;
    const variance = window.reduce((sum, value) => sum + (value - mean) ** 2, 0) / 60;
    const deviation = Math.sqrt(variance);
    const gap = latest.close - mean;
    biases.push(gap > deviation * 0.1 ? "BUY" : gap < -deviation * 0.1 ? "SELL" : "NEUTRAL");
    if (frame.granularity === 900) {
      const computed = computeSignals(candles, frame.granularity, nowEpoch).signals;
      primary = computed[computed.length - 1] ?? null;
    }
  }

  if (!primary || primary.outcome.closed || nowEpoch - primary.signalEpoch > SUPER_SIGNAL_FRESH_PRIMARY_SECONDS) return null;
  if (!biases.every((bias) => bias === primary!.direction)) return null;
  return {
    direction: primary.direction,
    signalEpoch: primary.signalEpoch,
    entry: primary.levels.entry,
    stopLoss: primary.levels.stopLoss,
    tp1: primary.levels.tp1,
    tp2: primary.levels.tp2,
    tp3: primary.levels.tp3,
  };
}

async function runScan(): Promise<Record<string, unknown>> {
  const started = Date.now();
  const nowEpoch = Math.floor(started / 1000);
  const leaseToken = crypto.randomUUID();
  const { data: leaseAcquired, error: leaseError } = await db.rpc("acquire_scanner_lease", {
    p_lease_token: leaseToken,
    p_ttl_seconds: 120,
  });
  if (leaseError) throw new Error("Scanner lease check failed: " + leaseError.message);
  if (leaseAcquired !== true) return { skipped: true, reason: "scanner_already_running" };

  let feed: DerivFeed | null = null;
  let derivLoadError: string | null = null;
  try {
    feed = await DerivFeed.open();
  } catch (error) {
    // Binance public market scanning must continue even if Deriv is temporarily unavailable.
    derivLoadError = `Deriv connection: ${messageOf(error)}`;
  }

  try {
    let derivSymbols: SymbolInfo[] = [];
    if (feed) {
      try {
        derivSymbols = await loadSymbols(feed);
      } catch (error) {
        derivLoadError = `Deriv asset discovery: ${messageOf(error)}`;
      }
    }
    let binanceSymbols: SymbolInfo[] = [];
    let binanceLoadError: string | null = null;
    try {
      binanceSymbols = await loadBinanceSymbols();
    } catch (error) {
      binanceLoadError = `Binance asset discovery: ${messageOf(error)}`;
    }
    const marks = await loadMarks();
    const { data: pushRows, error: pushRowsError } = await db.from("push_subscriptions").select("symbols");
    if (pushRowsError) throw new Error(`Could not load alert asset preferences: ${pushRowsError.message}`);
    const subscribedSymbols = new Set((pushRows ?? []).flatMap((row) => Array.isArray(row.symbols) ? row.symbols : []));
    const hasUnfilteredPushSubscription = (pushRows ?? []).some((row) => row.symbols == null);
    const { data: futuresAutomationRows, error: futuresAutomationError } = await db
      .from("binance_futures_settings")
      .select("allowed_symbols")
      .eq("connection_status", "connected")
      .eq("auto_trade_enabled", true)
      .eq("emergency_stop", false);
    if (futuresAutomationError) throw new Error("Could not load Futures automation pairs: " + futuresAutomationError.message);
    const { data: okxAutomationRows, error: okxAutomationError } = await db
      .from("okx_futures_settings")
      .select("user_id, auto_trade_enabled, live_execution_enabled, demo_trading, emergency_stop, connection_status")
      .eq("connection_status", "connected")
      .eq("auto_trade_enabled", true)
      .eq("emergency_stop", false);
    if (okxAutomationError) throw new Error("Could not load OKX automation accounts: " + okxAutomationError.message);
    const futuresAutomationAllowsAll = (futuresAutomationRows ?? []).some((row) =>
      !Array.isArray(row.allowed_symbols) || row.allowed_symbols.length === 0
    ) || (okxAutomationRows ?? []).length > 0;
    let binanceFuturesSymbols: SymbolInfo[] = [];
    let futuresLoadError: string | null = null;
    if ((futuresAutomationRows ?? []).length > 0 || (okxAutomationRows ?? []).length > 0) {
      try {
        binanceFuturesSymbols = await loadBinanceFuturesSymbols();
      } catch (error) {
        futuresLoadError = `Binance USD-M Futures discovery: ${messageOf(error)}`;
      }
    }
    const futuresAutomationSymbols = new Set(
      futuresAutomationAllowsAll
        ? binanceFuturesSymbols.map((symbol) => symbol.symbol)
        : (futuresAutomationRows ?? []).flatMap((row) => row.allowed_symbols ?? [])
    );
    const futuresSymbolsForScan = binanceFuturesSymbols.filter((symbol) =>
      futuresAutomationSymbols.has(symbol.symbol)
    );
    // Futures contracts use the dedicated USD-M catalogue and Futures klines,
    // never the Spot top-100 market list.
    const symbols = [...derivSymbols, ...binanceSymbols, ...futuresSymbolsForScan];
    // Rotate the starting symbol each minute so a time-limited run never always skips the same assets.
    const offset = symbols.length ? (Math.floor(started / 60000) * SCAN_SYMBOLS_PER_RUN) % symbols.length : 0;
    const ordered = [...symbols.slice(offset), ...symbols.slice(0, offset)];

    let fetchedCount = 0;
    let rowsWritten = 0;
    let scannedSymbols = 0;
    let lastError: string | null = [derivLoadError, binanceLoadError, futuresLoadError].filter(Boolean).join('; ') || null;
    try {
      await reconcileBinanceSpotOrders(db);
    } catch (error) {
      lastError = `Binance Spot order management: ${messageOf(error)}`;
    }

    let mt5AccountsPromise: Promise<Array<{
      user_id: string; login: string; server: string;
      auto_trade_enabled: boolean; unattended_execution_enabled: boolean;
      place_new_orders: boolean; risk_controls_enabled: boolean;
      live_execution_enabled: boolean; emergency_stop: boolean; bridge_status: string;
    }>> | null = null;
    const loadMt5Accounts = () => {
      mt5AccountsPromise ??= db.from("mt5_account_settings")
        .select("user_id,login,server,auto_trade_enabled,unattended_execution_enabled,place_new_orders,risk_controls_enabled,live_execution_enabled,emergency_stop,bridge_status")
        .eq("bridge_status", "connected")
        .then(({ data, error }) => {
          if (error) throw new Error(`Could not load paired MT5 accounts: ${error.message}`);
          return (data ?? []) as Array<{
            user_id: string; login: string; server: string;
            auto_trade_enabled: boolean; unattended_execution_enabled: boolean;
            place_new_orders: boolean; risk_controls_enabled: boolean;
            live_execution_enabled: boolean; emergency_stop: boolean; bridge_status: string;
          }>;
        });
      return mt5AccountsPromise;
    };

    async function persistAccountSignalIntent(
      accounts: Awaited<ReturnType<typeof loadMt5Accounts>>,
      symbolName: string,
      intent: {
        symbol: string; signalEpoch: number; direction: "BUY" | "SELL";
        orderType: "BUY_LIMIT" | "SELL_LIMIT";
        entry: number; stopLoss: number; takeProfit: number; currentPrice: number;
        timeframeAgreement: 3; strategyVersion: string; idempotencyKey: string;
      },
      source: "server_scanner_limit",
      strengthScore?: number,
    ) {
      if (!accounts.length) return;
      const expiresAt = new Date((intent.signalEpoch + 8 * 900) * 1000).toISOString();
      const rows = accounts.map((account) => {
        const unattendedEligible = account.auto_trade_enabled === true &&
          account.unattended_execution_enabled === true &&
          account.place_new_orders === true && account.risk_controls_enabled === true &&
          account.live_execution_enabled === true && account.emergency_stop === false &&
          account.bridge_status === "connected";
        return {
          user_id: account.user_id, account_login: account.login, account_server: account.server,
          source_signal_key: `${symbolName}|900|${intent.signalEpoch}|${intent.direction}|${intent.orderType}`,
          strategy_version: intent.strategyVersion, symbol: intent.symbol, timeframe: "M15",
          signal_epoch: intent.signalEpoch, direction: intent.direction, order_type: intent.orderType,
          entry: intent.entry, stop_loss: intent.stopLoss, take_profit: intent.takeProfit,
          idempotency_key: account.user_id + "|" + intent.idempotencyKey,
          status: "pending_review",
          payload: {
            current_price: intent.currentPrice, timeframe_agreement: intent.timeframeAgreement,
            strength_score: strengthScore ?? null, source,
            execution_mode: unattendedEligible ? "unattended_eligible_pending_safety_gate" : "manual_review",
            unattended_eligible: unattendedEligible,
            note: unattendedEligible
              ? "Account has opted into unattended trading, but this intent remains review-only until broker-side preflight and execution authorization are completed."
              : "Review-only proposal. No broker order has been authorized or placed.",
          },
          expires_at: expiresAt, updated_at: nowIso(),
        };
      });
      const { error } = await db.from("mt5_signal_intents").upsert(rows, {
        onConflict: "user_id,account_login,account_server,idempotency_key", ignoreDuplicates: true,
      });
      if (error) throw new Error(`Could not persist MT5 signal intents: ${error.message}`);
    }

    const scanSymbol = async (symbol: SymbolInfo) => {
      scannedSymbols += 1;
      const candleCache = new Map<number, Candle[]>();
      const newMarks: { symbol: string; granularity: number; epoch: number }[] = [];

      for (const timeframe of TIMEFRAMES) {
        if (Date.now() - started > TIME_BUDGET_MS) break;
        const markKey = `${symbol.symbol}|${timeframe.granularity}`;
        const previousMark = marks.get(markKey);
        const latestClosed = latestClosedEpoch(timeframe.granularity, nowEpoch);
        if (previousMark !== undefined && previousMark >= latestClosed) continue;

        try {
          const candles = await loadTimeframeCandles(feed, symbol, timeframe, nowEpoch, candleCache);
          fetchedCount += 1;
          const result = await processTimeframe(symbol, timeframe, candles, nowEpoch, previousMark);
          rowsWritten += result.rowsWritten;

          // Create review-only backend LIMIT proposals when a fresh M15 signal appears.
          if (timeframe.granularity === 900 && result.lastEpoch !== null &&
              (previousMark === undefined || result.lastEpoch > previousMark)) {
            const m15Signals = result.signals;
            const latestSignal = m15Signals[m15Signals.length - 1];
            const isFreshSignal = latestSignal && !latestSignal.outcome.closed &&
              nowEpoch - (latestSignal.signalEpoch + 900) <= 2 * 900 &&
              (previousMark === undefined || latestSignal.signalEpoch > previousMark);
            // High ROC is an independent signal-only strategy. It never calls a trade executor.
            try {
              const highRoc = buildHighRocStopSignal(symbol.symbol, candleCache.get(900) ?? [], nowEpoch);
              if (highRoc && highRoc.signalEpoch === latestClosed) {
                const signalKey = highRoc.idempotencyKey;
                const { error: highRocEventError } = await db.from("push_events").upsert([{
                  event_key: signalKey + "|signal", signal_key: signalKey, kind: "high_roc_stop",
                  payload: { label: highRoc.orderType, strategy: "HIGH ROC", strategyVersion: highRoc.strategyVersion,
                    symbol: symbol.symbol, assetName: symbol.name, timeframe: "M15", direction: highRoc.direction, orderType: highRoc.orderType,
                    digits: symbol.digits, signalEpoch: highRoc.signalEpoch, entry: highRoc.entry, stopLoss: highRoc.stopLoss,
                    tp1: highRoc.takeProfit, tp2: highRoc.takeProfit, tp3: highRoc.takeProfit, price: highRoc.currentPrice, eventEpoch: nowEpoch,
                    expiresAt: new Date(highRoc.expiresAtEpoch * 1000).toISOString(), expiryEpoch: highRoc.expiresAtEpoch,
                    roc3: highRoc.roc3, roc6: highRoc.roc6, roc12: highRoc.roc12, roc12Threshold: highRoc.roc12Threshold,
                    strength: highRoc.strength, riskReward: 2, timeframeAgreement: 3, executionMode: "SIGNAL_ONLY",
                    note: "Stop-entry proposal only. No broker order has been placed." }
                }], { onConflict: "event_key", ignoreDuplicates: true });
                if (highRocEventError) throw new Error("Could not queue High ROC signal: " + highRocEventError.message);
              }
            } catch (error) { lastError = "High ROC signal " + symbol.symbol + ": " + messageOf(error); }

            if (isFreshSignal) {
              try {
                // Automated-entry confluence is intentionally limited to M15, M5 and M1.
                // Higher frames remain available for context but never veto execution setups.
                for (const frame of AUTOMATION_TIMEFRAMES) {
                  if (!candleCache.has(frame.granularity)) {
                    await loadTimeframeCandles(feed, symbol, frame, nowEpoch, candleCache);
                    fetchedCount += 1;
                  }
                }
                const limitIntents = buildBackendLimitIntent(symbol.symbol, candleCache, nowEpoch).filter((intent) => intent.signalEpoch === latestSignal.signalEpoch);
                for (const limitIntent of limitIntents) {
                  const limitSignalKey = symbol.symbol + "|M15|" + limitIntent.signalEpoch + "|LIMIT";
                  const { error: limitEventError } = await db.from("push_events").upsert([{
                    event_key: limitIntent.idempotencyKey + "|limit_order",
                    signal_key: limitSignalKey,
                    kind: "limit_order",
                    payload: {
                      label: "LIMIT", symbol: symbol.symbol, assetName: symbol.name, timeframe: "M15",
                      direction: limitIntent.direction, digits: symbol.digits, signalEpoch: limitIntent.signalEpoch,
                      entry: limitIntent.entry, stopLoss: limitIntent.stopLoss,
                      tp1: limitIntent.takeProfit, tp2: limitIntent.takeProfit, tp3: limitIntent.takeProfit,
                      price: limitIntent.currentPrice, eventEpoch: nowEpoch,
                      strengthScore: limitIntent.strengthScore, momentumScore: limitIntent.momentumScore,
                      timeframeAgreement: limitIntent.timeframeAgreement,
                    },
                  }], { onConflict: "event_key", ignoreDuplicates: true });
                  if (limitEventError) throw new Error("Could not queue LIMIT push event: " + limitEventError.message);
                }
                if (symbol.exchange === "BINANCE") {
                  // Spot is long-only: bullish BUY LIMIT entries are wrapped in a native
                  // Binance OTOCO list. The protective SELL take-profit and stop-loss
                  // orders activate only after the working BUY LIMIT is fully filled.
                  const spotResult = await submitBinanceSpotLimitIntents(db, symbol.symbol, limitIntents);
                  if (spotResult.failed > 0) lastError = `Binance Spot execution ${symbol.symbol}: ${spotResult.failed} order(s) need review.`;
                } else {
                  const accounts = await loadMt5Accounts();
                  for (const limitIntent of limitIntents) {
                    await persistAccountSignalIntent(accounts, symbol.name, limitIntent,
                      "server_scanner_limit", limitIntent.strengthScore);
                  }
                }
              } catch (error) {
                lastError = `Automation intent ${symbol.symbol}: ${messageOf(error)}`;
              }
            }
          }
          if (result.lastEpoch !== null) {
            newMarks.push({ symbol: symbol.symbol, granularity: timeframe.granularity, epoch: result.lastEpoch });
            marks.set(markKey, result.lastEpoch);
          }
        } catch (error) {
          lastError = `${symbol.symbol} ${timeframe.label}: ${messageOf(error)}`;
        }
      }

      // Super Signal push events are generated server-side for subscribed assets only.
      // The same 8-frame freshness, SMA(60) bias and live M15 signal rules used by the app apply.
      if ((hasUnfilteredPushSubscription || subscribedSymbols.has(symbol.symbol) || futuresAutomationSymbols.has(symbol.symbol)) && Date.now() - started <= TIME_BUDGET_MS) {
        try {
          for (const frame of TIMEFRAMES) {
            if (!candleCache.has(frame.granularity)) {
              await loadTimeframeCandles(feed, symbol, frame, nowEpoch, candleCache);
              fetchedCount += 1;
            }
          }
          const superSignal = evaluateSuperSignal(candleCache, nowEpoch);
          if (superSignal) {
            // Binance Futures receives only fresh, confirmed 8/8 Super Signals.
            // This creates a member-specific signal intent; it does not place an exchange order.
            if (symbol.exchange === "BINANCE_FUTURES") {
              const { data: futuresAccounts, error: futuresAccountsError } = await db
                .from("binance_futures_settings")
                .select("user_id, leverage, risk_percent, max_daily_loss_pct, max_open_positions, allowed_symbols, auto_trade_enabled, live_execution_enabled, emergency_stop, connection_status")
                .eq("connection_status", "connected")
                .eq("auto_trade_enabled", true)
                .eq("emergency_stop", false);
              if (futuresAccountsError) throw new Error("Could not load Futures member settings: " + futuresAccountsError.message);
              const eligible = (futuresAccounts ?? []).filter((account) =>
                !Array.isArray(account.allowed_symbols) ||
                account.allowed_symbols.length === 0 ||
                account.allowed_symbols.includes(symbol.symbol)
              );
              if (eligible.length) {
                const futuresSignalKey = `${symbol.symbol}|900|${superSignal.signalEpoch}|${superSignal.direction}`;
                const intentRows = eligible.map((account) => ({
                  user_id: account.user_id,
                  signal_key: futuresSignalKey,
                  symbol: symbol.symbol,
                  side: superSignal.direction,
                  timeframe_agreement: 8,
                  signal_epoch: superSignal.signalEpoch,
                  entry_price: superSignal.entry,
                  stop_loss: superSignal.stopLoss,
                  take_profit: superSignal.tp3,
                  status: "signal_ready",
                  payload: {
                    leverage_preference: account.leverage,
                    risk_percent: account.risk_percent,
                    max_daily_loss_pct: account.max_daily_loss_pct,
                    max_open_positions: account.max_open_positions,
                    live_execution_requested: account.live_execution_enabled === true,
                    execution_state: "signal_only_live_execution_not_armed",
                    timeframe_agreement: 8,
                    source: "scanner_super_signal"
                  }
                }));
                const { error: intentError } = await db.from("binance_futures_signal_intents")
                  .upsert(intentRows, { onConflict: "user_id,signal_key", ignoreDuplicates: true });
                if (intentError) throw new Error("Could not save Futures Super Signal intents: " + intentError.message);
                // Execution is deferred until the scan has finished so the Futures executor
                // is invoked once per scan, not once for every matching contract.
              }
            }
            if (symbol.exchange === "BINANCE_FUTURES" && (okxAutomationRows ?? []).length > 0 && symbol.symbol.endsWith("USDT")) {
              const okxIntentRows = (okxAutomationRows ?? []).map((account) => ({
                user_id: account.user_id,
                signal_key: `${symbol.symbol}|900|${superSignal.signalEpoch}|${superSignal.direction}`,
                inst_id: symbol.symbol.replace(/USDT$/, "-USDT-SWAP"),
                side: superSignal.direction === "BUY" ? "buy" : "sell",
                timeframe_agreement: 8,
                signal_epoch: superSignal.signalEpoch,
                entry_price: superSignal.entry,
                stop_loss: superSignal.stopLoss,
                take_profit: superSignal.tp3,
                status: "signal_ready",
                payload: { source: "scanner_super_signal", timeframe_agreement: 8, execution_exchange: "OKX", demo_trading: account.demo_trading === true }
              }));
              const { error: okxIntentError } = await db.from("okx_futures_signal_intents")
                .upsert(okxIntentRows, { onConflict: "user_id,signal_key", ignoreDuplicates: true });
              if (okxIntentError) throw new Error("Could not save OKX Super Signal intents: " + okxIntentError.message);
              const okxExecutorResponse = await fetch(Deno.env.get("SUPABASE_URL") + "/functions/v1/okx-futures-executor", {
                method: "POST",
                headers: { "Authorization": "Bearer " + Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), "Content-Type": "application/json" },
                body: JSON.stringify({ action: "execute_pending" })
              });
              if (!okxExecutorResponse.ok) {
                const executorError = await okxExecutorResponse.text();
                throw new Error("OKX Futures executor returned " + okxExecutorResponse.status + ": " + executorError.slice(0, 180));
              }
              const okxExecutionResult = await okxExecutorResponse.json();
              if (okxExecutionResult?.failed > 0) console.error("OKX Futures executor reported failures", okxExecutionResult);
            }
            const signalKey = `${symbol.symbol}|900|${superSignal.signalEpoch}|${superSignal.direction}`;
            const { error: superEventError } = await db.from("push_events").upsert([{
              event_key: `${signalKey}|super_signal`,
              signal_key: signalKey,
              kind: "super_signal",
              payload: {
                label: "SUPER SIGNAL", symbol: symbol.symbol, assetName: symbol.name, timeframe: "8/8",
                direction: superSignal.direction, digits: symbol.digits, signalEpoch: superSignal.signalEpoch,
                entry: superSignal.entry, stopLoss: superSignal.stopLoss,
                tp1: superSignal.tp1, tp2: superSignal.tp2, tp3: superSignal.tp3,
                price: superSignal.entry, eventEpoch: nowEpoch, timeframeAgreement: 8,
              },
            }], { onConflict: "event_key", ignoreDuplicates: true });
            if (superEventError) throw new Error("Could not queue Super Signal push event: " + superEventError.message);
          }
        } catch (error) {
          lastError = `Super Signal push ${symbol.symbol}: ${messageOf(error)}`;
        }
      }

      if (newMarks.length > 0) {
        try {
          await saveMarks(newMarks);
        } catch (error) {
          lastError = messageOf(error);
        }
      }
    };

    const queue = ordered.slice(0, SCAN_SYMBOLS_PER_RUN);
    const workers = Array.from({ length: SCAN_CONCURRENCY }, async () => {
      while (queue.length > 0 && Date.now() - started <= TIME_BUDGET_MS) {
        await scanSymbol(queue.shift()!);
      }
    });
    await Promise.all(workers);

    // Run the Futures executor once after all symbols have been scanned and all fresh
    // 8/8 intents have been persisted. This avoids repeated Binance account REST bursts.
    if ((futuresAutomationRows ?? []).length > 0) {
      try {
        const executorResponse = await fetch(Deno.env.get("SUPABASE_URL") + "/functions/v1/binance-futures-executor", {
          method: "POST",
          headers: {
            "Authorization": "Bearer " + Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ action: "execute_pending" })
        });
        if (!executorResponse.ok) {
          const executorError = await executorResponse.text();
          throw new Error("Futures executor returned " + executorResponse.status + ": " + executorError.slice(0, 180));
        }
        const executorResult = await executorResponse.json();
        if (executorResult?.failed > 0) console.error("Futures executor reported failures", executorResult);
      } catch (error) {
        lastError = `Futures executor: ${messageOf(error)}`;
      }
    }

    let pushSummary: Record<string, number> = { sent: 0, failed: 0, removed: 0 };
    try {
      pushSummary = { ...(await dispatchPending(db, await loadVapid(db))) };
    } catch (error) {
      lastError = `Push delivery: ${messageOf(error)}`;
    }

    await updateHealth({
      connection_status: symbols.length > 0 ? "connected" : "error",
      last_run_at: iso(started),
      ...(fetchedCount > 0 ? { last_success_at: nowIso() } : {}),
      last_scan_symbols: scannedSymbols,
      last_scan_signals: rowsWritten,
      last_error: lastError,
      last_error_at: lastError ? nowIso() : null,
    });

    return {
      symbolsDiscovered: symbols.length,
      symbolsScanned: scannedSymbols,
      symbolsRemaining: Math.max(0, symbols.length - scannedSymbols),
      candlesFetched: fetchedCount,
      signalRowsWritten: rowsWritten,
      push: pushSummary,
      lastError,
    };
  } finally {
    feed?.close();
    try {
      const { error: releaseError } = await db.rpc("release_scanner_lease", { p_lease_token: leaseToken });
      if (releaseError) console.error("Scanner lease release failed:", releaseError.message);
    } catch (releaseError) {
      // The lease expires automatically if a transient database failure prevents release.
      console.error("Scanner lease release failed:", messageOf(releaseError));
    }
  }
}

async function authorizeScannerRequest(req: Request): Promise<boolean> {
  const suppliedSecret = req.headers.get("x-scanner-cron-secret");
  if (!suppliedSecret || suppliedSecret.length < 32 || suppliedSecret.length > 256) return false;

  const { data, error } = await db.rpc("verify_scanner_cron_secret", { p_secret: suppliedSecret });
  if (error) {
    console.error("Scanner cron authorization check failed:", error.message);
    return false;
  }
  return data === true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  if (!(await authorizeScannerRequest(req))) return jsonResponse({ error: "Unauthorized" }, 401);

  try {
    return jsonResponse(await runScan());
  } catch (error) {
    const message = messageOf(error);
    await updateHealth({ connection_status: "error", last_error: message, last_error_at: nowIso() });
    return jsonResponse({ error: message }, 500);
  }
});
