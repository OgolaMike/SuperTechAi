export interface Env {
  APPWRITE_ENDPOINT: string;
  APPWRITE_PROJECT_ID: string;
  APPWRITE_DATABASE_ID: string;
  MEMBER_PROFILES_TABLE_ID: string;
  SIGNAL_RECORDS_TABLE_ID?: string;
  ALERT_PREFERENCES_TABLE_ID?: string;
  SUPER_SIGNAL_RECORDS_TABLE_ID?: string;
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
    "access-control-allow-methods": "GET, POST, PUT, PATCH, OPTIONS",
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
  BINANCE_SPOT_CREDENTIALS_TABLE_ID?: string;
  BINANCE_FUTURES_CREDENTIALS_TABLE_ID?: string;
  DERIV_CLIENT_ID?: string;
  DERIV_REDIRECT_URI?: string;
  DERIV_OAUTH_STATES_TABLE_ID?: string;
  DERIV_GRANTS_TABLE_ID?: string;
};

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (value: string) => Uint8Array.from(atob(value), (ch) => ch.charCodeAt(0));
const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};
async function openCTraderSocket(host: string): Promise<WebSocket> {
  const socket = new WebSocket(`wss://${host}:5036`);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { socket.close(); reject(new Error("ctrader_socket_timeout")); }, 8000);
    socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("ctrader_socket_error")); }, { once: true });
  });
  return socket;
}

async function sendCTraderJsonMessage(socket: WebSocket, payloadType: number, payload: Record<string, unknown>, expectedType: number): Promise<Record<string, unknown>> {
  const clientMsgId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); socket.removeEventListener("message", onMessage); socket.removeEventListener("error", onError); socket.removeEventListener("close", onClose); };
    const timer = setTimeout(() => { cleanup(); reject(new Error("ctrader_message_timeout")); }, 8000);
    const onMessage = (event: MessageEvent) => {
      if (typeof event.data !== "string") return;
      let message: { payloadType?: number; payload?: Record<string, unknown>; clientMsgId?: string };
      try { message = JSON.parse(event.data) as typeof message; } catch { return; }
      if (message.payloadType === 2142) { cleanup(); reject(new Error("ctrader_open_api_error")); return; }
      if (message.payloadType === expectedType && (!message.clientMsgId || message.clientMsgId === clientMsgId)) { cleanup(); resolve(message.payload || {}); }
    };
    const onError = () => { cleanup(); reject(new Error("ctrader_socket_error")); };
    const onClose = () => { cleanup(); reject(new Error("ctrader_socket_closed")); };
    socket.addEventListener("message", onMessage);
    socket.addEventListener("error", onError);
    socket.addEventListener("close", onClose);
    socket.send(JSON.stringify({ clientMsgId, payloadType, payload }));
  });
}

