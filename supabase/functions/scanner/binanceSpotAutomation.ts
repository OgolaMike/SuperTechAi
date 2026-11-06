import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

type SpotIntent = {
  symbol: string;
  signalEpoch: number;
  direction: "BUY" | "SELL";
  orderType: "BUY_LIMIT" | "SELL_LIMIT";
  entry: number;
  stopLoss: number;
  takeProfit: number;
  currentPrice: number;
  idempotencyKey: string;
};
type AccountSettings = {
  user_id: string;
  max_trade_usdt: number;
  max_open_positions: number;
  allowed_symbols: string[] | null;
};
type SymbolRules = { tickSize: number; stepSize: number; minQty: number; maxQty: number; minNotional: number };
const BASE = "https://api.binance.com";
const encoder = new TextEncoder();
const ruleCache = new Map<string, SymbolRules | null>();

const b64decode = (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
async function encryptionKey() {
  const secret = Deno.env.get("BINANCE_CREDENTIALS_ENCRYPTION_KEY");
  if (!secret || secret.length < 32) throw new Error("binance_encryption_key_not_configured");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["decrypt"]);
}
async function decrypt(value: string) {
  const packed = b64decode(value);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: packed.slice(0, 12) }, await encryptionKey(), packed.slice(12));
  return new TextDecoder().decode(plain);
}
async function hmac(secret: string, value: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return [...new Uint8Array(signature)].map((v) => v.toString(16).padStart(2, "0")).join("");
}
async function signedBinance(
  apiKey: string,
  apiSecret: string,
  path: string,
  method: "GET" | "POST",
  values: Record<string, string>,
) {
  const params = new URLSearchParams({ ...values, recvWindow: "5000", timestamp: String(Date.now()) });
  const signature = await hmac(apiSecret, params.toString());
  const url = BASE + path + (method === "GET" ? "?" + params.toString() + "&signature=" + signature : "");
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        "X-MBX-APIKEY": apiKey,
        ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      },
      ...(method === "POST" ? { body: params.toString() + "&signature=" + signature } : {}),
    });
  } catch {
    throw new Error("binance_network_outcome_uncertain");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data?.msg === "string" ? data.msg : "binance_api_rejected_request";
    throw new Error("binance_rejected:" + message.slice(0, 120));
  }
  return data as Record<string, unknown>;
}
async function getRules(symbol: string): Promise<SymbolRules | null> {
  if (ruleCache.has(symbol)) return ruleCache.get(symbol) ?? null;
  const response = await fetch(BASE + "/api/v3/exchangeInfo?symbol=" + encodeURIComponent(symbol));
  if (!response.ok) throw new Error("binance_exchange_rules_unavailable");
  const payload = await response.json();
  const item = Array.isArray(payload?.symbols) ? payload.symbols[0] : null;
  if (!item || item.status !== "TRADING" || item.isSpotTradingAllowed === false) {
    ruleCache.set(symbol, null);
    return null;
  }
  const filters = Array.isArray(item.filters) ? item.filters : [];
  const lot = filters.find((v: Record<string, unknown>) => v.filterType === "LOT_SIZE");
  const price = filters.find((v: Record<string, unknown>) => v.filterType === "PRICE_FILTER");
  const notional = filters.find((v: Record<string, unknown>) => v.filterType === "NOTIONAL" || v.filterType === "MIN_NOTIONAL");
  if (!lot || !price) {
    ruleCache.set(symbol, null);
    return null;
  }
  const rules = {
    tickSize: Number(price.tickSize),
    stepSize: Number(lot.stepSize),
    minQty: Number(lot.minQty),
    maxQty: Number(lot.maxQty),
    minNotional: Number(notional?.minNotional ?? 5),
  };
  if (Object.values(rules).some((v) => !Number.isFinite(v) || v <= 0)) {
    ruleCache.set(symbol, null);
    return null;
  }
  ruleCache.set(symbol, rules);
  return rules;
}
function floorToStep(value: number, step: number) {
  return Math.floor((value + step * 1e-9) / step) * step;
}
function formatStep(value: number, step: number) {
  const stepText = String(step);
  const exponent = stepText.match(/e-(\\d+)$/i);
  const decimals = exponent ? Number(exponent[1]) : Math.max(0, (stepText.split(".")[1] ?? "").replace(/0+$/, "").length);
  return value.toFixed(decimals);
}
async function shortHash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, "0")).join("").slice(0, 20);
}
async function reconcileOrderLists(db: SupabaseClient, userId: string, apiKey: string, apiSecret: string) {
  const { data: rows, error } = await db.from("binance_spot_orders")
    .select("id,symbol,broker_order_list_id,status")
    .eq("user_id", userId)
    .in("status", ["submitted", "partially_filled", "filled"]);
  if (error) throw error;
  for (const row of rows ?? []) {
    if (!row.broker_order_list_id) continue;
    try {
      const list = await signedBinance(apiKey, apiSecret, "/api/v3/orderList", "GET", {
        orderListId: String(row.broker_order_list_id),
      });
      if (list.listOrderStatus === "ALL_DONE" || list.listStatusType === "ALL_DONE") {
        await db.from("binance_spot_orders").update({
          status: "closed", completed_at: new Date().toISOString(),
          result_payload: list, updated_at: new Date().toISOString(),
        }).eq("id", row.id).eq("user_id", userId);
      }
    } catch {
      // Keep the last known state if an exchange status check is temporarily unavailable.
    }
  }
}

