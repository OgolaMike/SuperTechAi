export interface Env {
  APPWRITE_ENDPOINT: string;
  APPWRITE_PROJECT_ID: string;
  APPWRITE_DATABASE_ID: string;
  MEMBER_PROFILES_TABLE_ID: string;
  SIGNAL_RECORDS_TABLE_ID?: string;
  ALERT_PREFERENCES_TABLE_ID?: string;
  ALLOWED_ORIGIN: string;
  APPWRITE_API_KEY?: string;
}

type AppwriteAccount = {
  $id: string;
  email: string;
  name?: string;
  emailVerification: boolean;
  status: boolean;
};

type ProfileRow = {
  $id: string;
  user_id: string;
  display_name?: string | null;
  onboarding_status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });

function withCors(response: Response, cors: HeadersInit): Response {
  const headers = new Headers(response.headers);
  new Headers(cors).forEach((value, key) => headers.set(key, value));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function corsHeaders(origin: string, allowedOrigin: string): HeadersInit {
  if (!origin || origin !== allowedOrigin) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-max-age": "600",
    "vary": "Origin",
  };
}

async function authenticate(request: Request, env: Env): Promise<AppwriteAccount | null> {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const endpoint = env.APPWRITE_ENDPOINT.replace(/\/$/, "");
  const response = await fetch(`${endpoint}/account`, {
    method: "GET",
    headers: {
      "X-Appwrite-Project": env.APPWRITE_PROJECT_ID,
      "X-Appwrite-JWT": match[1],
    },
  });
  if (!response.ok) return null;

  const account = await response.json() as AppwriteAccount;
  if (!account?.$id || !account.emailVerification || !account.status) return null;
  return account;
}

function databaseReady(env: Env): boolean {
  return Boolean(env.APPWRITE_API_KEY && env.APPWRITE_DATABASE_ID && env.MEMBER_PROFILES_TABLE_ID);
}

