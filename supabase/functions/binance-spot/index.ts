import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const enc = new TextEncoder();
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
async function cryptoKey() {
  const secret = Deno.env.get("BINANCE_CREDENTIALS_ENCRYPTION_KEY");
  if (!secret || secret.length < 32) throw new Error("binance_encryption_key_not_configured");
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function encryptSecret(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await cryptoKey(), enc.encode(value));
  return b64(new Uint8Array([...iv, ...new Uint8Array(encrypted)]));
}
async function decryptSecret(value: string) {
  const packed = unb64(value);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: packed.slice(0, 12) }, await cryptoKey(), packed.slice(12));
  return new TextDecoder().decode(plain);
}
async function sign(secret: string, query: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(query));
  return [...new Uint8Array(signature)].map((v) => v.toString(16).padStart(2, "0")).join("");
}
async function binanceAccount(apiKey: string, apiSecret: string) {
  const params = new URLSearchParams({ timestamp: String(Date.now()), recvWindow: "5000" });
  const signature = await sign(apiSecret, params.toString());
  const response = await fetch("https://api.binance.com/api/v3/account?" + params.toString() + "&signature=" + signature, { headers: { "X-MBX-APIKEY": apiKey } });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data?.msg === "string" ? data.msg : "binance_account_check_failed");
  if (data?.canTrade !== true) throw new Error("binance_spot_trading_permission_not_enabled");
  if (data?.canWithdraw === true) throw new Error("disable_withdrawal_permission_on_binance_api_key");
  const balances = Array.isArray(data?.balances) ? data.balances.filter((item: Record<string, unknown>) => Number(item.free ?? 0) + Number(item.locked ?? 0) > 0).slice(0, 20).map((item: Record<string, unknown>) => ({ asset: String(item.asset ?? ""), free: Number(item.free ?? 0), locked: Number(item.locked ?? 0) })) : [];
  return { canTrade: true, canWithdraw: false, accountType: String(data.accountType ?? "SPOT"), balances };
}
async function getCredentials(admin: ReturnType<typeof createClient>, userId: string) {
  const { data, error } = await admin.from("binance_spot_credentials").select("encrypted_api_key,encrypted_api_secret").eq("user_id", userId).maybeSingle();
  if (error || !data) throw new Error("binance_account_not_connected");
  return { apiKey: await decryptSecret(data.encrypted_api_key), apiSecret: await decryptSecret(data.encrypted_api_secret) };
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const authorization = req.headers.get("Authorization") ?? "";
    const token = authorization.replace(/^Bearer\s+/i, "");
    if (!token || token === authorization) return json({ error: "authentication_required" }, 401);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!anonKey || !serviceKey) throw new Error("supabase_function_secrets_missing");
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "invalid_session" }, 401);
    const userId = authData.user.id;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const body = await req.json();
    const action = String(body?.action ?? "");
    if (action === "connect") {
      const apiKey = String(body.apiKey ?? "").trim(), apiSecret = String(body.apiSecret ?? "").trim();
      if (apiKey.length < 16 || apiKey.length > 256 || apiSecret.length < 16 || apiSecret.length > 256) return json({ error: "invalid_binance_api_credentials" }, 400);
      const account = await binanceAccount(apiKey, apiSecret);
      const [encryptedApiKey, encryptedApiSecret] = await Promise.all([encryptSecret(apiKey), encryptSecret(apiSecret)]);
      const last4 = apiKey.slice(-4);
      const { error: credentialError } = await admin.from("binance_spot_credentials").upsert({ user_id: userId, encrypted_api_key: encryptedApiKey, encrypted_api_secret: encryptedApiSecret, api_key_last4: last4, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (credentialError) throw credentialError;
      const { error: settingsError } = await admin.from("binance_spot_settings").upsert({ user_id: userId, connection_status: "connected", api_key_last4: last4, account_label: "Binance Spot", last_checked_at: new Date().toISOString(), last_error_code: null, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (settingsError) throw settingsError;
      return json({ ok: true, connectionStatus: "connected", apiKeyLast4: last4, account });
    }
    if (action === "status") {
      const [{ data: settings, error: settingsError }, { data: orders, error: ordersError }, { data: positions, error: positionsError }] = await Promise.all([
        admin.from("binance_spot_settings").select("connection_status,auto_trade_enabled,live_execution_enabled,emergency_stop,quote_asset,max_trade_usdt,max_open_positions,allowed_symbols,api_key_last4,account_label,last_checked_at,last_error_code").eq("user_id", userId).maybeSingle(),
        admin.from("binance_spot_orders").select("id,symbol,side,order_kind,entry_price,quantity,stop_loss,take_profit,status,broker_order_id,broker_order_list_id,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(30),
        admin.from("binance_spot_positions").select("id,symbol,base_asset,quantity,entry_price,stop_loss,take_profit,status,opened_at,closed_at").eq("user_id", userId).order("opened_at", { ascending: false }).limit(30)
      ]);
      if (settingsError) throw settingsError;
      if (ordersError) throw ordersError;
      if (positionsError) throw positionsError;
      return json({ ok: true, settings, orders: orders ?? [], positions: positions ?? [] });
    }
    if (action === "test_connection") {
      const { apiKey, apiSecret } = await getCredentials(admin, userId);
      const account = await binanceAccount(apiKey, apiSecret);
      await admin.from("binance_spot_settings").update({ connection_status: "connected", last_checked_at: new Date().toISOString(), last_error_code: null }).eq("user_id", userId);
      return json({ ok: true, account });
    }
    if (action === "settings") {
      const { data: current, error: currentError } = await admin.from("binance_spot_settings").select("connection_status").eq("user_id", userId).maybeSingle();
      if (currentError) throw currentError;
      if (!current || current.connection_status !== "connected") return json({ error: "connect_binance_account_first" }, 409);
      const maxTrade = Number(body.maxTradeUsdt), maxOpen = Number(body.maxOpenPositions);
      const symbols = Array.isArray(body.allowedSymbols) ? [...new Set(body.allowedSymbols.map((v: unknown) => String(v).toUpperCase()).filter((v: string) => /^[A-Z0-9]{4,20}$/.test(v)))].slice(0, 100) : [];
      if (!Number.isFinite(maxTrade) || maxTrade < 5 || maxTrade > 100000 || !Number.isInteger(maxOpen) || maxOpen < 1 || maxOpen > 20) return json({ error: "invalid_spot_risk_limits" }, 400);
      const emergency = body.emergencyStop !== false;
      if (body.autoTradeEnabled === true && body.liveExecutionEnabled === true && !emergency && symbols.length === 0) {
        return json({ error: "select_at_least_one_binance_spot_symbol" }, 400);
      }
      const { error } = await admin.from("binance_spot_settings").update({
        auto_trade_enabled: body.autoTradeEnabled === true && !emergency,
        live_execution_enabled: body.liveExecutionEnabled === true && !emergency,
        emergency_stop: emergency, max_trade_usdt: maxTrade, max_open_positions: maxOpen,
        allowed_symbols: symbols, updated_at: new Date().toISOString()
      }).eq("user_id", userId);
      if (error) throw error;
      return json({ ok: true, message: "Binance Spot settings saved." });
    }
    if (action === "disconnect") {
      await admin.from("binance_spot_credentials").delete().eq("user_id", userId);
      const { error } = await admin.from("binance_spot_settings").update({ connection_status: "not_connected", auto_trade_enabled: false, live_execution_enabled: false, emergency_stop: true, api_key_last4: null, account_label: null, updated_at: new Date().toISOString() }).eq("user_id", userId);
      if (error) throw error;
      return json({ ok: true, message: "Binance account disconnected. Automation disabled." });
    }
    return json({ error: "unsupported_action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "binance_spot_error";
    return json({ error: message.slice(0, 180) }, 400);
  }
});
