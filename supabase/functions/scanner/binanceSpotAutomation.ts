import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { exchangeGatewayFetch } from "../_shared/exchange-gateway.ts";
import { assertExecutionIntent, executionIdempotencyKey } from "./execution-contract.ts";

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
  risk_percent: number;
  max_open_positions: number;
  allowed_symbols: string[] | null;
};
type SymbolRules = { baseAsset: string; quoteAsset: string; tickSize: number; stepSize: number; minQty: number; maxQty: number; minNotional: number };
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
async function signRequest(secret: string, value: string) {
  if (secret.includes("-----BEGIN PRIVATE KEY-----")) {
    const pem = secret.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
    const der = b64decode(pem);
    const key = await crypto.subtle.importKey("pkcs8", der, { name: "Ed25519" }, false, ["sign"]);
    const signature = await crypto.subtle.sign("Ed25519", key, encoder.encode(value));
    return btoa(String.fromCharCode(...new Uint8Array(signature)));
  }
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return [...new Uint8Array(signature)].map((v) => v.toString(16).padStart(2, "0")).join("");
}
async function signedBinance(
  apiKey: string,
  apiSecret: string,
  path: string,
  method: "GET" | "POST" | "DELETE",
  values: Record<string, string>,
) {
  const params = new URLSearchParams({ ...values, recvWindow: "5000", timestamp: String(Date.now()) });
  const signature = await signRequest(apiSecret, params.toString());
  const url = BASE + path + (method !== "POST" ? "?" + params.toString() + "&signature=" + encodeURIComponent(signature) : "");
  let response: Response;
  try {
    response = await exchangeGatewayFetch("binance_spot", url, {
      method,
      headers: {
        "X-MBX-APIKEY": apiKey,
        ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      },
      ...(method === "POST" ? { body: params.toString() + "&signature=" + encodeURIComponent(signature) } : {}),
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
  if (!item || item.status !== "TRADING" || item.isSpotTradingAllowed === false || item.quoteAsset !== "USDT") {
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
    baseAsset: String(item.baseAsset ?? ""),
    quoteAsset: String(item.quoteAsset ?? ""),
    tickSize: Number(price.tickSize),
    stepSize: Number(lot.stepSize),
    minQty: Number(lot.minQty),
    maxQty: Number(lot.maxQty),
    minNotional: Number(notional?.minNotional ?? 5),
  };
  if (!rules.baseAsset || [rules.tickSize, rules.stepSize, rules.minQty, rules.maxQty, rules.minNotional].some((v) => !Number.isFinite(v) || v <= 0)) {
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
    .select("id,symbol,broker_order_list_id,status,client_order_id,expires_at,stop_loss,take_profit,request_payload")
    .eq("user_id", userId)
    .in("status", ["submitted", "partially_filled", "filled", "uncertain"]);
  if (error) throw error;
  for (const row of rows ?? []) {
    try {
      const requestPayload = row.request_payload as Record<string, unknown> | null;
      const storedListClientOrderId = typeof requestPayload?.list_client_order_id === "string"
        ? requestPayload.list_client_order_id : null;
      if (!row.broker_order_list_id && (row.status !== "uncertain" || !storedListClientOrderId)) continue;
      const list = await signedBinance(apiKey, apiSecret, "/api/v3/orderList", "GET",
        row.broker_order_list_id
          ? { orderListId: String(row.broker_order_list_id) }
          : { origClientOrderId: storedListClientOrderId! });
      const recoveredListId = list.orderListId == null ? null : String(list.orderListId);
      if (!recoveredListId) throw new Error("binance_uncertain_order_lookup_incomplete");
      const orderListId = recoveredListId;
      if (row.status === "uncertain") {
        await db.from("binance_spot_orders").update({
          status: "submitted",
          broker_order_list_id: recoveredListId,
          result_payload: list,
          last_error_code: null,
          updated_at: new Date().toISOString(),
        }).eq("id", row.id).eq("user_id", userId);
      }
      const stage = String((row.request_payload as Record<string, unknown> | null)?.stage ?? "entry_OTOCO");
      if (stage === "exit_oco") {
        if (list.listOrderStatus === "ALL_DONE" || list.listStatusType === "ALL_DONE") {
          await db.from("binance_spot_orders").update({
            status: "closed", completed_at: new Date().toISOString(),
            result_payload: list, updated_at: new Date().toISOString(),
          }).eq("id", row.id).eq("user_id", userId);
        }
        continue;
      }
      const reports = Array.isArray(list.orderReports) ? list.orderReports as Array<Record<string, unknown>> : [];
      const workingOrder = reports.find((item) => item.clientOrderId === row.client_order_id);
      const executedQty = Number(workingOrder?.executedQty ?? 0);
      const workingStatus = String(workingOrder?.status ?? "");
      if (executedQty > 0 && ["PARTIALLY_FILLED", "CANCELED", "EXPIRED"].includes(workingStatus)) {
        // OTOCO activates its exit pair only after the entry fully fills. Cancel the
        // remaining entry quantity and protect any partial fill with a separate OCO.
        if (workingStatus === "PARTIALLY_FILLED") {
          await signedBinance(apiKey, apiSecret, "/api/v3/orderList", "DELETE", {
            orderListId,
          });
        }
        const rules = await getRules(row.symbol);
        if (!rules) throw new Error("binance_symbol_rules_unavailable_for_partial_fill");
        const accountInfo = await signedBinance(apiKey, apiSecret, "/api/v3/account", "GET", {});
        const balances = Array.isArray(accountInfo.balances) ? accountInfo.balances as Array<Record<string, unknown>> : [];
        const baseBalance = balances.find((balance) => balance.asset === rules.baseAsset);
        const freeBase = Number(baseBalance?.free ?? 0);
        const quantity = floorToStep(Math.min(executedQty * 0.999, freeBase), rules.stepSize);
        if (quantity < rules.minQty || quantity * Number(row.stop_loss ?? 0) < rules.minNotional) {
          await db.from("binance_spot_orders").update({
            status: "uncertain", last_error_code: "partial_fill_below_exit_minimum",
            result_payload: list, updated_at: new Date().toISOString(),
          }).eq("id", row.id).eq("user_id", userId);
          continue;
        }
        const tickerResponse = await fetch(BASE + "/api/v3/ticker/price?symbol=" + encodeURIComponent(row.symbol));
        const ticker = await tickerResponse.json();
        const currentPrice = Number(ticker?.price);
        const stopLoss = floorToStep(Number(row.stop_loss), rules.tickSize);
        const takeProfit = floorToStep(Number(row.take_profit), rules.tickSize);
        let exitResult: Record<string, unknown>;
        let exitListId: string | null = null;
        if (!tickerResponse.ok || !Number.isFinite(currentPrice)) throw new Error("binance_current_price_unavailable");
        if (currentPrice <= stopLoss || currentPrice >= takeProfit) {
          exitResult = await signedBinance(apiKey, apiSecret, "/api/v3/order", "POST", {
            symbol: row.symbol, side: "SELL", type: "MARKET",
            quantity: formatStep(quantity, rules.stepSize),
            newClientOrderId: "stai_m_" + await shortHash(String(row.id)),
          });
        } else {
          const oco = await signedBinance(apiKey, apiSecret, "/api/v3/orderList/oco", "POST", {
            symbol: row.symbol, side: "SELL",
            quantity: formatStep(quantity, rules.stepSize),
            aboveType: "TAKE_PROFIT", aboveStopPrice: formatStep(takeProfit, rules.tickSize),
            belowType: "STOP_LOSS", belowStopPrice: formatStep(stopLoss, rules.tickSize),
            listClientOrderId: "stai_x_" + await shortHash(String(row.id)),
          });
          exitListId = oco.orderListId == null ? null : String(oco.orderListId);
          exitResult = oco;
        }
        await db.from("binance_spot_orders").update({
          status: exitListId ? "filled" : "closed",
          broker_order_list_id: exitListId,
          request_payload: { ...(row.request_payload as Record<string, unknown> ?? {}), stage: exitListId ? "exit_oco" : "closed_after_partial_fill" },
          result_payload: { entryOrderList: list, partialFillExit: exitResult },
          completed_at: exitListId ? null : new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", row.id).eq("user_id", userId);
        continue;
      }
      if (list.listOrderStatus === "ALL_DONE" || list.listStatusType === "ALL_DONE") {
        await db.from("binance_spot_orders").update({
          status: "closed", completed_at: new Date().toISOString(),
          result_payload: list, updated_at: new Date().toISOString(),
        }).eq("id", row.id).eq("user_id", userId);
        continue;
      }
      if (workingStatus === "FILLED") {
        await db.from("binance_spot_orders").update({
          status: "filled", result_payload: list, updated_at: new Date().toISOString(),
        }).eq("id", row.id).eq("user_id", userId);
      } else if (row.expires_at && Date.now() >= new Date(row.expires_at).getTime() && workingStatus === "NEW") {
        const cancelled = await signedBinance(apiKey, apiSecret, "/api/v3/orderList", "DELETE", {
          orderListId,
        });
        await db.from("binance_spot_orders").update({
          status: "expired", completed_at: new Date().toISOString(),
          result_payload: cancelled, updated_at: new Date().toISOString(),
        }).eq("id", row.id).eq("user_id", userId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "binance_order_reconciliation_failed";
      await db.from("binance_spot_orders").update({
        last_error_code: message.slice(0, 120), updated_at: new Date().toISOString(),
      }).eq("id", row.id).eq("user_id", userId);
    }
  }
}

export async function reconcileBinanceSpotOrders(db: SupabaseClient) {
  const { data: rows, error } = await db.from("binance_spot_orders")
    .select("user_id").in("status", ["submitted", "partially_filled", "filled", "uncertain"]);
  if (error) throw error;
  const userIds = [...new Set((rows ?? []).map((row) => row.user_id as string))];
  for (const userId of userIds) {
    const { data: credentials, error: credentialError } = await db.from("binance_spot_credentials")
      .select("encrypted_api_key,encrypted_api_secret").eq("user_id", userId).maybeSingle();
    if (credentialError || !credentials) continue;
    try {
      const [apiKey, apiSecret] = await Promise.all([
        decrypt(credentials.encrypted_api_key), decrypt(credentials.encrypted_api_secret),
      ]);
      await reconcileOrderLists(db, userId, apiKey, apiSecret);
    } catch {
      // Leave the last known exchange state untouched if credentials or API are unavailable.
    }
  }
}

export async function submitBinanceSpotLimitIntents(
  db: SupabaseClient,
  symbol: string,
  intents: SpotIntent[],
): Promise<{ submitted: number; skipped: number; failed: number }> {
  const { data: accounts, error: accountsError } = await db.from("binance_spot_settings")
    .select("user_id,risk_percent,max_open_positions,allowed_symbols")
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

  for (const account of (accounts ?? []) as AccountSettings[]) {
    if (Array.isArray(account.allowed_symbols) && account.allowed_symbols.length > 0 && !account.allowed_symbols.includes(symbol)) {
      skipped += buyIntents.length;
      continue;
    }
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
      const availableSlots = account.max_open_positions - (existing?.length ?? 0);
      if (availableSlots <= 0) { skipped += buyIntents.length; continue; }
      const accountInfo = await signedBinance(apiKey, apiSecret, "/api/v3/account", "GET", {});
      const usdt = Array.isArray(accountInfo.balances)
        ? (accountInfo.balances as Array<Record<string, unknown>>).find((b) => b.asset === "USDT")
        : null;
      let availableUsdt = Number(usdt?.free ?? 0);
      if (!Number.isFinite(availableUsdt) || availableUsdt <= 0) { skipped += buyIntents.length; continue; }

      const accountUsdtBalance = Number(usdt?.free ?? 0) + Number(usdt?.locked ?? 0);
      const riskPercent = Number(account.risk_percent);
      if (!Number.isFinite(accountUsdtBalance) || accountUsdtBalance <= 0 ||
          !Number.isFinite(riskPercent) || riskPercent <= 0 || riskPercent > 5) {
        skipped += buyIntents.length;
        continue;
      }
      // Position quantity is derived from the configured risk percentage and entry-to-stop distance,
      // then capped by free USDT so the order never spends funds that are not available.
      const totalRiskBudget = accountUsdtBalance * (riskPercent / 100);
      const selectedIntents = buyIntents.slice(0, Math.min(buyIntents.length, availableSlots));
      if (!selectedIntents.length || totalRiskBudget <= 0) { skipped += buyIntents.length; continue; }
      const perOrderRiskBudget = totalRiskBudget;
      for (let index = 0; index < selectedIntents.length; index += 1) {
        const intent = selectedIntents[index];
        const entryPrice = floorToStep(intent.entry, priceTick);
        const takeProfit = floorToStep(intent.takeProfit, priceTick);
        const stopLoss = floorToStep(intent.stopLoss, priceTick);
        const current = intent.currentPrice;
        if (!(takeProfit > current && current > stopLoss && entryPrice < current)) { skipped += 1; continue; }
        const riskDistance = entryPrice - stopLoss;
        if (!Number.isFinite(riskDistance) || riskDistance <= 0 || availableUsdt <= 0) { skipped += 1; continue; }
        const riskSizedQuantity = perOrderRiskBudget / riskDistance;
        const affordableQuantity = (availableUsdt * 0.995) / entryPrice;
        const quantity = floorToStep(Math.min(riskSizedQuantity, affordableQuantity, rules.maxQty), rules.stepSize);
        const notional = quantity * entryPrice;
        if (quantity < rules.minQty || notional < rules.minNotional || notional > availableUsdt) {
          skipped += 1;
          continue;
        }
        const plannedRiskUsdt = quantity * riskDistance;
        const idempotencyKey = account.user_id + "|" + intent.idempotencyKey;
        const hash = await shortHash(idempotencyKey);
        const listClientOrderId = "stai_l_" + hash;
        const workingClientOrderId = "stai_w_" + hash;
        const { data: inserted, error: insertError } = await db.from("binance_spot_orders").insert({
          user_id: account.user_id, symbol, side: "BUY", order_kind: "OTOCO",
          entry_price: entryPrice, quantity, stop_loss: stopLoss, take_profit: takeProfit,
          expires_at: new Date((intent.signalEpoch + 8 * 900) * 1000).toISOString(),
          signal_key: symbol + "|M15|" + intent.signalEpoch + "|BUY",
          idempotency_key: idempotencyKey, client_order_id: workingClientOrderId,
          status: "queued",
          request_payload: {
            risk_percent: riskPercent,
            account_usdt_balance: accountUsdtBalance,
            planned_risk_usdt: plannedRiskUsdt,
            quote_notional_usdt: notional,
            list_client_order_id: listClientOrderId,
            working_client_order_id: workingClientOrderId,
            strategy: "M15-M5-M1-LIMIT-OTOCO",
          },
        }).select("id").single();
        if (insertError) {
          if (insertError.code === "23505") { skipped += 1; continue; }
          failed += 1; continue;
        }
        try {
          const executionCreatedAt = new Date();
          const expiresAt = new Date((intent.signalEpoch + 8 * 900) * 1000);
          assertExecutionIntent({
            schemaVersion: 1,
            intentId: inserted.id,
            idempotencyKey: executionIdempotencyKey("binance_spot", "binance_spot:" + account.user_id, inserted.id),
            userId: account.user_id,
            provider: "binance_spot",
            connectionId: "binance_spot:" + account.user_id,
            providerAccountId: account.user_id,
            environment: "live",
            strategyId: "spot_m15_limit_otoco",
            strategyVersion: "spot-otoco-v1",
            signalId: symbol + "|M15|" + intent.signalEpoch + "|BUY",
            signalCreatedAt: new Date(intent.signalEpoch * 1000).toISOString(),
            expiresAt: expiresAt.toISOString(),
            order: {
              instrument: symbol,
              side: "buy",
              kind: "limit",
              entryPrice,
              quantity,
              limitPrice: entryPrice,
              stopLoss,
              takeProfit,
            },
            risk: {
              maxLossAmount: plannedRiskUsdt,
              maxLossCurrency: "USDT",
              riskPercent,
              maxOpenPositions: Number(account.max_open_positions),
            },
            authorization: {
              liveExecutionAuthorized: true,
              emergencyStop: false,
              preflightVerifiedAt: executionCreatedAt.toISOString(),
            },
            createdAt: executionCreatedAt.toISOString(),
          });
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
