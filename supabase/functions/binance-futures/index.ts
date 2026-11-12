import { createClient } from "npm:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const enc = new TextEncoder();
const b64 = (v: Uint8Array) => btoa(String.fromCharCode(...v));
const unb64 = (v: string) => Uint8Array.from(atob(v), c => c.charCodeAt(0));
type FuturesAsset = { asset?: string; walletBalance?: string | number; availableBalance?: string | number; marginBalance?: string | number };
type FuturesPosition = { symbol?: string; positionSide?: string; positionAmt?: string | number; entryPrice?: string | number; markPrice?: string | number; unRealizedProfit?: string | number; leverage?: string | number };

async function key() {
  const secret = Deno.env.get("BINANCE_CREDENTIALS_ENCRYPTION_KEY");
  if (!secret || secret.length < 32) throw new Error("binance_encryption_key_not_configured");
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function encrypt(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), enc.encode(value));
  return b64(new Uint8Array([...iv, ...new Uint8Array(data)]));
}
async function decrypt(value: string) {
  const packed = unb64(value);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: packed.slice(0,12) }, await key(), packed.slice(12));
  return new TextDecoder().decode(plain);
}
async function signature(secret: string, query: string, keyType: string = "hmac") {
  if (keyType === "rsa") {
    const pem = secret.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
    if (!pem || !secret.includes("BEGIN PRIVATE KEY")) throw new Error("rsa_private_key_must_be_pkcs8_pem");
    const der = Uint8Array.from(atob(pem), ch => ch.charCodeAt(0));
    const privateKey = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
    const signed = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, enc.encode(query));
    return btoa(String.fromCharCode(...new Uint8Array(signed)));
  }
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(query));
  return [...new Uint8Array(sig)].map(v => v.toString(16).padStart(2,"0")).join("");
}
async function futuresAccount(apiKey: string, apiSecret: string, keyType = "hmac") {
  const params = new URLSearchParams({ timestamp: String(Date.now()), recvWindow: "5000" });
  const sig = await signature(apiSecret, params.toString(), keyType);
  const response = await fetch("https://fapi.binance.com/fapi/v2/account?" + params + "&signature=" + encodeURIComponent(sig), { headers: { "X-MBX-APIKEY": apiKey } });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data?.msg === "string" ? data.msg : "binance_futures_account_check_failed");
  if (data?.canTrade !== true) throw new Error("binance_usdt_m_futures_trading_permission_not_enabled");
  const assets = Array.isArray(data.assets) ? (data.assets as FuturesAsset[]).filter((a) => a.asset === "USDT").map((a) => ({ asset: a.asset, walletBalance: Number(a.walletBalance ?? 0), availableBalance: Number(a.availableBalance ?? 0), marginBalance: Number(a.marginBalance ?? 0) })) : [];
  const positions = Array.isArray(data.positions) ? (data.positions as FuturesPosition[]).filter((p) => Number(p.positionAmt ?? 0) !== 0).length : 0;
  return { canTrade: true, accountType: "USDT-M Futures", assets, openPositions: positions };
}
async function signedGet(apiKey: string, apiSecret: string, path: string, keyType = "hmac", extra: Record<string, string> = {}) {
  const params = new URLSearchParams({ ...extra, timestamp: String(Date.now()), recvWindow: "5000" });
  const sig = await signature(apiSecret, params.toString(), keyType);
  const response = await fetch("https://fapi.binance.com" + path + "?" + params + "&signature=" + encodeURIComponent(sig), { headers: { "X-MBX-APIKEY": apiKey } });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data?.msg === "string" ? data.msg : "binance_futures_preflight_failed");
  return data;
}
async function futuresPreflight(apiKey: string, apiSecret: string, keyType = "hmac") {
  const [account, mode, positions, openOrders] = await Promise.all([
    futuresAccount(apiKey, apiSecret, keyType),
    signedGet(apiKey, apiSecret, "/fapi/v1/positionSide/dual", keyType),
    signedGet(apiKey, apiSecret, "/fapi/v3/positionRisk", keyType),
    signedGet(apiKey, apiSecret, "/fapi/v1/openOrders", keyType),
  ]);
  const hedgeMode = mode?.dualSidePosition === true;
  const activePositions = Array.isArray(positions) ? (positions as FuturesPosition[]).filter((p) => Math.abs(Number(p.positionAmt ?? 0)) > 0).map((p) => ({
    symbol: p.symbol, positionSide: p.positionSide, positionAmt: Number(p.positionAmt),
    entryPrice: Number(p.entryPrice), markPrice: Number(p.markPrice), unrealizedProfit: Number(p.unRealizedProfit ?? 0), leverage: Number(p.leverage)
  })) : [];
  return {
    ...account,
    hedgeMode,
    executionModeSupported: !hedgeMode,
    activePositions,
    openStandardOrders: Array.isArray(openOrders) ? openOrders.length : 0,
    safeToContinueSetup: !hedgeMode,
    note: hedgeMode ? "Your Binance account is in Hedge Mode. The first executor release supports One-way Mode only; switch to One-way Mode in Binance after closing positions and orders, then test again." : "Account permissions and position mode checked. No trade was placed."
  };
}
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const authorization = req.headers.get("Authorization") ?? "";
    const token = authorization.replace(/^Bearer\s+/i, "");
    if (!token || token === authorization) return json({ error: "authentication_required" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!anon || !service) throw new Error("supabase_function_secrets_missing");
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
    const { data: auth, error: authError } = await userClient.auth.getUser(token);
    if (authError || !auth.user) return json({ error: "invalid_session" }, 401);
    const userId = auth.user.id;
    const admin = createClient(url, service, { auth: { persistSession: false } });
    const body = await req.json();
    const action = String(body?.action ?? "");

    if (action === "connect") {
      const apiKey = String(body.apiKey ?? "").trim();
      const apiSecret = String(body.apiSecret ?? "").trim();
      const keyType = String(body.keyType ?? "hmac").toLowerCase();
      if (keyType !== "hmac" && keyType !== "rsa") return json({ error: "unsupported_binance_key_type" }, 400);
      if (apiKey.length < 16 || apiKey.length > 256 || apiSecret.length < 16 || apiSecret.length > 8192) return json({ error: "invalid_binance_api_credentials" }, 400);
      if (keyType === "rsa" && !apiSecret.includes("BEGIN PRIVATE KEY")) return json({ error: "rsa_private_key_must_be_pkcs8_pem" }, 400);
      const account = await futuresPreflight(apiKey, apiSecret, keyType);
      const [encryptedApiKey, encryptedApiSecret] = await Promise.all([encrypt(apiKey), encrypt(apiSecret)]);
      const last4 = apiKey.slice(-4);
      const { error } = await admin.from("binance_futures_credentials").upsert({ user_id: userId, encrypted_api_key: encryptedApiKey, encrypted_api_secret: encryptedApiSecret, key_type: keyType, api_key_last4: last4, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (error) throw error;
      const { error: settingsError } = await admin.from("binance_futures_settings").upsert({ user_id: userId, connection_status: "connected", api_key_last4: last4, account_label: "Binance USDT-M Futures", last_checked_at: new Date().toISOString(), last_error_code: null, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (settingsError) throw settingsError;
      return json({ ok: true, connectionStatus: "connected", apiKeyLast4: last4, account });
    }

    if (action === "status") {
      const [{ data: settings, error: se }, { data: orders, error: oe }, { data: positions, error: pe }] = await Promise.all([
        admin.from("binance_futures_settings").select("connection_status,auto_trade_enabled,live_execution_enabled,emergency_stop,leverage,risk_percent,max_daily_loss_pct,max_open_positions,allowed_symbols,api_key_last4,account_label,last_checked_at,last_error_code").eq("user_id", userId).maybeSingle(),
        admin.from("binance_futures_orders").select("id,symbol,side,leverage,quantity,entry_price,stop_loss,take_profit,status,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(25),
        admin.from("binance_futures_positions").select("id,symbol,side,quantity,entry_price,mark_price,leverage,unrealized_pnl,stop_loss,take_profit,status,opened_at").eq("user_id", userId).order("opened_at", { ascending: false }).limit(25),
      ]);
      if (se) throw se; if (oe) throw oe; if (pe) throw pe;
      const { data: signalIntents, error: ie } = await admin.from("binance_futures_signal_intents").select("id,signal_key,symbol,side,timeframe_agreement,signal_epoch,entry_price,stop_loss,take_profit,status,payload,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(25);
      if (ie) throw ie;
      return json({ ok: true, settings, orders: orders ?? [], positions: positions ?? [], signalIntents: signalIntents ?? [] });
    }

    if (action === "test_connection") {
      const { data: stored, error } = await admin.from("binance_futures_credentials").select("encrypted_api_key,encrypted_api_secret,key_type").eq("user_id", userId).maybeSingle();
      if (error || !stored) throw new Error("binance_futures_account_not_connected");
      const [apiKey, apiSecret] = await Promise.all([decrypt(stored.encrypted_api_key), decrypt(stored.encrypted_api_secret)]);
      const account = await futuresPreflight(apiKey, apiSecret, stored.key_type ?? "hmac");
      await admin.from("binance_futures_settings").update({ connection_status: "connected", last_checked_at: new Date().toISOString(), last_error_code: null }).eq("user_id", userId);
      return json({ ok: true, account });
    }

    if (action === "settings") {
      const { data: current, error: currentError } = await admin.from("binance_futures_settings").select("connection_status").eq("user_id", userId).maybeSingle();
      if (currentError) throw currentError;
      if (!current || current.connection_status !== "connected") return json({ error: "connect_binance_futures_first" }, 409);
      const leverage = Number(body.leverage);
      const risk = Number(body.riskPercent);
      const dailyLoss = Number(body.maxDailyLossPct);
      const maxOpen = Number(body.maxOpenPositions);
      const symbols = Array.isArray(body.allowedSymbols) ? [...new Set(body.allowedSymbols.map((v: unknown) => String(v).toUpperCase()).filter((v: string) => /^[A-Z0-9]{4,20}$/.test(v)))] : [];
      if (!Number.isInteger(leverage) || leverage < 1 || leverage > 20 || !Number.isFinite(risk) || risk <= 0 || risk > 2 || !Number.isFinite(dailyLoss) || dailyLoss <= 0 || dailyLoss > 5 || !Number.isInteger(maxOpen) || maxOpen < 1 || maxOpen > 10) return json({ error: "invalid_futures_risk_settings" }, 400);
      const emergency = body.emergencyStop !== false;
      // An empty allowed_symbols list means accept every eligible symbol supplied by Super Signals; the executor validates each against Binance exchangeInfo.
      const { error } = await admin.from("binance_futures_settings").update({
        leverage, risk_percent: risk, max_daily_loss_pct: dailyLoss, max_open_positions: maxOpen, allowed_symbols: symbols,
        emergency_stop: emergency, auto_trade_enabled: body.autoTradeEnabled === true && !emergency,
        live_execution_enabled: body.liveExecutionEnabled === true && !emergency, updated_at: new Date().toISOString()
      }).eq("user_id", userId);
      if (error) throw error;
      return json({ ok: true, message: "Binance Futures settings saved. Execution remains subject to the server-side 8/8 Super Signal gate." });
    }

    if (action === "disconnect") {
      await admin.from("binance_futures_credentials").delete().eq("user_id", userId);
      const { error } = await admin.from("binance_futures_settings").update({ connection_status: "not_connected", auto_trade_enabled: false, live_execution_enabled: false, emergency_stop: true, api_key_last4: null, account_label: null, updated_at: new Date().toISOString() }).eq("user_id", userId);
      if (error) throw error;
      return json({ ok: true, message: "Binance Futures disconnected. Automation disabled." });
    }
    return json({ error: "unsupported_action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "binance_futures_error";
    console.error("[binance-futures] request failed", { message, name: error instanceof Error ? error.name : "unknown" });
    const rejected = /invalid api-key, ip, or permissions/i.test(message);
    const userMessage = rejected
      ? "Binance rejected this API key. Verify the API key and secret, confirm USDⓈ-M Futures permission is enabled, and check whether the key is restricted to trusted IPs. For cloud execution without a fixed IP allowlist, use a self-generated RSA key supported by USDⓈ-M Futures. Keep withdrawals disabled."
      : message.slice(0, 180);
    return json({ ok: false, code: rejected ? "binance_api_key_ip_or_permission_rejected" : "binance_futures_error", error: userMessage, message: userMessage }, 400);
  }
});