async function profileRequest(
  env: Env,
  account: AppwriteAccount,
  method: "GET" | "POST" | "PATCH",
  data?: Record<string, unknown>,
): Promise<Response> {
  if (!databaseReady(env)) return json({ error: "member_data_not_configured" }, 503);

  const endpoint = env.APPWRITE_ENDPOINT.replace(/\/$/, "");
  const base = `${endpoint}/tablesdb/${env.APPWRITE_DATABASE_ID}/tables/${env.MEMBER_PROFILES_TABLE_ID}/rows`;
  const headers = {
    "X-Appwrite-Project": env.APPWRITE_PROJECT_ID,
    "X-Appwrite-Key": env.APPWRITE_API_KEY!,
    "Content-Type": "application/json",
  };
  const rowId = account.$id;

  if (method === "GET") {
    const response = await fetch(`${base}/${encodeURIComponent(rowId)}`, { headers });
    if (response.status === 404) {
      const now = new Date().toISOString();
      const create = await fetch(base, {
        method: "POST",
        headers,
        body: JSON.stringify({
          rowId,
          data: {
            user_id: account.$id,
            display_name: account.name || "",
            onboarding_status: "not_started",
            created_at: now,
            updated_at: now,
          },
          permissions: [`read("user:${account.$id}")`, `update("user:${account.$id}")`],
        }),
      });
      if (!create.ok) return json({ error: "profile_initialization_failed" }, 503);
      const created = await create.json() as ProfileRow;
      return json({
        id: created.$id,
        displayName: created.display_name || "",
        onboardingStatus: created.onboarding_status || "not_started",
      });
    }
    if (!response.ok) return json({ error: "profile_read_failed" }, 503);
    const row = await response.json() as ProfileRow;
    if (row.user_id !== account.$id) return json({ error: "profile_ownership_mismatch" }, 403);
    return json({
      id: row.$id,
      displayName: row.display_name || "",
      onboardingStatus: row.onboarding_status || "not_started",
    });
  }

  if (method === "PATCH") {
    const response = await fetch(`${base}/${encodeURIComponent(rowId)}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        data: { ...data, updated_at: new Date().toISOString() },
        permissions: [`read("user:${account.$id}")`, `update("user:${account.$id}")`],
      }),
    });
    if (!response.ok) return json({ error: "profile_update_failed" }, 503);
    const row = await response.json() as ProfileRow;
    if (row.user_id !== account.$id) return json({ error: "profile_ownership_mismatch" }, 403);
    return json({
      id: row.$id,
      displayName: row.display_name || "",
      onboardingStatus: row.onboarding_status || "not_started",
    });
  }

  return json({ error: "method_not_allowed" }, 405);
}


type BrokerEnv = Env & {
  CTRADER_OAUTH_STATES_TABLE_ID?: string;
  CTRADER_GRANTS_TABLE_ID?: string;
  CTRADER_CLIENT_ID?: string;
  CTRADER_CLIENT_SECRET?: string;
  CTRADER_REDIRECT_URI?: string;
  BROKER_TOKEN_ENCRYPTION_KEY?: string;
};

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (value: string) => Uint8Array.from(atob(value), (ch) => ch.charCodeAt(0));
const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};
async function decryptBrokerToken(value: string, keyText: string): Promise<string> {
  const [version, ivText, cipherText] = value.split(".");
  if (version !== "v1" || !ivText || !cipherText) throw new Error("invalid_encrypted_broker_token");
  const raw = fromB64(keyText);
  if (raw.length !== 32) throw new Error("broker_encryption_key_must_be_32_bytes_base64");
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(ivText) }, key, fromB64(cipherText));
  return new TextDecoder().decode(plain);
}
async function encryptBrokerToken(value: string, keyText: string): Promise<string> {
  const raw = fromB64(keyText);
  if (raw.length !== 32) throw new Error("broker_encryption_key_must_be_32_bytes_base64");
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value));
  return `v1.${b64(iv)}.${b64(new Uint8Array(cipher))}`;
}
async function appwriteRow(env: BrokerEnv, tableId: string, rowId: string, method: string, data?: Record<string, unknown>) {
  if (!env.APPWRITE_API_KEY) throw new Error("appwrite_server_key_not_configured");
  const base = `${env.APPWRITE_ENDPOINT.replace(/\/$/, "")}/tablesdb/${env.APPWRITE_DATABASE_ID}/tables/${tableId}/rows`;
  const response = await fetch(`${base}/${encodeURIComponent(rowId)}`, {
    method,
    headers: { "X-Appwrite-Project": env.APPWRITE_PROJECT_ID, "X-Appwrite-Key": env.APPWRITE_API_KEY, "Content-Type": "application/json" },
    ...(data ? { body: JSON.stringify({ data }) } : {}),
  });
  if (!response.ok) throw new Error(`appwrite_row_${method.toLowerCase()}_failed_${response.status}`);
  return response.status === 204 ? null : await response.json() as Record<string, unknown>;
}
async function startCTraderOAuth(env: BrokerEnv, account: AppwriteAccount, redirectPath: string) {
  const { CTRADER_CLIENT_ID, CTRADER_REDIRECT_URI, CTRADER_OAUTH_STATES_TABLE_ID } = env;
  if (!CTRADER_CLIENT_ID || !CTRADER_REDIRECT_URI || !CTRADER_OAUTH_STATES_TABLE_ID) {
    throw new Error("ctrader_oauth_not_configured");
  }
  const safePath = redirectPath.startsWith("/") && !redirectPath.startsWith("//") ? redirectPath : "/";
  const state = `${crypto.randomUUID()}.${crypto.randomUUID()}`;
  const stateId = crypto.randomUUID().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  const base = `${env.APPWRITE_ENDPOINT.replace(/\/$/, "")}/tablesdb/${env.APPWRITE_DATABASE_ID}/tables/${CTRADER_OAUTH_STATES_TABLE_ID}/rows`;
  const response = await fetch(base, {
    method: "POST",
    headers: { "X-Appwrite-Project": env.APPWRITE_PROJECT_ID, "X-Appwrite-Key": env.APPWRITE_API_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({
      rowId: stateId,
      data: { state_hash: await sha256(state), user_id: account.$id, redirect_path: safePath, expires_at: expiresAt, consumed_at: "" },
    }),
  });
  if (!response.ok) throw new Error("ctrader_oauth_state_create_failed");
  const authorize = new URL("https://id.ctrader.com/my/settings/openapi/grantingaccess/");
  authorize.search = new URLSearchParams({ client_id: CTRADER_CLIENT_ID, redirect_uri: CTRADER_REDIRECT_URI, scope: "trading", product: "web", state }).toString();
  return { authorizationUrl: authorize.toString(), expiresAt };
}
async function handleCTraderCallback(request: Request, env: BrokerEnv): Promise<Response> {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  if (!state || state.length > 256 || code.length > 2048) return json({ error: "invalid_oauth_response" }, 400);
  if (url.searchParams.has("error")) return json({ error: "ctrader_authorization_denied" }, 400);
  const { CTRADER_OAUTH_STATES_TABLE_ID, CTRADER_GRANTS_TABLE_ID, CTRADER_CLIENT_ID, CTRADER_CLIENT_SECRET, CTRADER_REDIRECT_URI, BROKER_TOKEN_ENCRYPTION_KEY } = env;
  if (!CTRADER_OAUTH_STATES_TABLE_ID || !CTRADER_GRANTS_TABLE_ID || !CTRADER_CLIENT_ID || !CTRADER_CLIENT_SECRET || !CTRADER_REDIRECT_URI || !BROKER_TOKEN_ENCRYPTION_KEY) {
    return json({ error: "ctrader_integration_not_configured" }, 503);
  }
  const stateHash = await sha256(state);
  const queryUrl = new URL(`${env.APPWRITE_ENDPOINT.replace(/\/$/, "")}/tablesdb/${env.APPWRITE_DATABASE_ID}/tables/${CTRADER_OAUTH_STATES_TABLE_ID}/rows`);
  queryUrl.searchParams.set("queries[]", JSON.stringify({ method: "equal", attribute: "state_hash", values: [stateHash] }));
  const lookup = await fetch(queryUrl, { headers: { "X-Appwrite-Project": env.APPWRITE_PROJECT_ID, "X-Appwrite-Key": env.APPWRITE_API_KEY! } });
  if (!lookup.ok) return json({ error: "oauth_state_lookup_failed" }, 503);
  const payload = await lookup.json() as { rows?: Array<{ $id: string; user_id: string; redirect_path?: string; expires_at: string; consumed_at?: string }> };
  const row = payload.rows?.[0];
  if (!row || row.consumed_at || Date.parse(row.expires_at) <= Date.now()) return json({ error: "oauth_state_expired_or_used" }, 400);
  try {
    // Deleting the state row is an atomic one-time consume: concurrent callbacks cannot both proceed.
    await appwriteRow(env, CTRADER_OAUTH_STATES_TABLE_ID, row.$id, "DELETE");
  } catch {
    return json({ error: "oauth_state_expired_or_used" }, 400);
  }
  const tokenUrl = new URL("https://openapi.ctrader.com/apps/token");
  tokenUrl.search = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: CTRADER_REDIRECT_URI, client_id: CTRADER_CLIENT_ID, client_secret: CTRADER_CLIENT_SECRET }).toString();
  const tokenResponse = await fetch(tokenUrl, { headers: { Accept: "application/json" } });
  if (!tokenResponse.ok) return json({ error: "ctrader_token_exchange_failed" }, 502);
  const token = await tokenResponse.json() as { accessToken?: string; refreshToken?: string; expiresIn?: number; errorCode?: string };
  if (!token.accessToken || !token.refreshToken || token.errorCode) return json({ error: "ctrader_invalid_token_response" }, 502);
  const [access, refresh] = await Promise.all([
    encryptBrokerToken(token.accessToken, BROKER_TOKEN_ENCRYPTION_KEY),
    encryptBrokerToken(token.refreshToken, BROKER_TOKEN_ENCRYPTION_KEY),
  ]);
  const grantId = row.user_id.replace(/-/g, "").slice(0, 32);
  const base = `${env.APPWRITE_ENDPOINT.replace(/\/$/, "")}/tablesdb/${env.APPWRITE_DATABASE_ID}/tables/${CTRADER_GRANTS_TABLE_ID}/rows`;
  const grantData = { user_id: row.user_id, encrypted_access_token: access, encrypted_refresh_token: refresh, token_expires_at: new Date(Date.now() + Math.max(60, Math.min(Number(token.expiresIn) || 3600, 31536000)) * 1000).toISOString(), granted_scopes: "trading", status: "account_discovery_pending" };
  const existingGrant = await fetch(`${base}/${encodeURIComponent(grantId)}`, { headers: { "X-Appwrite-Project": env.APPWRITE_PROJECT_ID, "X-Appwrite-Key": env.APPWRITE_API_KEY! } });
  const save = await fetch(existingGrant.ok ? `${base}/${encodeURIComponent(grantId)}` : base, {
    method: existingGrant.ok ? "PATCH" : "POST",
    headers: { "X-Appwrite-Project": env.APPWRITE_PROJECT_ID, "X-Appwrite-Key": env.APPWRITE_API_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify(existingGrant.ok
      ? { data: grantData, permissions: [] }
      : { rowId: grantId, data: grantData }),
  });
  if (!save.ok) return json({ error: "ctrader_secure_grant_storage_failed" }, 503);
  const safePath = row.redirect_path?.startsWith("/") && !row.redirect_path.startsWith("//") ? row.redirect_path : "/";
  const destination = new URL(safePath, env.ALLOWED_ORIGIN);
  destination.searchParams.set("ctrader", "connected");
  return Response.redirect(destination.toString(), 302);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("origin") || "";
    const cors = corsHeaders(origin, env.ALLOWED_ORIGIN);

    if (origin && origin !== env.ALLOWED_ORIGIN) return json({ error: "origin_not_allowed" }, 403);

    if (request.method === "OPTIONS") {
      if (origin !== env.ALLOWED_ORIGIN) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({
        ok: true,
        service: "supertechai-independent-api",
        backend: "appwrite",
        identityReady: true,
        memberProfilesReady: databaseReady(env),
      }, 200, cors);
    }

    if (url.pathname === "/api/me" && request.method === "GET") {
      try {
        const account = await authenticate(request, env);
        if (!account) return json({ error: "unauthorized" }, 401, cors);
        return json({
          id: account.$id,
          email: account.email,
          name: account.name || "",
          emailVerified: account.emailVerification,
        }, 200, cors);
      } catch {
        return json({ error: "identity_service_unavailable" }, 503, cors);
      }
    }

    if (url.pathname === "/api/alert-preferences" && (request.method === "GET" || request.method === "PUT")) {
      try {
        const account = await authenticate(request, env);
        if (!account) return json({ error: "unauthorized" }, 401, cors);
        if (!env.ALERT_PREFERENCES_TABLE_ID || !env.APPWRITE_API_KEY) return json({ error: "alert_preferences_not_configured" }, 503, cors);
        const endpoint = env.APPWRITE_ENDPOINT.replace(/\/$/, "");
        const base = `${endpoint}/tablesdb/${env.APPWRITE_DATABASE_ID}/tables/${env.ALERT_PREFERENCES_TABLE_ID}/rows`;
        const rowUrl = `${base}/${encodeURIComponent(account.$id)}`;
        const headers = { "X-Appwrite-Project": env.APPWRITE_PROJECT_ID, "X-Appwrite-Key": env.APPWRITE_API_KEY, "Content-Type": "application/json" };
        const categoryKeys = ["signals", "targets", "stops", "limitOrders", "pendingOrders", "superSignals", "income", "business"];
        const modes = ["full", "bubble", "muted"];
        const defaults: Record<string, string> = {
          signals: "bubble", targets: "bubble", stops: "bubble", limitOrders: "bubble",
          pendingOrders: "bubble", superSignals: "bubble", income: "bubble", business: "bubble",
        };
        if (request.method === "GET") {
          const response = await fetch(rowUrl, { headers });
          if (response.status === 404) return json({ settings: { categories: defaults, assets: {}, defaultAssetMode: "bubble" } }, 200, cors);
          if (!response.ok) return json({ error: "alert_preferences_read_failed" }, 503, cors);
          const row = await response.json() as { user_id?: string; categories_json?: string; assets_json?: string; default_asset_mode?: string };
          if (row.user_id !== account.$id) return json({ error: "alert_preferences_ownership_mismatch" }, 403, cors);
          let categoriesValue: unknown = defaults;
          let assetsValue: unknown = {};
          try { categoriesValue = JSON.parse(row.categories_json || "{}"); } catch { categoriesValue = defaults; }
          try { assetsValue = JSON.parse(row.assets_json || "{}"); } catch { assetsValue = {}; }
          const categories = categoriesValue && typeof categoriesValue === "object" && !Array.isArray(categoriesValue)
            ? categoriesValue as Record<string, string> : defaults;
          const assets = assetsValue && typeof assetsValue === "object" && !Array.isArray(assetsValue)
            ? assetsValue as Record<string, string> : {};
          const safeCategories = Object.fromEntries(categoryKeys.map(key => [key, modes.includes(categories[key]) ? categories[key] : defaults[key]]));
          const safeAssets = Object.fromEntries(Object.entries(assets).filter(([symbol, mode]) => /^[A-Za-z0-9._:-]{1,64}$/.test(symbol) && modes.includes(mode)).slice(0, 100));
          return json({ settings: { categories: safeCategories, assets: safeAssets, defaultAssetMode: modes.includes(row.default_asset_mode || "") ? row.default_asset_mode : "bubble" } }, 200, cors);
        }
        const contentLength = Number(request.headers.get("content-length") || 0);
        if (contentLength > 16_000) return json({ error: "alert_preferences_too_large" }, 413, cors);
        const body = await request.json().catch(() => null) as { settings?: { categories?: Record<string, unknown>; assets?: Record<string, unknown>; defaultAssetMode?: unknown } } | null;
        const settings = body?.settings;
        if (!settings || !settings.categories || typeof settings.categories !== "object" ||
            !settings.assets || typeof settings.assets !== "object" || Array.isArray(settings.assets) || Array.isArray(settings.categories) || !modes.includes(String(settings.defaultAssetMode))) {
          return json({ error: "invalid_alert_preferences" }, 400, cors);
        }
        const categories: Record<string, string> = {};
        for (const key of categoryKeys) {
          if (!modes.includes(String(settings.categories[key]))) return json({ error: "invalid_alert_category_mode" }, 400, cors);
          categories[key] = String(settings.categories[key]);
        }
        const entries = Object.entries(settings.assets);
        if (entries.length > 100 || entries.some(([symbol, mode]) => !/^[A-Za-z0-9._:-]{1,64}$/.test(symbol) || !modes.includes(String(mode)))) {
          return json({ error: "invalid_alert_asset_modes" }, 400, cors);
        }
        const assets = Object.fromEntries(entries.map(([symbol, mode]) => [symbol, String(mode)]));
        const data = {
          user_id: account.$id, categories_json: JSON.stringify(categories), assets_json: JSON.stringify(assets),
          default_asset_mode: String(settings.defaultAssetMode), updated_at: new Date().toISOString(),
        };
        const existing = await fetch(rowUrl, { headers });
        if (existing.ok) {
          const prior = await existing.json() as { user_id?: string };
          if (prior.user_id !== account.$id) return json({ error: "alert_preferences_ownership_mismatch" }, 403, cors);
          const update = await fetch(rowUrl, { method: "PATCH", headers, body: JSON.stringify({ data, permissions: [] }) });
          if (!update.ok) return json({ error: "alert_preferences_update_failed" }, 503, cors);
        } else if (existing.status === 404) {
          const create = await fetch(base, { method: "POST", headers, body: JSON.stringify({ rowId: account.$id, data: { ...data, created_at: new Date().toISOString() }, permissions: [] }) });
          if (!create.ok && create.status !== 409) return json({ error: "alert_preferences_create_failed" }, 503, cors);
          if (create.status === 409) {
            const retry = await fetch(rowUrl, { method: "PATCH", headers, body: JSON.stringify({ data, permissions: [] }) });
            if (!retry.ok) return json({ error: "alert_preferences_update_failed" }, 503, cors);
          }
        } else return json({ error: "alert_preferences_read_failed" }, 503, cors);
        return json({ settings: { categories, assets, defaultAssetMode: String(settings.defaultAssetMode) } }, 200, cors);
      } catch {
        return json({ error: "alert_preferences_failed" }, 503, cors);
      }
    }

    if (url.pathname === "/api/signals" && request.method === "GET") {
      try {
        const account = await authenticate(request, env);
        if (!account) return json({ error: "unauthorized" }, 401, cors);
        if (!env.SIGNAL_RECORDS_TABLE_ID || !env.APPWRITE_API_KEY) return json({ error: "signal_storage_not_configured" }, 503, cors);
        const endpoint = env.APPWRITE_ENDPOINT.replace(/\/$/, "");
        const base = `${endpoint}/tablesdb/${env.APPWRITE_DATABASE_ID}/tables/${env.SIGNAL_RECORDS_TABLE_ID}/rows`;
        const query = JSON.stringify({ method: "equal", attribute: "user_id", values: [account.$id] });
        const target = new URL(base);
        target.searchParams.append("queries[]", query);
        target.searchParams.append("queries[]", JSON.stringify({ method: "orderDesc", attribute: "signal_epoch" }));
        target.searchParams.set("limit", "500");
        const response = await fetch(target, {
          headers: { "X-Appwrite-Project": env.APPWRITE_PROJECT_ID, "X-Appwrite-Key": env.APPWRITE_API_KEY },
        });
        if (!response.ok) return json({ error: "signal_history_read_failed" }, 503, cors);
        const payload = await response.json() as { rows?: Array<Record<string, unknown>> };
        const rows = (payload.rows || []).filter(row => row.user_id === account.$id).map(({ $id, $createdAt, $updatedAt, $permissions, user_id, ...record }) => record);
        return json({ records: rows }, 200, cors);
      } catch {
        return json({ error: "signal_history_read_failed" }, 503, cors);
      }
    }

    if (url.pathname === "/api/signals" && request.method === "POST") {
      try {
        const account = await authenticate(request, env);
        if (!account) return json({ error: "unauthorized" }, 401, cors);
        if (!env.SIGNAL_RECORDS_TABLE_ID || !env.APPWRITE_API_KEY) return json({ error: "signal_storage_not_configured" }, 503, cors);
        const contentLength = Number(request.headers.get("content-length") || 0);
        if (contentLength > 64_000) return json({ error: "signal_batch_too_large" }, 413, cors);
        const body = await request.json().catch(() => null) as { records?: Array<Record<string, unknown>> } | null;
        if (!body || !Array.isArray(body.records) || body.records.length < 1 || body.records.length > 50) {
          return json({ error: "invalid_signal_batch" }, 400, cors);
        }
        const timeframeSeconds: Record<string, number> = { M30: 1800, H1: 3600, H2: 7200, H3: 10800, H4: 14400, H6: 21600, H8: 28800, H12: 43200, D1: 86400, W1: 604800 };
        const numericFields = ["entry", "stop_loss", "tp1", "tp2", "tp3", "band_mean", "band_deviation"];
        const optionalEpochFields = ["tp1_hit_epoch", "tp2_hit_epoch", "tp3_hit_epoch", "sl_hit_epoch"];
        const endpoint = env.APPWRITE_ENDPOINT.replace(/\/$/, "");
        const base = `${endpoint}/tablesdb/${env.APPWRITE_DATABASE_ID}/tables/${env.SIGNAL_RECORDS_TABLE_ID}/rows`;
        const headers = { "X-Appwrite-Project": env.APPWRITE_PROJECT_ID, "X-Appwrite-Key": env.APPWRITE_API_KEY, "Content-Type": "application/json" };
        let saved = 0;
        for (const raw of body.records) {
          const record = raw || {};
          const valid = typeof record.signal_key === "string" && record.signal_key.length > 0 && record.signal_key.length <= 160 &&
            typeof record.symbol === "string" && record.symbol.length > 0 && record.symbol.length <= 64 &&
            typeof record.asset_name === "string" && record.asset_name.length <= 120 &&
            typeof record.timeframe === "string" && timeframeSeconds[record.timeframe] === record.granularity &&
            Number.isInteger(record.digits) && Number(record.digits) >= 0 && Number(record.digits) <= 12 &&
            (record.direction === "BUY" || record.direction === "SELL") &&
            Number.isSafeInteger(record.signal_epoch) && Number(record.signal_epoch) > 0 && Number(record.signal_epoch) <= Date.now() / 1000 + 60 &&
            numericFields.every(key => typeof record[key] === "number" && Number.isFinite(record[key]) && Number(record[key]) > 0) &&
            Number(record.band_deviation) > 0 &&
            optionalEpochFields.every(key => record[key] === null || (Number.isSafeInteger(record[key]) && Number(record[key]) > 0)) &&
            ["Open", "TP1", "TP2", "TP3", "Stopped"].includes(String(record.status)) && typeof record.closed === "boolean";
          if (!valid) return json({ error: "invalid_signal_record" }, 400, cors);
          const safeRecord = {
            signal_key: record.signal_key, symbol: record.symbol, asset_name: record.asset_name,
            timeframe: record.timeframe, granularity: record.granularity, digits: record.digits,
            direction: record.direction, signal_epoch: record.signal_epoch,
            entry: record.entry, stop_loss: record.stop_loss, tp1: record.tp1, tp2: record.tp2, tp3: record.tp3,
            band_mean: record.band_mean, band_deviation: record.band_deviation,
            tp1_hit_epoch: record.tp1_hit_epoch, tp2_hit_epoch: record.tp2_hit_epoch,
            tp3_hit_epoch: record.tp3_hit_epoch, sl_hit_epoch: record.sl_hit_epoch,
            status: record.status, closed: record.closed,
          };
          const rowId = (await sha256(`${account.$id}|${record.signal_key}`)).slice(0, 32);
          const rowUrl = `${base}/${encodeURIComponent(rowId)}`;
          const existing = await fetch(rowUrl, { headers });
          if (existing.ok) {
            const prior = await existing.json() as { user_id?: string };
            if (prior.user_id !== account.$id) return json({ error: "signal_record_ownership_mismatch" }, 403, cors);
            const update = await fetch(rowUrl, {
              method: "PATCH", headers,
              body: JSON.stringify({ data: { ...safeRecord, user_id: account.$id, updated_at: new Date().toISOString() }, permissions: [] }),
            });
            if (!update.ok) return json({ error: "signal_record_update_failed" }, 503, cors);
          } else if (existing.status === 404) {
            const create = await fetch(base, {
              method: "POST", headers,
              body: JSON.stringify({ rowId, data: { ...safeRecord, user_id: account.$id, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, permissions: [] }),
            });
            if (!create.ok && create.status !== 409) return json({ error: "signal_record_create_failed" }, 503, cors);
            if (create.status === 409) {
              const retry = await fetch(rowUrl, { method: "PATCH", headers, body: JSON.stringify({ data: { ...safeRecord, user_id: account.$id, updated_at: new Date().toISOString() }, permissions: [] }) });
              if (!retry.ok) return json({ error: "signal_record_upsert_failed" }, 503, cors);
            }
          } else return json({ error: "signal_record_read_failed" }, 503, cors);
          saved++;
        }
        return json({ saved }, 200, cors);
      } catch {
        return json({ error: "signal_history_write_failed" }, 503, cors);
      }
    }

    if (url.pathname === "/api/profile" && (request.method === "GET" || request.method === "PATCH")) {
      try {
        const account = await authenticate(request, env);
        if (!account) return json({ error: "unauthorized" }, 401, cors);

        if (request.method === "GET") {
          return withCors(await profileRequest(env, account, "GET"), cors);
        }

        const body = await request.json().catch(() => null) as Record<string, unknown> | null;
        if (!body || typeof body.displayName !== "string") {
          return json({ error: "invalid_profile_payload" }, 400, cors);
        }
        const displayName = body.displayName.trim();
        if (displayName.length > 120) return json({ error: "display_name_too_long" }, 400, cors);
        return withCors(await profileRequest(env, account, "PATCH", { display_name: displayName }), cors);
      } catch {
        return json({ error: "profile_service_unavailable" }, 503, cors);
      }
    }


    if (url.pathname === "/api/brokers/ctrader/connect" && request.method === "POST") {
      try {
        const account = await authenticate(request, env);
        if (!account) return json({ error: "unauthorized" }, 401, cors);
        const body = await request.json().catch(() => ({})) as { redirectPath?: string };
        const result = await startCTraderOAuth(env as BrokerEnv, account, typeof body.redirectPath === "string" ? body.redirectPath : "/");
        return json(result, 200, cors);
      } catch (error) {
        const message = error instanceof Error ? error.message : "ctrader_connect_failed";
        return json({ error: message }, message === "ctrader_oauth_not_configured" ? 503 : 500, cors);
      }
    }

    if (url.pathname === "/api/brokers/ctrader/callback" && request.method === "GET") {
      try { return await handleCTraderCallback(request, env as BrokerEnv); }
      catch { return json({ error: "ctrader_callback_failed" }, 500); }
    }

    if (url.pathname === "/api/brokers/ctrader/status" && request.method === "GET") {
      try {
        const account = await authenticate(request, env);
        if (!account) return json({ error: "unauthorized" }, 401, cors);
        const configured = env as BrokerEnv;
        if (!configured.CTRADER_GRANTS_TABLE_ID || !configured.APPWRITE_API_KEY) {
          return json({ error: "ctrader_status_not_configured" }, 503, cors);
        }
        const grantId = account.$id.replace(/-/g, "").slice(0, 32);
        const endpoint = `${configured.APPWRITE_ENDPOINT.replace(/\/$/, "")}/tablesdb/${configured.APPWRITE_DATABASE_ID}/tables/${configured.CTRADER_GRANTS_TABLE_ID}/rows/${encodeURIComponent(grantId)}`;
        const response = await fetch(endpoint, {
          headers: { "X-Appwrite-Project": configured.APPWRITE_PROJECT_ID, "X-Appwrite-Key": configured.APPWRITE_API_KEY },
        });
        if (response.status === 404) return json({ connected: false, status: "not_connected" }, 200, cors);
        if (!response.ok) return json({ error: "ctrader_status_failed" }, 503, cors);
        const grant = await response.json() as { user_id?: string; token_expires_at?: string; status?: string };
        if (grant.user_id !== account.$id) return json({ error: "ctrader_grant_ownership_mismatch" }, 403, cors);
        return json({ connected: true, tokenExpiresAt: grant.token_expires_at || null, status: grant.status || "connected" }, 200, cors);
      } catch {
        return json({ error: "ctrader_status_failed" }, 503, cors);
      }
    }

    if (url.pathname === "/api/brokers/ctrader/refresh" && request.method === "POST") {
      try {
        const account = await authenticate(request, env);
        if (!account) return json({ error: "unauthorized" }, 401, cors);
        const configured = env as BrokerEnv;
        const { CTRADER_GRANTS_TABLE_ID, CTRADER_CLIENT_ID, CTRADER_CLIENT_SECRET, BROKER_TOKEN_ENCRYPTION_KEY } = configured;
        if (!CTRADER_GRANTS_TABLE_ID || !CTRADER_CLIENT_ID || !CTRADER_CLIENT_SECRET || !BROKER_TOKEN_ENCRYPTION_KEY) {
          return json({ error: "ctrader_refresh_not_configured" }, 503, cors);
        }
        const grantId = account.$id.replace(/-/g, "").slice(0, 32);
        const grant = await appwriteRow(configured, CTRADER_GRANTS_TABLE_ID, grantId, "GET") as {
          user_id?: string; encrypted_refresh_token?: string; encrypted_access_token?: string;
          token_expires_at?: string; granted_scopes?: string; status?: string;
        } | null;
        if (!grant || grant.user_id !== account.$id || !grant.encrypted_refresh_token) {
          return json({ error: "ctrader_not_connected" }, 404, cors);
        }
        const expiresAt = Date.parse(grant.token_expires_at || "");
        if (Number.isFinite(expiresAt) && expiresAt > Date.now() + 120_000) {
          return json({ connected: true, refreshed: false, tokenExpiresAt: grant.token_expires_at, status: grant.status }, 200, cors);
        }
        const refreshToken = await decryptBrokerToken(grant.encrypted_refresh_token, BROKER_TOKEN_ENCRYPTION_KEY);
        const tokenUrl = new URL("https://openapi.ctrader.com/apps/token");
        tokenUrl.search = new URLSearchParams({
          grant_type: "refresh_token", refresh_token: refreshToken,
          client_id: CTRADER_CLIENT_ID, client_secret: CTRADER_CLIENT_SECRET,
        }).toString();
        const tokenResponse = await fetch(tokenUrl, { headers: { Accept: "application/json" } });
        if (!tokenResponse.ok) return json({ error: "ctrader_token_refresh_failed" }, 502, cors);
        const token = await tokenResponse.json() as { accessToken?: string; refreshToken?: string; expiresIn?: number; errorCode?: string };
        if (!token.accessToken || token.errorCode) return json({ error: "ctrader_invalid_refresh_response" }, 502, cors);
        const [access, refresh] = await Promise.all([
          encryptBrokerToken(token.accessToken, BROKER_TOKEN_ENCRYPTION_KEY),
          token.refreshToken
            ? encryptBrokerToken(token.refreshToken, BROKER_TOKEN_ENCRYPTION_KEY)
            : Promise.resolve(grant.encrypted_refresh_token),
        ]);
        const nextExpiry = new Date(Date.now() + Math.max(60, Math.min(Number(token.expiresIn) || 3600, 31536000)) * 1000).toISOString();
        const saved = await fetch(`${configured.APPWRITE_ENDPOINT.replace(/\/$/, "")}/tablesdb/${configured.APPWRITE_DATABASE_ID}/tables/${CTRADER_GRANTS_TABLE_ID}/rows/${encodeURIComponent(grantId)}`, {
          method: "PATCH",
          headers: { "X-Appwrite-Project": configured.APPWRITE_PROJECT_ID, "X-Appwrite-Key": configured.APPWRITE_API_KEY!, "Content-Type": "application/json" },
          body: JSON.stringify({
            data: { user_id: account.$id, encrypted_access_token: access, encrypted_refresh_token: refresh, token_expires_at: nextExpiry, granted_scopes: grant.granted_scopes || "trading", status: "account_discovery_pending" },
            permissions: [],
          }),
        });
        if (!saved.ok) return json({ error: "ctrader_refreshed_token_storage_failed" }, 503, cors);
        return json({ connected: true, refreshed: true, tokenExpiresAt: nextExpiry, status: "account_discovery_pending" }, 200, cors);
      } catch {
        return json({ error: "ctrader_refresh_failed" }, 503, cors);
      }
    }

    if (url.pathname === "/api/brokers/ctrader/disconnect" && request.method === "POST") {
      try {
        const account = await authenticate(request, env);
        if (!account) return json({ error: "unauthorized" }, 401, cors);
        const configured = env as BrokerEnv;
        if (!configured.CTRADER_GRANTS_TABLE_ID || !configured.APPWRITE_API_KEY) {
          return json({ error: "ctrader_disconnect_not_configured" }, 503, cors);
        }
        const grantId = account.$id.replace(/-/g, "").slice(0, 32);
        const endpoint = `${configured.APPWRITE_ENDPOINT.replace(/\/$/, "")}/tablesdb/${configured.APPWRITE_DATABASE_ID}/tables/${configured.CTRADER_GRANTS_TABLE_ID}/rows/${encodeURIComponent(grantId)}`;
        const response = await fetch(endpoint, {
          method: "DELETE",
          headers: { "X-Appwrite-Project": configured.APPWRITE_PROJECT_ID, "X-Appwrite-Key": configured.APPWRITE_API_KEY },
        });
        if (!response.ok && response.status !== 404) return json({ error: "ctrader_disconnect_failed" }, 503, cors);
        return json({ disconnected: true, providerTokenRevoked: false, note: "The local encrypted grant was deleted. Revoke access from your cTrader account settings to invalidate provider authorization." }, 200, cors);
      } catch {
        return json({ error: "ctrader_disconnect_failed" }, 503, cors);
      }
    }

    if (url.pathname === "/api/brokers/capabilities" && request.method === "GET") {
      const account = await authenticate(request, env);
      if (!account) return json({ error: "unauthorized" }, 401, cors);
      const configured = env as BrokerEnv;
      return json({
        providers: {
          ctrader: Boolean(configured.CTRADER_CLIENT_ID && configured.CTRADER_CLIENT_SECRET && configured.CTRADER_REDIRECT_URI && configured.CTRADER_OAUTH_STATES_TABLE_ID && configured.CTRADER_GRANTS_TABLE_ID && configured.BROKER_TOKEN_ENCRYPTION_KEY),
          mt5: false, binance_spot: false, binance_futures: false, okx_futures: false, deriv_options: false,
        },
        executionEnabled: false,
        note: "Provider execution remains disabled until each provider's account, risk, order, and reconciliation tables pass security checks.",
      }, 200, cors);
    }

    return json({ error: "not_found" }, 404, cors);
  },
};