async function authenticateCTraderApplication(socket: WebSocket, env: BrokerEnv): Promise<void> {
  if (!env.CTRADER_CLIENT_ID || !env.CTRADER_CLIENT_SECRET) throw new Error("ctrader_app_credentials_missing");
  await sendCTraderJsonMessage(socket, 2100, { clientId: env.CTRADER_CLIENT_ID, clientSecret: env.CTRADER_CLIENT_SECRET }, 2101);
}
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
  const base = env.APPWRITE_ENDPOINT.replace(/\/$/, "") + "/tablesdb/" + env.APPWRITE_DATABASE_ID + "/tables/" + tableId + "/rows";
  const response = await fetch(`${base}/${encodeURIComponent(rowId)}`, {
    method,
    headers: { "X-Appwrite-Project": env.APPWRITE_PROJECT_ID, "X-Appwrite-Key": env.APPWRITE_API_KEY, "Content-Type": "application/json" },
    ...(data ? { body: JSON.stringify({ data }) } : {}),
  });
  if (!response.ok) throw new Error(`appwrite_row_${method.toLowerCase()}_failed_${response.status}`);
  return response.status === 204 ? null : await response.json() as Record<string, unknown>;
}
async function binanceSpotAccount(apiKey: string, apiSecret: string): Promise<{ canTrade: boolean; canWithdraw: boolean; accountType?: string }> {
  const params = new URLSearchParams({ timestamp: String(Date.now()), recvWindow: "5000" });
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(apiSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(params.toString())))].map(value => value.toString(16).padStart(2, "0")).join("");
  const response = await fetch("https://api.binance.com/api/v3/account?" + params.toString() + "&signature=" + signature, { headers: { "X-MBX-APIKEY": apiKey } });
  const data = await response.json() as { canTrade?: boolean; canWithdraw?: boolean; accountType?: string };
  if (!response.ok) throw new Error(response.status === 401 ? "binance_invalid_api_credentials" : "binance_account_verification_failed");
  if (data.canTrade !== true) throw new Error("binance_spot_trading_permission_not_enabled");
  if (data.canWithdraw !== false) throw new Error("binance_withdrawal_permission_must_be_disabled");
  return { canTrade: data.canTrade, canWithdraw: data.canWithdraw, accountType: data.accountType };
}
async function binanceFuturesAccount(apiKey: string, apiSecret: string): Promise<{ canTrade: boolean; canWithdraw: boolean }> {
  const params = new URLSearchParams({ timestamp: String(Date.now()), recvWindow: "5000" });
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(apiSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(params.toString())))].map(value => value.toString(16).padStart(2, "0")).join("");
  const response = await fetch("https://fapi.binance.com/fapi/v3/account?" + params.toString() + "&signature=" + signature, { headers: { "X-MBX-APIKEY": apiKey } });
  const data = await response.json() as { canTrade?: boolean; canWithdraw?: boolean };
  if (!response.ok) throw new Error(response.status === 401 ? "binance_invalid_api_credentials" : "binance_futures_account_verification_failed");
  if (data.canTrade !== true) throw new Error("binance_futures_trading_permission_not_enabled");
  if (data.canWithdraw !== false) throw new Error("binance_withdrawal_permission_must_be_disabled");
  return { canTrade: true, canWithdraw: false };
}
async function binanceSpotRow(env: BrokerEnv, accountId: string, method: "GET" | "POST" | "PATCH" | "DELETE", data?: Record<string, unknown>) {
  if (!env.BINANCE_SPOT_CREDENTIALS_TABLE_ID || !env.APPWRITE_API_KEY) throw new Error("binance_spot_not_configured");
  const base = env.APPWRITE_ENDPOINT.replace(/\/$/, "") + "/tablesdb/" + env.APPWRITE_DATABASE_ID + "/tables/" + env.BINANCE_SPOT_CREDENTIALS_TABLE_ID + "/rows";
  const endpoint = base + "/" + encodeURIComponent(accountId);
  const headers = { "X-Appwrite-Project": env.APPWRITE_PROJECT_ID, "X-Appwrite-Key": env.APPWRITE_API_KEY, "Content-Type": "application/json" };
  if (method === "GET" || method === "DELETE") {
    const response = await fetch(endpoint, { method, headers });
    if (response.status === 404) return null;
    if (!response.ok && response.status !== 204) throw new Error("binance_spot_storage_failed");
    return response.status === 204 ? null : await response.json() as Record<string, unknown>;
  }
  const existing = await fetch(endpoint, { headers });
  const response = await fetch(existing.ok ? endpoint : base, { method: existing.ok ? "PATCH" : "POST", headers, body: JSON.stringify(existing.ok ? { data, permissions: [] } : { rowId: accountId, data, permissions: [] }) });
  if (!response.ok) throw new Error("binance_spot_storage_failed");
  return await response.json() as Record<string, unknown>;
}
function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function derivApi(token: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`https://api.derivws.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(response.status === 401 ? "deriv_authorization_expired" : response.status === 403 ? "deriv_permission_denied" : "deriv_api_request_failed");
  return payload;
}
async function derivRow(env: BrokerEnv, tableId: string, rowId: string, method: "GET" | "POST" | "PATCH" | "DELETE", data?: Record<string, unknown>) {
  if (!env.APPWRITE_API_KEY) throw new Error("appwrite_server_key_not_configured");
  const base = env.APPWRITE_ENDPOINT.replace(/\/$/, "") + "/tablesdb/" + env.APPWRITE_DATABASE_ID + "/tables/" + tableId + "/rows";
  const endpoint = `${base}/${encodeURIComponent(rowId)}`;
  const headers = { "X-Appwrite-Project": env.APPWRITE_PROJECT_ID, "X-Appwrite-Key": env.APPWRITE_API_KEY, "Content-Type": "application/json" };
  if (method === "GET" || method === "DELETE") {
    const response = await fetch(endpoint, { method, headers });
    if (response.status === 404) return null;
    if (!response.ok && response.status !== 204) throw new Error("deriv_storage_failed");
    return response.status === 204 ? null : await response.json() as Record<string, unknown>;
  }
  const existing = await fetch(endpoint, { headers });
  const response = await fetch(existing.ok ? endpoint : base, {
    method: existing.ok ? "PATCH" : "POST", headers,
    body: JSON.stringify(existing.ok ? { data, permissions: [] } : { rowId, data, permissions: [] }),
  });
  if (!response.ok) throw new Error("deriv_storage_failed");
  return await response.json() as Record<string, unknown>;
}
async function startDerivOAuth(env: BrokerEnv, account: AppwriteAccount, redirectPath: string) {
  const { DERIV_CLIENT_ID, DERIV_REDIRECT_URI, DERIV_OAUTH_STATES_TABLE_ID, BROKER_TOKEN_ENCRYPTION_KEY } = env;
  if (!DERIV_CLIENT_ID || !DERIV_REDIRECT_URI || !DERIV_OAUTH_STATES_TABLE_ID || !BROKER_TOKEN_ENCRYPTION_KEY || !env.APPWRITE_API_KEY) throw new Error("deriv_oauth_not_configured");
  const safePath = redirectPath.startsWith("/") && !redirectPath.startsWith("//") ? redirectPath : "/";
  const state = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(64)));
  const challenge = base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  const stateId = crypto.randomUUID().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  await derivRow(env, DERIV_OAUTH_STATES_TABLE_ID, stateId, "POST", {
    state_hash: await sha256(state), user_id: account.$id,
    encrypted_code_verifier: await encryptBrokerToken(verifier, BROKER_TOKEN_ENCRYPTION_KEY),
    redirect_path: safePath, expires_at: expiresAt,
  });
  const authorize = new URL("https://auth.deriv.com/oauth2/auth");
  authorize.search = new URLSearchParams({
    response_type: "code", client_id: DERIV_CLIENT_ID, redirect_uri: DERIV_REDIRECT_URI,
    scope: "trade", state, code_challenge: challenge, code_challenge_method: "S256",
  }).toString();
  return { authorizationUrl: authorize.toString(), expiresAt };
}
async function handleDerivCallback(request: Request, env: BrokerEnv): Promise<Response> {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  const configured = env as BrokerEnv;
  const { DERIV_CLIENT_ID, DERIV_REDIRECT_URI, DERIV_OAUTH_STATES_TABLE_ID, DERIV_GRANTS_TABLE_ID, BROKER_TOKEN_ENCRYPTION_KEY } = configured;
  if (url.searchParams.has("error")) return json({ error: "deriv_authorization_denied" }, 400);
  if (!state || state.length > 256 || !code || code.length > 2048) return json({ error: "invalid_deriv_oauth_response" }, 400);
  if (!DERIV_CLIENT_ID || !DERIV_REDIRECT_URI || !DERIV_OAUTH_STATES_TABLE_ID || !DERIV_GRANTS_TABLE_ID || !BROKER_TOKEN_ENCRYPTION_KEY || !configured.APPWRITE_API_KEY) return json({ error: "deriv_oauth_not_configured" }, 503);
  const queryUrl = new URL(configured.APPWRITE_ENDPOINT.replace(/\/$/, "") + "/tablesdb/" + configured.APPWRITE_DATABASE_ID + "/tables/" + DERIV_OAUTH_STATES_TABLE_ID + "/rows");
  queryUrl.searchParams.set("queries[]", JSON.stringify({ method: "equal", column: "state_hash", values: [await sha256(state)] }));
  const lookup = await fetch(queryUrl, { headers: { "X-Appwrite-Project": configured.APPWRITE_PROJECT_ID, "X-Appwrite-Key": configured.APPWRITE_API_KEY } });
  if (!lookup.ok) return json({ error: "deriv_state_lookup_failed" }, 503);
  const found = await lookup.json() as { rows?: Array<{ $id: string; user_id: string; encrypted_code_verifier: string; redirect_path?: string; expires_at: string }> };
  const row = found.rows?.[0];
  if (!row || Date.parse(row.expires_at) <= Date.now()) return json({ error: "deriv_oauth_state_expired_or_used" }, 400);
  await derivRow(configured, DERIV_OAUTH_STATES_TABLE_ID, row.$id, "DELETE");
  const verifier = await decryptBrokerToken(row.encrypted_code_verifier, BROKER_TOKEN_ENCRYPTION_KEY);
  const tokenResponse = await fetch("https://auth.deriv.com/oauth2/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", client_id: DERIV_CLIENT_ID, code, code_verifier: verifier, redirect_uri: DERIV_REDIRECT_URI }),
  });
  const tokenData = await tokenResponse.json() as { access_token?: string; expires_in?: number };
  if (!tokenResponse.ok || !tokenData.access_token || !Number.isFinite(tokenData.expires_in)) return json({ error: "deriv_token_exchange_failed" }, 502);
  const encrypted = await encryptBrokerToken(tokenData.access_token, BROKER_TOKEN_ENCRYPTION_KEY);
  const accountsResponse = await derivApi(tokenData.access_token, "/trading/v1/options/accounts");
  const raw = (accountsResponse.data && typeof accountsResponse.data === "object" ? (accountsResponse.data as Record<string, unknown>).accounts : accountsResponse.accounts);
  const accounts = Array.isArray(raw) ? raw.filter((item): item is Record<string, unknown> => !!item && typeof item === "object").map(item => ({
    accountId: String(item.account_id ?? item.id ?? ""), accountType: String(item.account_type ?? item.type ?? "unknown"),
    currency: String(item.currency ?? ""), isDemo: String(item.account_type ?? item.type ?? "").toLowerCase().includes("demo"),
  })).filter(item => /^[A-Za-z0-9_-]{1,64}$/.test(item.accountId)) : [];
  const grantId = row.user_id.replace(/-/g, "").slice(0, 32);
  await derivRow(configured, DERIV_GRANTS_TABLE_ID, grantId, "POST", {
    user_id: row.user_id, encrypted_access_token: encrypted,
    token_expires_at: new Date(Date.now() + Number(tokenData.expires_in) * 1000).toISOString(),
    accounts_json: JSON.stringify(accounts), selected_account_id: "", status: "connected",
  });
  const safePath = row.redirect_path?.startsWith("/") && !row.redirect_path.startsWith("//") ? row.redirect_path : "/";
  const destination = new URL(safePath, configured.ALLOWED_ORIGIN);
  destination.searchParams.set("deriv", "connected");
  return Response.redirect(destination.toString(), 302);
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
  const base = env.APPWRITE_ENDPOINT.replace(/\/$/, "") + "/tablesdb/" + env.APPWRITE_DATABASE_ID + "/tables/" + tableId + "/rows";
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
  queryUrl.searchParams.set("queries[]", JSON.stringify({ method: "equal", column: "state_hash", values: [stateHash] }));
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
  const base = env.APPWRITE_ENDPOINT.replace(/\/$/, "") + "/tablesdb/" + env.APPWRITE_DATABASE_ID + "/tables/" + tableId + "/rows";
  const grantData = { user_id: row.user_id, encrypted_access_token: access, encrypted_refresh_token: refresh, token_expires_at: new Date(Date.now() + Math.max(60, Math.min(Number(token.expiresIn) || 3600, 31536000)) * 1000).toISOString(), granted_scopes: "trading", status: "account_discovery_pending" };
  const existingGrant = await fetch(`${base}/${encodeURIComponent(grantId)}`, { headers: { "X-Appwrite-Project": env.APPWRITE_PROJECT_ID, "X-Appwrite-Key": env.APPWRITE_API_KEY! } });
  const save = await fetch(existingGrant.ok ? `${base}/${encodeURIComponent(grantId)}` : base, {
    method: existingGrant.ok ? "PATCH" : "POST",
    headers: { "X-Appwrite-Project": env.APPWRITE_PROJECT_ID, "X-Appwrite-Key": env.APPWRITE_API_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify(existingGrant.ok
      ? { data: grantData, permissions: [] }
      : { rowId: grantId, data: grantData, permissions: [] }),
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
          if (response.status === 404) return json({ settings: { categories: defaults, assets: {}, defaultAssetMode: "bubble" }, exists: false }, 200, cors);
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
          return json({ settings: { categories: safeCategories, assets: safeAssets, defaultAssetMode: modes.includes(row.default_asset_mode || "") ? row.default_asset_mode : "bubble" }, exists: true }, 200, cors);
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

    if (url.pathname === "/api/super-signals" && (request.method === "GET" || request.method === "POST")) {
      try {
        const account = await authenticate(request, env);
        if (!account) return json({ error: "unauthorized" }, 401, cors);
        const tableId = env.SUPER_SIGNAL_RECORDS_TABLE_ID;
        if (!tableId || !env.APPWRITE_API_KEY) return json({ error: "super_signal_storage_not_configured" }, 503, cors);
        const base = env.APPWRITE_ENDPOINT.replace(/\/$/, "") + "/tablesdb/" + env.APPWRITE_DATABASE_ID + "/tables/" + tableId + "/rows";
        const headers = { "X-Appwrite-Project": env.APPWRITE_PROJECT_ID, "X-Appwrite-Key": env.APPWRITE_API_KEY, "Content-Type": "application/json" };
        if (request.method === "GET") {
          const target = new URL(base);
          target.searchParams.append("queries[]", JSON.stringify({ method: "equal", column: "user_id", values: [account.$id] }));
          target.searchParams.append("queries[]", JSON.stringify({ method: "orderDesc", column: "signal_epoch" }));
          target.searchParams.set("limit", "300");
          const response = await fetch(target, { headers });
          if (!response.ok) return json({ error: "super_signal_history_read_failed" }, 503, cors);
          const payload = await response.json() as { rows?: Array<Record<string, unknown>> };
          const records = (payload.rows || []).filter(row => row.user_id === account.$id).flatMap(row => { try { const value = JSON.parse(String(row.payload_json || "")); return value && typeof value === "object" ? [value] : []; } catch { return []; } });
          return json({ records }, 200, cors);
        }
        if (Number(request.headers.get("content-length") || 0) > 1000000) return json({ error: "super_signal_batch_too_large" }, 413, cors);
        const body = await request.json().catch(() => null) as { records?: Array<Record<string, unknown>> } | null;
        if (!body || !Array.isArray(body.records) || body.records.length < 1 || body.records.length > 50) return json({ error: "invalid_super_signal_batch" }, 400, cors);
        for (const record of body.records) {
          if (typeof record.signal_key !== "string" || !record.signal_key.length || record.signal_key.length > 160 || !Number.isSafeInteger(record.signal_epoch) || Number(record.signal_epoch) <= 0 || Number(record.signal_epoch) > Date.now() / 1000 + 60 || typeof record.symbol !== "string" || record.symbol.length > 64 || !["BUY", "SELL"].includes(String(record.direction))) return json({ error: "invalid_super_signal_record" }, 400, cors);
          const payloadJson = JSON.stringify(record);
          if (payloadJson.length > 24000) return json({ error: "super_signal_record_too_large" }, 413, cors);
          const rowId = (await sha256(account.$id + "|" + record.signal_key)).slice(0, 32);
          const rowUrl = base + "/" + encodeURIComponent(rowId);
          const existing = await fetch(rowUrl, { headers });
          const data = { user_id: account.$id, signal_key: record.signal_key, signal_epoch: record.signal_epoch, payload_json: payloadJson, updated_at: new Date().toISOString() };
          if (existing.ok) { const prior = await existing.json() as { user_id?: string }; if (prior.user_id !== account.$id) return json({ error: "super_signal_ownership_mismatch" }, 403, cors); const update = await fetch(rowUrl, { method: "PATCH", headers, body: JSON.stringify({ data, permissions: [] }) }); if (!update.ok) return json({ error: "super_signal_update_failed" }, 503, cors); }
          else if (existing.status === 404) { const create = await fetch(base, { method: "POST", headers, body: JSON.stringify({ rowId, data: { ...data, created_at: new Date().toISOString() }, permissions: [] }) }); if (!create.ok && create.status !== 409) return json({ error: "super_signal_create_failed" }, 503, cors); if (create.status === 409) { const retry = await fetch(rowUrl, { method: "PATCH", headers, body: JSON.stringify({ data, permissions: [] }) }); if (!retry.ok) return json({ error: "super_signal_upsert_failed" }, 503, cors); } }
          else return json({ error: "super_signal_read_failed" }, 503, cors);
        }
        return json({ saved: body.records.length }, 200, cors);
      } catch { return json({ error: "super_signal_history_failed" }, 503, cors); }
    }
    if (url.pathname === "/api/signals" && request.method === "GET") {
      try {
        const account = await authenticate(request, env);
        if (!account) return json({ error: "unauthorized" }, 401, cors);
        if (!env.SIGNAL_RECORDS_TABLE_ID || !env.APPWRITE_API_KEY) return json({ error: "signal_storage_not_configured" }, 503, cors);
        const endpoint = env.APPWRITE_ENDPOINT.replace(/\/$/, "");
        const base = `${endpoint}/tablesdb/${env.APPWRITE_DATABASE_ID}/tables/${env.SIGNAL_RECORDS_TABLE_ID}/rows`;
        const query = JSON.stringify({ method: "equal", column: "user_id", values: [account.$id] });
        const target = new URL(base);
        target.searchParams.append("queries[]", query);
        target.searchParams.append("queries[]", JSON.stringify({ method: "orderDesc", column: "signal_epoch" }));
        target.searchParams.set("limit", "500");
        const response = await fetch(target, {
          headers: { "X-Appwrite-Project": env.APPWRITE_PROJECT_ID, "X-Appwrite-Key": env.APPWRITE_API_KEY },
        });
        if (!response.ok) return json({ error: "signal_history_read_failed" }, 503, cors);
        const payload = await response.json() as { rows?: Array<Record<string, unknown>> };
        const rows = (payload.rows || []).filter(row => row.user_id === account.$id).map(row => {
          const record = { ...row };
          for (const key of ["$id", "$createdAt", "$updatedAt", "$permissions", "user_id"]) delete record[key];
          return record;
        });
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
        const timeframeSeconds: Record<string, number> = { M1: 60, M5: 300, M15: 900, M30: 1800, H1: 3600, H2: 7200, H3: 10800, H4: 14400, H6: 21600, H8: 28800, H12: 43200, D1: 86400, W1: 604800 };
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


    if (url.pathname === "/api/brokers/binance-spot/connect" && request.method === "POST") {
      try {
        const account = await authenticate(request, env);
        if (!account) return json({ error: "unauthorized" }, 401, cors);
        const configured = env as BrokerEnv;
        if (!configured.BINANCE_SPOT_CREDENTIALS_TABLE_ID || !configured.BROKER_TOKEN_ENCRYPTION_KEY || !configured.APPWRITE_API_KEY) return json({ error: "binance_spot_not_configured" }, 503, cors);
        const body = await request.json().catch(() => null) as { apiKey?: string; apiSecret?: string } | null;
        const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
        const apiSecret = typeof body?.apiSecret === "string" ? body.apiSecret.trim() : "";
        if (apiKey.length < 16 || apiKey.length > 256 || apiSecret.length < 16 || apiSecret.length > 512) return json({ error: "invalid_binance_credentials" }, 400, cors);
        const verified = await binanceSpotAccount(apiKey, apiSecret);
        const encryptedKey = await encryptBrokerToken(apiKey, configured.BROKER_TOKEN_ENCRYPTION_KEY);
        const encryptedSecret = await encryptBrokerToken(apiSecret, configured.BROKER_TOKEN_ENCRYPTION_KEY);
        await binanceSpotRow(configured, account.$id, "PATCH", { user_id: account.$id, encrypted_api_key: encryptedKey, encrypted_api_secret: encryptedSecret, api_key_last4: apiKey.slice(-4), status: "connected", verified_at: new Date().toISOString(), can_trade: verified.canTrade, can_withdraw: verified.canWithdraw });
        return json({ connected: true, provider: "binance_spot", apiKeyLast4: apiKey.slice(-4), accountType: verified.accountType || null, tradingEnabled: false }, 200, cors);
      } catch (error) {
        const code = error instanceof Error ? error.message : "binance_spot_connection_failed";
        const status = code === "binance_spot_not_configured" ? 503 : code.startsWith("invalid_") ? 400 : 502;
        return json({ error: code }, status, cors);
      }
    }

    if (url.pathname === "/api/brokers/binance-spot/status" && request.method === "GET") {
      try {
        const account = await authenticate(request, env);
        if (!account) return json({ error: "unauthorized" }, 401, cors);
        const configured = env as BrokerEnv;
        if (!configured.BINANCE_SPOT_CREDENTIALS_TABLE_ID || !configured.APPWRITE_API_KEY) return json({ error: "binance_spot_not_configured" }, 503, cors);
        const row = await binanceSpotRow(configured, account.$id, "GET") as { user_id?: string; api_key_last4?: string; status?: string; verified_at?: string } | null;
        if (!row) return json({ connected: false, status: "not_connected", tradingEnabled: false }, 200, cors);
        if (row.user_id !== account.$id) return json({ error: "binance_spot_ownership_mismatch" }, 403, cors);
        return json({ connected: row.status === "connected", status: row.status || "unknown", apiKeyLast4: row.api_key_last4 || null, verifiedAt: row.verified_at || null, tradingEnabled: false }, 200, cors);
      } catch { return json({ error: "binance_spot_status_failed" }, 503, cors); }
    }

    if (url.pathname === "/api/brokers/binance-spot/disconnect" && request.method === "POST") {
      try {
        const account = await authenticate(request, env);
        if (!account) return json({ error: "unauthorized" }, 401, cors);
        const configured = env as BrokerEnv;
        if (!configured.BINANCE_SPOT_CREDENTIALS_TABLE_ID || !configured.APPWRITE_API_KEY) return json({ error: "binance_spot_not_configured" }, 503, cors);
        const row = await binanceSpotRow(configured, account.$id, "GET") as { user_id?: string } | null;
        if (row && row.user_id !== account.$id) return json({ error: "binance_spot_ownership_mismatch" }, 403, cors);
        await binanceSpotRow(configured, account.$id, "DELETE");
        return json({ disconnected: true, providerKeyRevoked: false, note: "The encrypted local copy was deleted. Revoke this API key in Binance API Management as well." }, 200, cors);
      } catch { return json({ error: "binance_spot_disconnect_failed" }, 503, cors); }
    }
    if (url.pathname === "/api/brokers/deriv/connect" && request.method === "POST") {
      try {
        const account = await authenticate(request, env);
        if (!account) return json({ error: "unauthorized" }, 401, cors);
        const body = await request.json().catch(() => ({})) as { redirectPath?: string };
        const result = await startDerivOAuth(env as BrokerEnv, account, typeof body.redirectPath === "string" ? body.redirectPath : "/");
        return json(result, 200, cors);
      } catch (error) {
        const message = error instanceof Error ? error.message : "deriv_connect_failed";
        return json({ error: message }, message === "deriv_oauth_not_configured" ? 503 : 500, cors);
      }
    }
    if (url.pathname === "/api/brokers/deriv/callback" && request.method === "GET") {
      try { return await handleDerivCallback(request, env); }
      catch { return json({ error: "deriv_callback_failed" }, 500); }
    }
    if (url.pathname === "/api/brokers/deriv/status" && request.method === "GET") {
      try {
        const account = await authenticate(request, env);
        if (!account) return json({ error: "unauthorized" }, 401, cors);
        const configured = env as BrokerEnv;
        if (!configured.DERIV_GRANTS_TABLE_ID || !configured.BROKER_TOKEN_ENCRYPTION_KEY) return json({ error: "deriv_not_configured" }, 503, cors);
        const grantId = account.$id.replace(/-/g, "").slice(0, 32);
        const grant = await derivRow(configured, configured.DERIV_GRANTS_TABLE_ID, grantId, "GET") as { user_id?: string; encrypted_access_token?: string; token_expires_at?: string; accounts_json?: string; selected_account_id?: string; status?: string } | null;
        if (!grant) return json({ connected: false, status: "not_connected", accounts: [], tradingEnabled: false }, 200, cors);
        if (grant.user_id !== account.$id) return json({ error: "deriv_ownership_mismatch" }, 403, cors);
        const expired = !grant.token_expires_at || Date.parse(grant.token_expires_at) <= Date.now() + 60_000;
        let accounts: unknown[] = [];
        try { accounts = JSON.parse(grant.accounts_json || "[]") as unknown[]; } catch { accounts = []; }
        return json({ connected: !expired, status: expired ? "reconnect_required" : grant.status || "connected", expiresAt: grant.token_expires_at, accounts, selectedAccountId: grant.selected_account_id || "", tradingEnabled: false }, 200, cors);
      } catch { return json({ error: "deriv_status_failed" }, 503, cors); }
    }
    if (url.pathname === "/api/brokers/deriv/select-account" && request.method === "POST") {
      try {
        const account = await authenticate(request, env);
        if (!account) return json({ error: "unauthorized" }, 401, cors);
        const configured = env as BrokerEnv;
        if (!configured.DERIV_GRANTS_TABLE_ID || !configured.BROKER_TOKEN_ENCRYPTION_KEY) return json({ error: "deriv_not_configured" }, 503, cors);
        const body = await request.json().catch(() => ({})) as { accountId?: string };
        const accountId = typeof body.accountId === "string" ? body.accountId : "";
        const grantId = account.$id.replace(/-/g, "").slice(0, 32);
        const grant = await derivRow(configured, configured.DERIV_GRANTS_TABLE_ID, grantId, "GET") as { user_id?: string; encrypted_access_token?: string; accounts_json?: string; token_expires_at?: string } | null;
        if (!grant || grant.user_id !== account.$id || !grant.encrypted_access_token) return json({ error: "deriv_not_connected" }, 404, cors);
        if (!grant.token_expires_at || Date.parse(grant.token_expires_at) <= Date.now()) return json({ error: "deriv_authorization_expired" }, 401, cors);
        const list = JSON.parse(grant.accounts_json || "[]") as Array<{ accountId: string }>;
        if (!list.some(item => item.accountId === accountId)) return json({ error: "deriv_account_not_authorized" }, 403, cors);
        await derivRow(configured, configured.DERIV_GRANTS_TABLE_ID, grantId, "PATCH", { selected_account_id: accountId });
        return json({ selectedAccountId: accountId, tradingEnabled: false }, 200, cors);
      } catch { return json({ error: "deriv_account_selection_failed" }, 503, cors); }
    }
    if (url.pathname === "/api/brokers/deriv/disconnect" && request.method === "POST") {
      try {
        const account = await authenticate(request, env);
        if (!account) return json({ error: "unauthorized" }, 401, cors);
        const configured = env as BrokerEnv;
        if (!configured.DERIV_GRANTS_TABLE_ID) return json({ error: "deriv_not_configured" }, 503, cors);
        const grantId = account.$id.replace(/-/g, "").slice(0, 32);
        const grant = await derivRow(configured, configured.DERIV_GRANTS_TABLE_ID, grantId, "GET") as { user_id?: string } | null;
        if (grant && grant.user_id !== account.$id) return json({ error: "deriv_ownership_mismatch" }, 403, cors);
        await derivRow(configured, configured.DERIV_GRANTS_TABLE_ID, grantId, "DELETE");
        return json({ disconnected: true, providerTokenRevoked: false, tradingEnabled: false, note: "The local encrypted token was deleted. Revoke SuperTech AI access in your Deriv account settings as well." }, 200, cors);
      } catch { return json({ error: "deriv_disconnect_failed" }, 503, cors); }
    }

    if (url.pathname === "/api/brokers/binance-futures/connect" && request.method === "POST") {
      try {
        const account = await authenticate(request, env);
        if (!account) return json({ error: "unauthorized" }, 401, cors);
        const configured = env as BrokerEnv;
        if (!configured.BINANCE_FUTURES_CREDENTIALS_TABLE_ID || !configured.BROKER_TOKEN_ENCRYPTION_KEY || !configured.APPWRITE_API_KEY) return json({ error: "binance_futures_not_configured" }, 503, cors);
        const body = await request.json().catch(() => null) as { apiKey?: string; apiSecret?: string } | null;
        const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
        const apiSecret = typeof body?.apiSecret === "string" ? body.apiSecret.trim() : "";
        if (apiKey.length < 16 || apiKey.length > 256 || apiSecret.length < 16 || apiSecret.length > 512) return json({ error: "invalid_binance_credentials" }, 400, cors);
        const verified = await binanceFuturesAccount(apiKey, apiSecret);
        const encryptedKey = await encryptBrokerToken(apiKey, configured.BROKER_TOKEN_ENCRYPTION_KEY);
        const encryptedSecret = await encryptBrokerToken(apiSecret, configured.BROKER_TOKEN_ENCRYPTION_KEY);
        await binanceSpotRow({ ...configured, BINANCE_SPOT_CREDENTIALS_TABLE_ID: configured.BINANCE_FUTURES_CREDENTIALS_TABLE_ID }, account.$id, "PATCH", { user_id: account.$id, encrypted_api_key: encryptedKey, encrypted_api_secret: encryptedSecret, api_key_last4: apiKey.slice(-4), status: "connected", verified_at: new Date().toISOString(), can_trade: verified.canTrade, can_withdraw: verified.canWithdraw });
        return json({ connected: true, provider: "binance_futures", apiKeyLast4: apiKey.slice(-4), tradingEnabled: false }, 200, cors);
      } catch (error) {
        const code = error instanceof Error ? error.message : "binance_futures_connection_failed";
        const status = code === "binance_futures_not_configured" ? 503 : code.startsWith("invalid_") ? 400 : 502;
        return json({ error: code }, status, cors);
      }
    }

    if (url.pathname === "/api/brokers/binance-futures/status" && request.method === "GET") {
      try {
        const account = await authenticate(request, env);
        if (!account) return json({ error: "unauthorized" }, 401, cors);
        const configured = env as BrokerEnv;
        if (!configured.BINANCE_FUTURES_CREDENTIALS_TABLE_ID || !configured.APPWRITE_API_KEY) return json({ error: "binance_futures_not_configured" }, 503, cors);
        const row = await binanceSpotRow({ ...configured, BINANCE_SPOT_CREDENTIALS_TABLE_ID: configured.BINANCE_FUTURES_CREDENTIALS_TABLE_ID }, account.$id, "GET") as { user_id?: string; api_key_last4?: string; status?: string; verified_at?: string } | null;
        if (!row) return json({ connected: false, status: "not_connected", tradingEnabled: false }, 200, cors);
        if (row.user_id !== account.$id) return json({ error: "binance_futures_ownership_mismatch" }, 403, cors);
        return json({ connected: row.status === "connected", status: row.status || "unknown", apiKeyLast4: row.api_key_last4 || null, verifiedAt: row.verified_at || null, tradingEnabled: false }, 200, cors);
      } catch { return json({ error: "binance_futures_status_failed" }, 503, cors); }
    }

    if (url.pathname === "/api/brokers/binance-futures/disconnect" && request.method === "POST") {
      try {
        const account = await authenticate(request, env);
        if (!account) return json({ error: "unauthorized" }, 401, cors);
        const configured = env as BrokerEnv;
        if (!configured.BINANCE_FUTURES_CREDENTIALS_TABLE_ID || !configured.APPWRITE_API_KEY) return json({ error: "binance_futures_not_configured" }, 503, cors);
        const row = await binanceSpotRow({ ...configured, BINANCE_SPOT_CREDENTIALS_TABLE_ID: configured.BINANCE_FUTURES_CREDENTIALS_TABLE_ID }, account.$id, "GET") as { user_id?: string } | null;
        if (row && row.user_id !== account.$id) return json({ error: "binance_futures_ownership_mismatch" }, 403, cors);
        await binanceSpotRow({ ...configured, BINANCE_SPOT_CREDENTIALS_TABLE_ID: configured.BINANCE_FUTURES_CREDENTIALS_TABLE_ID }, account.$id, "DELETE");
        return json({ disconnected: true, providerKeyRevoked: false, note: "The encrypted local copy was deleted. Revoke this API key in Binance API Management as well." }, 200, cors);
      } catch { return json({ error: "binance_futures_disconnect_failed" }, 503, cors); }
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
        const grant = await response.json() as { user_id?: string; token_expires_at?: string; status?: string; accounts_json?: string; selected_account_id?: string; permission_scope?: string };
        if (grant.user_id !== account.$id) return json({ error: "ctrader_grant_ownership_mismatch" }, 403, cors);
        let accounts: unknown[] = [];
        try { const parsed = JSON.parse(grant.accounts_json || "[]"); if (Array.isArray(parsed)) accounts = parsed.slice(0, 100); } catch { accounts = []; }
        return json({ connected: true, tokenExpiresAt: grant.token_expires_at || null, status: grant.status || "connected", accounts, selectedAccountId: grant.selected_account_id || null, permissionScope: grant.permission_scope || null }, 200, cors);
      } catch {
        return json({ error: "ctrader_status_failed" }, 503, cors);
      }
    }

    if (url.pathname === "/api/brokers/ctrader/discover" && request.method === "POST") {
      try {
        const account = await authenticate(request, env);
        if (!account) return json({ error: "unauthorized" }, 401, cors);
        const configured = env as BrokerEnv;
        if (!configured.CTRADER_GRANTS_TABLE_ID || !configured.APPWRITE_API_KEY || !configured.CTRADER_CLIENT_ID || !configured.CTRADER_CLIENT_SECRET || !configured.BROKER_TOKEN_ENCRYPTION_KEY) return json({ error: "ctrader_discovery_not_configured" }, 503, cors);
        const grantId = account.$id.replace(/-/g, "").slice(0, 32);
        const grant = await appwriteRow(configured, configured.CTRADER_GRANTS_TABLE_ID, grantId, "GET") as { user_id?: string; encrypted_access_token?: string } | null;
        if (!grant || grant.user_id !== account.$id || !grant.encrypted_access_token) return json({ error: "ctrader_not_connected" }, 404, cors);
        const accessToken = await decryptBrokerToken(grant.encrypted_access_token, configured.BROKER_TOKEN_ENCRYPTION_KEY);
        const discovered: Array<{ accountId: string; isLive: boolean; traderLogin: string | null; broker: string; accountType: string | null; permissionScope: string }> = [];
        let lastError: unknown = null;
        for (const host of ["live.ctraderapi.com", "demo.ctraderapi.com"]) {
          let socket: WebSocket | null = null;
          try {
            socket = await openCTraderSocket(host);
            await authenticateCTraderApplication(socket, configured);
            const response = await sendCTraderJsonMessage(socket, 2149, { accessToken }, 2150);
            const rows = Array.isArray(response.ctidTraderAccount) ? response.ctidTraderAccount as Array<Record<string, unknown>> : [];
            for (const item of rows) {
              const accountId = String(item.ctidTraderAccountId || "");
              if (!/^\d{1,20}$/.test(accountId)) continue;
              const isLive = item.isLive === true;
              if ((host.startsWith("live") && !isLive) || (host.startsWith("demo") && isLive)) continue;
              discovered.push({ accountId, isLive, traderLogin: item.traderLogin == null ? null : String(item.traderLogin), broker: String(item.brokerTitleShort || item.brokerName || "cTrader broker").slice(0, 100), accountType: item.accountType == null ? null : ((["HEDGED", "NETTED", "SPREAD_BETTING"] as string[])[Number(item.accountType)] || "UNKNOWN"), permissionScope: Number(response.permissionScope) === 1 ? "SCOPE_TRADE" : Number(response.permissionScope) === 0 ? "SCOPE_VIEW" : "unknown" });
            }
          } catch (error) { lastError = error; }
          finally { try { socket?.close(1000, "account discovery complete"); } catch { /* ignore close errors */ } }
        }
        const unique = [...new Map(discovered.map(item => [item.accountId, item])).values()].slice(0, 100);
        if (!unique.length && lastError) return json({ error: "ctrader_account_discovery_failed" }, 502, cors);
        const scope = unique.some(item => item.permissionScope.includes("TRADE")) ? "SCOPE_TRADE" : unique[0]?.permissionScope || "unknown";
        const base = `${configured.APPWRITE_ENDPOINT.replace(/\/$/, "")}/tablesdb/${configured.APPWRITE_DATABASE_ID}/tables/${configured.CTRADER_GRANTS_TABLE_ID}/rows/${encodeURIComponent(grantId)}`;
        const saved = await fetch(base, { method: "PATCH", headers: { "X-Appwrite-Project": configured.APPWRITE_PROJECT_ID, "X-Appwrite-Key": configured.APPWRITE_API_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ data: { accounts_json: JSON.stringify(unique), accounts_discovered_at: new Date().toISOString(), permission_scope: scope, status: unique.length ? "accounts_discovered" : "no_accounts_found" }, permissions: [] }) });
        if (!saved.ok) return json({ error: "ctrader_account_storage_failed" }, 503, cors);
        return json({ accounts: unique, permissionScope: scope, tradingEnabled: false }, 200, cors);
      } catch { return json({ error: "ctrader_account_discovery_failed" }, 503, cors); }
    }

    if (url.pathname === "/api/brokers/ctrader/select-account" && request.method === "POST") {
      try {
        const account = await authenticate(request, env);
        if (!account) return json({ error: "unauthorized" }, 401, cors);
        const configured = env as BrokerEnv;
        if (!configured.CTRADER_GRANTS_TABLE_ID || !configured.APPWRITE_API_KEY || !configured.CTRADER_CLIENT_ID || !configured.CTRADER_CLIENT_SECRET || !configured.BROKER_TOKEN_ENCRYPTION_KEY) return json({ error: "ctrader_account_selection_not_configured" }, 503, cors);
        const body = await request.json().catch(() => null) as { accountId?: string } | null;
        const accountId = String(body?.accountId || "");
        if (!/^\d{1,20}$/.test(accountId) || !Number.isSafeInteger(Number(accountId))) return json({ error: "invalid_ctrader_account_id" }, 400, cors);
        const grantId = account.$id.replace(/-/g, "").slice(0, 32);
        const grant = await appwriteRow(configured, configured.CTRADER_GRANTS_TABLE_ID, grantId, "GET") as { user_id?: string; encrypted_access_token?: string; accounts_json?: string } | null;
        if (!grant || grant.user_id !== account.$id || !grant.encrypted_access_token) return json({ error: "ctrader_not_connected" }, 404, cors);
        let accounts: Array<{ accountId: string; isLive: boolean; traderLogin: string | null; broker: string; accountType: string | null; permissionScope: string }> = [];
        try { accounts = JSON.parse(grant.accounts_json || "[]") as typeof accounts; } catch { accounts = []; }
        const selected = accounts.find(item => item.accountId === accountId);
        if (!selected) return json({ error: "ctrader_account_not_authorized_for_member" }, 403, cors);
        const accessToken = await decryptBrokerToken(grant.encrypted_access_token, configured.BROKER_TOKEN_ENCRYPTION_KEY);
        const socket = await openCTraderSocket(selected.isLive ? "live.ctraderapi.com" : "demo.ctraderapi.com");
        try {
          await authenticateCTraderApplication(socket, configured);
          await sendCTraderJsonMessage(socket, 2102, { ctidTraderAccountId: Number(accountId), accessToken }, 2103);
        } finally { try { socket.close(1000, "account authorized"); } catch { /* ignore close errors */ } }
        const endpoint = `${configured.APPWRITE_ENDPOINT.replace(/\/$/, "")}/tablesdb/${configured.APPWRITE_DATABASE_ID}/tables/${configured.CTRADER_GRANTS_TABLE_ID}/rows/${encodeURIComponent(grantId)}`;
        const saved = await fetch(endpoint, { method: "PATCH", headers: { "X-Appwrite-Project": configured.APPWRITE_PROJECT_ID, "X-Appwrite-Key": configured.APPWRITE_API_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ data: { selected_account_id: accountId, selected_account_is_live: selected.isLive, status: "account_authorized" }, permissions: [] }) });
        if (!saved.ok) return json({ error: "ctrader_selected_account_storage_failed" }, 503, cors);
        return json({ selectedAccount: selected, tradingEnabled: false }, 200, cors);
      } catch { return json({ error: "ctrader_account_authorization_failed" }, 502, cors); }
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
          mt5: false, binance_spot: Boolean(configured.BINANCE_SPOT_CREDENTIALS_TABLE_ID && configured.BROKER_TOKEN_ENCRYPTION_KEY && configured.APPWRITE_API_KEY), deriv_options: Boolean(configured.DERIV_CLIENT_ID && configured.DERIV_REDIRECT_URI && configured.DERIV_OAUTH_STATES_TABLE_ID && configured.DERIV_GRANTS_TABLE_ID && configured.BROKER_TOKEN_ENCRYPTION_KEY && configured.APPWRITE_API_KEY), binance_futures: Boolean(configured.BINANCE_FUTURES_CREDENTIALS_TABLE_ID && configured.BROKER_TOKEN_ENCRYPTION_KEY && configured.APPWRITE_API_KEY), okx_futures: false,
        },
        executionEnabled: false,
        note: "Provider execution remains disabled until each provider's account, risk, order, and reconciliation tables pass security checks.",
      }, 200, cors);
    }

    if (url.pathname === "/api/market/crypto-movers" && request.method === "GET") {
      const providers = [
        {
          name: "binance",
          load: async () => {
            const hosts = ["https://data-api.binance.vision", "https://api.binance.com", "https://api1.binance.com", "https://api2.binance.com"];
            let lastError: unknown = null;
            for (const host of hosts) {
              try {
                const response = await fetch(host + "/api/v3/ticker/24hr", { headers: { accept: "application/json" }, signal: AbortSignal.timeout(7000) });
                if (!response.ok) throw new Error("provider_http_" + response.status);
                const rows = await response.json() as Array<{ symbol: string; openPrice: string; lastPrice: string; priceChangePercent: string; quoteVolume: string }>;
                if (!Array.isArray(rows)) throw new Error("invalid_provider_payload");
                return rows.map(row => ({ symbol: row.symbol, open: Number(row.openPrice), close: Number(row.lastPrice), changePct: Number(row.priceChangePercent), quoteVolume: Number(row.quoteVolume) }));
              } catch (error) { lastError = error; }
            }
            throw lastError || new Error("binance_unavailable");
          },
        },
        {
          name: "bybit",
          load: async () => {
            const response = await fetch("https://api.bybit.com/v5/market/tickers?category=spot", { headers: { accept: "application/json" }, signal: AbortSignal.timeout(7000) });
            if (!response.ok) throw new Error("provider_http_" + response.status);
            const payload = await response.json() as { retCode: number; result?: { list?: Array<{ symbol: string; prevPrice24h: string; lastPrice: string; price24hPcnt: string; turnover24h: string }> } };
            if (payload.retCode !== 0 || !Array.isArray(payload.result?.list)) throw new Error("invalid_provider_payload");
            return payload.result.list.map(row => ({ symbol: row.symbol, open: Number(row.prevPrice24h), close: Number(row.lastPrice), changePct: Number(row.price24hPcnt) * 100, quoteVolume: Number(row.turnover24h) }));
          },
        },
        {
          name: "okx",
          load: async () => {
            const response = await fetch("https://www.okx.com/api/v5/market/tickers?instType=SPOT", { headers: { accept: "application/json" }, signal: AbortSignal.timeout(7000) });
            if (!response.ok) throw new Error("provider_http_" + response.status);
            const payload = await response.json() as { code: string; data?: Array<{ instId: string; open24h: string; last: string; volCcy24h: string; vol24h: string }> };
            if (payload.code !== "0" || !Array.isArray(payload.data)) throw new Error("invalid_provider_payload");
            return payload.data.map(row => ({ symbol: row.instId.replace("-", ""), open: Number(row.open24h), close: Number(row.last), changePct: Number(row.open24h) > 0 ? (Number(row.last) / Number(row.open24h) - 1) * 100 : NaN, quoteVolume: Number(row.volCcy24h) || Number(row.vol24h) * Number(row.last) }));
          },
        },
      ];
      const excluded = new Set(["USDC", "USDT", "BUSD", "TUSD", "FDUSD", "DAI", "USDP", "EUR", "GBP", "AEUR", "PAXG"]);
      const failures: string[] = [];
      for (const provider of providers) {
        try {
          const raw = await provider.load();
          const movers = raw.filter(row => {
            if (!row.symbol.endsWith("USDT")) return false;
            const base = row.symbol.slice(0, -4);
            return base.length > 1 && !excluded.has(base) && !/(UP|DOWN|BULL|BEAR)$/.test(base)
              && row.open > 0 && row.close > 0 && Number.isFinite(row.changePct) && row.quoteVolume > 0;
          }).sort((a, b) => b.quoteVolume - a.quoteVolume).slice(0, 200)
            .map((row, index) => ({ ...row, base: row.symbol.slice(0, -4), volumeRank: index + 1 }));
          if (movers.length < 10) throw new Error("insufficient_valid_markets");
          return json({ provider: provider.name, updatedAt: new Date().toISOString(), marketDay: "rolling_24h", movers }, 200, {
            ...cors,
            "cache-control": "public, max-age=10, stale-while-revalidate=20",
          });
        } catch (error) {
          failures.push(provider.name + ":" + (error instanceof Error ? error.message : "unavailable"));
        }
      }
      return json({ error: "all_market_providers_unavailable", providers: failures, staleData: false }, 503, cors);
    }

    return json({ error: "not_found" }, 404, cors);
  },
};
