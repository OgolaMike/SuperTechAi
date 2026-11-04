import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { DerivFeed, fetchCandles, loadSymbols, type Candle, type SymbolInfo } from "./deriv.ts";
import { computeSignals, type Signal } from "./strategy.ts";
import { buildBackendStopIntent } from "./pendingIntents.ts";
import { dispatchPending, loadVapid, type EventPayload, type PushEventRow } from "./webpush.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Keep this list aligned with src/lib/sma.ts. Only closed candles are evaluated below.
const TIMEFRAMES = [
  { granularity: 60, label: "M1", candleCount: 200 },
  { granularity: 300, label: "M5", candleCount: 200 },
  { granularity: 900, label: "M15", candleCount: 200 },
  { granularity: 1800, label: "M30", candleCount: 200 },
  { granularity: 3600, label: "H1", candleCount: 200 },
  { granularity: 7200, label: "H2", candleCount: 200 },
  { granularity: 14400, label: "H4", candleCount: 200 },
  { granularity: 86400, label: "D1", candleCount: 366 },
];
type Timeframe = (typeof TIMEFRAMES)[number];

// Stop starting new Deriv requests after this, so the run finishes inside the function time limit.
const TIME_BUDGET_MS = 100_000;
const SCAN_CONCURRENCY = 4;
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
): Promise<{ rowsWritten: number; lastEpoch: number | null }> {
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

  return { rowsWritten: changedRows.length, lastEpoch: lastConfirmedEpoch };
}

async function runScan(): Promise<Record<string, unknown>> {
  const started = Date.now();
  const nowEpoch = Math.floor(started / 1000);

  let feed: DerivFeed;
  try {
    feed = await DerivFeed.open();
  } catch (error) {
    await updateHealth({ connection_status: "error", last_run_at: iso(started), last_error: messageOf(error), last_error_at: nowIso() });
    throw error;
  }

  try {
    const symbols = await loadSymbols(feed);
    const marks = await loadMarks();
    // Rotate the starting symbol each minute so a time-limited run never always skips the same assets.
    const offset = symbols.length ? Math.floor(started / 60000) % symbols.length : 0;
    const ordered = [...symbols.slice(offset), ...symbols.slice(0, offset)];

    let fetchedCount = 0;
    let rowsWritten = 0;
    let scannedSymbols = 0;
    let lastError: string | null = null;

    let mt5AccountsPromise: Promise<Array<{ user_id: string; login: string; server: string }>> | null = null;
    const loadMt5Accounts = () => {
      mt5AccountsPromise ??= db.from("mt5_account_settings").select("user_id,login,server")
        .then(({ data, error }) => {
          if (error) throw new Error(`Could not load paired MT5 accounts: ${error.message}`);
          return (data ?? []) as Array<{ user_id: string; login: string; server: string }>;
        });
      return mt5AccountsPromise;
    };

    const scanSymbol = async (symbol: SymbolInfo) => {
      scannedSymbols += 1;
      const candleCache = new Map<number, Candle[]>();
      const newMarks: { symbol: string; granularity: number; epoch: number }[] = [];

      for (const timeframe of TIMEFRAMES) {
        if (Date.now() - started > TIME_BUDGET_MS) break;
        const markKey = `${symbol.symbol}|${timeframe.granularity}`;
        const previousMark = marks.get(markKey);
        const latestClosed = Math.floor(nowEpoch / timeframe.granularity) * timeframe.granularity - timeframe.granularity;
        if (previousMark !== undefined && previousMark >= latestClosed) continue;

        try {
          const candles = await fetchCandles(feed, symbol.symbol, timeframe.granularity, timeframe.candleCount);
          candleCache.set(timeframe.granularity, candles);
          fetchedCount += 1;
          const result = await processTimeframe(symbol, timeframe, candles, nowEpoch, previousMark);
          rowsWritten += result.rowsWritten;

          // Create review-only backend STOP proposals when a fresh M15 signal appears.
          if (timeframe.granularity === 900 && result.lastEpoch !== null &&
              (previousMark === undefined || result.lastEpoch > previousMark)) {
            const m15Signals = computeSignals(candles, 900, nowEpoch).signals;
            const latestSignal = m15Signals[m15Signals.length - 1];
            const isFreshSignal = latestSignal && !latestSignal.outcome.closed &&
              nowEpoch - (latestSignal.signalEpoch + 900) <= 2 * 900 &&
              (previousMark === undefined || latestSignal.signalEpoch > previousMark);
            if (isFreshSignal) {
              try {
                for (const frame of TIMEFRAMES) {
                  if (!candleCache.has(frame.granularity)) {
                    const frameCandles = await fetchCandles(feed, symbol.symbol, frame.granularity, frame.candleCount);
                    candleCache.set(frame.granularity, frameCandles);
                    fetchedCount += 1;
                  }
                }
                const intent = buildBackendStopIntent(symbol.symbol, candleCache, nowEpoch);
                if (intent && intent.signalEpoch === latestSignal.signalEpoch) {
                  const accounts = await loadMt5Accounts();
                  if (accounts.length > 0) {
                    const expiresAt = new Date((intent.signalEpoch + 8 * 900) * 1000).toISOString();
                    const { error: intentError } = await db.from("mt5_signal_intents").upsert(
                      accounts.map((account) => ({
                        user_id: account.user_id, account_login: account.login, account_server: account.server,
                        source_signal_key: `${symbol.symbol}|900|${intent.signalEpoch}|${intent.direction}`,
                        strategy_version: intent.strategyVersion, symbol: intent.symbol, timeframe: "M15",
                        signal_epoch: intent.signalEpoch, direction: intent.direction, order_type: intent.orderType,
                        entry: intent.entry, stop_loss: intent.stopLoss, take_profit: intent.takeProfit,
                        idempotency_key: intent.idempotencyKey, status: "pending_review",
                        payload: { current_price: intent.currentPrice, timeframe_agreement: intent.timeframeAgreement,
                          source: "server_scanner", note: "Review-only proposal. No broker order has been authorized or placed." },
                        expires_at: expiresAt, updated_at: nowIso(),
                      })),
                      { onConflict: "user_id,account_login,account_server,idempotency_key", ignoreDuplicates: true },
                    );
                    if (intentError) throw new Error(`Could not persist MT5 signal intents: ${intentError.message}`);
                  }
                }
              } catch (error) {
                lastError = `MT5 intent ${symbol.symbol}: ${messageOf(error)}`;
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

      if (newMarks.length > 0) {
        try {
          await saveMarks(newMarks);
        } catch (error) {
          lastError = messageOf(error);
        }
      }
    };

    const queue = [...ordered];
    const workers = Array.from({ length: SCAN_CONCURRENCY }, async () => {
      while (queue.length > 0 && Date.now() - started <= TIME_BUDGET_MS) {
        await scanSymbol(queue.shift()!);
      }
    });
    await Promise.all(workers);

    let pushSummary: Record<string, number> = { sent: 0, failed: 0, removed: 0 };
    try {
      pushSummary = { ...(await dispatchPending(db, await loadVapid(db))) };
    } catch (error) {
      lastError = `Push delivery: ${messageOf(error)}`;
    }

    await updateHealth({
      connection_status: "connected",
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
      candlesFetched: fetchedCount,
      signalRowsWritten: rowsWritten,
      push: pushSummary,
      lastError,
    };
  } finally {
    feed.close();
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  try {
    return jsonResponse(await runScan());
  } catch (error) {
    const message = messageOf(error);
    await updateHealth({ connection_status: "error", last_error: message, last_error_at: nowIso() });
    return jsonResponse({ error: message }, 500);
  }
});
