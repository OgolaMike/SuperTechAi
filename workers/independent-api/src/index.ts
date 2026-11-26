export interface Env {
  APPWRITE_ENDPOINT: string;
  APPWRITE_PROJECT_ID: string;
  APPWRITE_DATABASE_ID: string;
  MEMBER_PROFILES_TABLE_ID: string;
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
    "access-control-allow-methods": "GET, PATCH, OPTIONS",
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
      permissions: [`read("user:${account.$id}")`, `update("user:${account.$id}")`],
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
  const payload = await lookup.json() as { rows?: Array<{ $id: string; user_id: string; expires_at: string; consumed_at?: string }> };
  const row = payload.rows?.[0];
  if (!row || row.consumed_at || Date.parse(row.expires_at) <= Date.now()) return json({ error: "oauth_state_expired_or_used" }, 400);
  const consumed = await appwriteRow(env, CTRADER_OAUTH_STATES_TABLE_ID, row.$id, "PATCH", { consumed_at: new Date().toISOString() });
  if (!consumed) return json({ error: "oauth_state_consume_failed" }, 503);
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
  const save = await fetch(base, {
    method: "POST",
    headers: { "X-Appwrite-Project": env.APPWRITE_PROJECT_ID, "X-Appwrite-Key": env.APPWRITE_API_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({
      rowId: grantId,
      data: { user_id: row.user_id, encrypted_access_token: access, encrypted_refresh_token: refresh, token_expires_at: new Date(Date.now() + Math.max(60, Math.min(Number(token.expiresIn) || 3600, 31536000)) * 1000).toISOString(), granted_scopes: "trading", status: "account_discovery_pending" },
      permissions: [`read("user:${row.user_id}")`, `update("user:${row.user_id}")`],
    }),
  });
  if (!save.ok) return json({ error: "ctrader_secure_grant_storage_failed" }, 503);
  return json({ connected: true, next: "account_discovery_required", automated_trading_enabled: false });
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