export async function submitBinanceSpotLimitIntents(
  db: SupabaseClient,
  symbol: string,
  intents: SpotIntent[],
): Promise<{ submitted: number; skipped: number; failed: number }> {
  const { data: accounts, error: accountsError } = await db.from("binance_spot_settings")
    .select("user_id,max_trade_usdt,max_open_positions,allowed_symbols")
    .eq("connection_status", "connected")
    .eq("auto_trade_enabled", true)
    .eq("live_execution_enabled", true)
    .eq("emergency_stop", false);
  if (accountsError) throw accountsError;
  let submitted = 0, skipped = 0, failed = 0;
  const buyIntents = intents.filter((intent) => intent.direction === "BUY" && intent.orderType === "BUY_LIMIT" &&
    intent.entry > 0 && intent.stopLoss > 0 && intent.takeProfit > intent.entry && intent.entry < intent.currentPrice &&
    intent.stopLoss < intent.entry);
  if (!buyIntents.length) return { submitted, skipped: intents.length, failed };

  const rules = await getRules(symbol);
  if (!rules) return { submitted, skipped: buyIntents.length, failed };
  const priceTick = rules.tickSize;
  const limit = buyIntents.length;

  for (const account of (accounts ?? []) as AccountSettings[]) {
    const allowed = account.allowed_symbols ?? [];
    if (allowed.length > 0 && !allowed.includes(symbol)) { skipped += buyIntents.length; continue; }

    const { data: stored, error: credentialError } = await db.from("binance_spot_credentials")
      .select("encrypted_api_key,encrypted_api_secret").eq("user_id", account.user_id).maybeSingle();
    if (credentialError || !stored) { failed += 1; continue; }

    let apiKey: string, apiSecret: string;
    try {
      [apiKey, apiSecret] = await Promise.all([decrypt(stored.encrypted_api_key), decrypt(stored.encrypted_api_secret)]);
      await reconcileOrderLists(db, account.user_id, apiKey, apiSecret);
      const { data: existing, error: existingError } = await db.from("binance_spot_orders")
        .select("id").eq("user_id", account.user_id)
        .in("status", ["queued", "submitted", "partially_filled", "filled", "uncertain"]);
      if (existingError) { failed += 1; continue; }
      if ((existing?.length ?? 0) >= account.max_open_positions) { skipped += buyIntents.length; continue; }
      const accountInfo = await signedBinance(apiKey, apiSecret, "/api/v3/account", "GET", {});
      const usdt = Array.isArray(accountInfo.balances)
        ? (accountInfo.balances as Array<Record<string, unknown>>).find((b) => b.asset === "USDT")
        : null;
      let availableUsdt = Number(usdt?.free ?? 0);
      if (!Number.isFinite(availableUsdt) || availableUsdt <= 0) { skipped += buyIntents.length; continue; }

      const budget = Math.min(Number(account.max_trade_usdt), availableUsdt);
      const perOrderBudget = budget / limit;
      for (let index = 0; index < buyIntents.length; index += 1) {
        const intent = buyIntents[index];
        const entryPrice = floorToStep(intent.entry, priceTick);
        const takeProfit = floorToStep(intent.takeProfit, priceTick);
        const stopLoss = floorToStep(intent.stopLoss, priceTick);
        const current = intent.currentPrice;
        if (!(takeProfit > current && current > stopLoss && entryPrice < current)) { skipped += 1; continue; }
        const quantity = floorToStep(perOrderBudget / entryPrice, rules.stepSize);
        const notional = quantity * entryPrice;
        if (quantity < rules.minQty || quantity > rules.maxQty || notional < rules.minNotional || notional > availableUsdt) {
          skipped += 1;
          continue;
        }
        const idempotencyKey = account.user_id + "|" + intent.idempotencyKey;
        const hash = await shortHash(idempotencyKey);
        const listClientOrderId = "stai_l_" + hash;
        const workingClientOrderId = "stai_w_" + hash;
        const { data: inserted, error: insertError } = await db.from("binance_spot_orders").insert({
          user_id: account.user_id, symbol, side: "BUY", order_kind: "OTOCO",
          entry_price: entryPrice, quantity, stop_loss: stopLoss, take_profit: takeProfit,
          signal_key: symbol + "|M15|" + intent.signalEpoch + "|BUY",
          idempotency_key: idempotencyKey, client_order_id: workingClientOrderId,
          status: "queued",
          request_payload: { quote_budget_usdt: perOrderBudget, strategy: "M15-M5-M1-LIMIT-OTOCO" },
        }).select("id").single();
        if (insertError) {
          if (insertError.code === "23505") { skipped += 1; continue; }
          failed += 1; continue;
        }
        try {
          const response = await signedBinance(apiKey, apiSecret, "/api/v3/orderList/otoco", "POST", {
            symbol,
            workingType: "LIMIT",
            workingSide: "BUY",
            workingPrice: formatStep(entryPrice, priceTick),
            workingQuantity: formatStep(quantity, rules.stepSize),
            workingTimeInForce: "GTC",
            workingClientOrderId,
            pendingSide: "SELL",
            pendingQuantity: formatStep(quantity, rules.stepSize),
            pendingAboveType: "TAKE_PROFIT",
            pendingAboveStopPrice: formatStep(takeProfit, priceTick),
            pendingBelowType: "STOP_LOSS",
            pendingBelowStopPrice: formatStep(stopLoss, priceTick),
            listClientOrderId,
          });
          const listId = response.orderListId == null ? null : String(response.orderListId);
          const orderId = Array.isArray(response.orders) && response.orders.length
            ? String((response.orders[0] as Record<string, unknown>).orderId ?? "") : null;
          await db.from("binance_spot_orders").update({
            status: "submitted", broker_order_id: orderId, broker_order_list_id: listId,
            result_payload: response, updated_at: new Date().toISOString(),
          }).eq("id", inserted.id).eq("user_id", account.user_id);
          availableUsdt -= notional;
          submitted += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : "binance_order_error";
          const uncertain = message === "binance_network_outcome_uncertain";
          await db.from("binance_spot_orders").update({
            status: uncertain ? "uncertain" : "rejected",
            last_error_code: message.slice(0, 120), updated_at: new Date().toISOString(),
          }).eq("id", inserted.id).eq("user_id", account.user_id);
          if (uncertain) {
            // Never blindly retry an order whose exchange acknowledgement was lost.
            failed += 1;
            break;
          }
          failed += 1;
        }
      }
    } catch {
      failed += 1;
    }
  }
  return { submitted, skipped, failed };
}
