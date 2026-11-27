import { handleCompanyOwnerRequest, handleReferralRequest } from "./referrals";
import { handleMembershipRequest, hasAutomationEntitlement } from "./membership";
import { handleAlertPreferences } from "./preferences";

export interface Env {
  APPWRITE_ENDPOINT: string;
  APPWRITE_PROJECT_ID: string;
  APPWRITE_DATABASE_ID: string;
  MEMBER_PROFILES_TABLE_ID: string;
  MEMBER_NETWORK_TABLE_ID?: string;
  MEMBERSHIP_TABLE_ID?: string;
  GENESIS_ACCOUNT_ID?: string;
  GENESIS_ADMIN_TOKEN?: string;
  ALLOWED_ORIGIN: string;
  APPWRITE_API_KEY?: string;
  PUSH_SUBSCRIPTIONS_TABLE_ID?: string;
  ALERT_PREFERENCES_TABLE_ID?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
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



type PushEnv = Env;
const base64Url = (value: string) => value.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const encodeJson = (value: unknown) => base64Url(btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value)))));
function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}
async function sendWebPush(endpoint: string, env: PushEnv): Promise<void> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) throw new Error("push_sender_not_configured");
  const audience = new URL(endpoint).origin;
  const unsigned = `${encodeJson({ typ: "JWT", alg: "ES256" })}.${encodeJson({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, sub: env.VAPID_SUBJECT })}`;
  const key = await crypto.subtle.importKey("pkcs8", decodeBase64Url(env.VAPID_PRIVATE_KEY), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(unsigned));
  const token = `${unsigned}.${base64Url(btoa(String.fromCharCode(...new Uint8Array(signature))))}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${token}, k=${env.VAPID_PUBLIC_KEY}`,
      TTL: "60",
      Urgency: "high",
    },
  });
  if (!response.ok && response.status !== 201 && response.status !== 202) throw new Error(`push_provider_rejected_${response.status}`);
}
async function pushRow(env: PushEnv, rowId: string, method: string, data?: Record<string, unknown>) {
  if (!env.APPWRITE_API_KEY || !env.PUSH_SUBSCRIPTIONS_TABLE_ID || !env.APPWRITE_DATABASE_ID) throw new Error("push_storage_not_configured");
  const base = `${env.APPWRITE_ENDPOINT.replace(/\/$/, "")}/tablesdb/${env.APPWRITE_DATABASE_ID}/tables/${env.PUSH_SUBSCRIPTIONS_TABLE_ID}/rows`;
  const response = await fetch(method === "POST" ? base : `${base}/${encodeURIComponent(rowId)}`, {
    method,
    headers: { "X-Appwrite-Project": env.APPWRITE_PROJECT_ID, "X-Appwrite-Key": env.APPWRITE_API_KEY, "Content-Type": "application/json" },
    ...(data ? { body: JSON.stringify(method === "POST" ? { rowId, data, permissions: [] } : { data, permissions: [] }) } : {}),
  });
  if (!response.ok && !(method === "GET" && response.status === 404)) throw new Error(`push_storage_failed_${response.status}`);
  return response.status === 404 ? null : await response.json() as { $id: string; user_id?: string; endpoint?: string };
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
    if (url.pathname.startsWith("/api/brokers/") && url.pathname !== "/api/brokers/ctrader/callback") {
      try {
        const account = await authenticate(request, env);
        if (!account) return json({ error: "unauthorized" }, 401, cors);
        if (!(await hasAutomationEntitlement(env, account))) return json({ error: "automation_membership_required" }, 403, cors);
      } catch {
        return json({ error: "membership_service_unavailable" }, 503, cors);
      }
    }
    if (url.pathname.startsWith("/api/membership/") || url.pathname.startsWith("/api/admin/members")) {
      try {
        const account = await authenticate(request, env);
        if (!account) return json({ error: "unauthorized" }, 401, cors);
        const response = await handleMembershipRequest(request, env, account);
        if (response) return withCors(response, cors);
      } catch {
        return json({ error: "membership_service_unavailable" }, 503, cors);
      }
    }
    if (url.pathname === "/api/company/owners") {
      const response = await handleCompanyOwnerRequest(request, env);
      if (response) return withCors(response, cors);
    }
    if (url.pathname === "/api/preferences/alerts") {
      try {
        const account = await authenticate(request, env);
        if (!account) return json({ error: "unauthorized" }, 401, cors);
        const response = await handleAlertPreferences(request, env, account);
        if (response) return withCors(response, cors);
      } catch {
        return json({ error: "alert_preferences_service_unavailable" }, 503, cors);
      }
    }
    if (url.pathname.startsWith("/api/referrals/")) {
      try {
        const account = await authenticate(request, env);
        if (!account) return json({ error: "unauthorized" }, 401, cors);
        const response = await handleReferralRequest(request, env, account);
        if (response) return withCors(response, cors);
      } catch {
        return json({ error: "member_network_unavailable" }, 503, cors);
      }
    }
    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({
        ok: true,
        service: "supertechai-independent-api",
        backend: "appwrite",
        identityReady: true,
        memberProfilesReady: databaseReady(env),
        memberNetworkConfigured: Boolean(env.APPWRITE_API_KEY && env.MEMBER_NETWORK_TABLE_ID && env.GENESIS_ACCOUNT_ID && env.GENESIS_ADMIN_TOKEN),
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



    if (url.pathname === "/api/referrals/network" && request.method === "GET") {
      try {
        const account = await authenticate(request, env);
        if (!account) return json({ error: "verified_account_required" }, 401, cors);
        const tableId = env.REFERRAL_RELATIONSHIPS_TABLE_ID;
        if (!tableId || !env.APPWRITE_API_KEY) return json({ error: "referrals_not_configured" }, 503, cors);
        const base = `${env.APPWRITE_ENDPOINT.replace(/\/$/, "")}/tablesdb/${env.APPWRITE_DATABASE_ID}/tables/${tableId}/rows`;
        const headers = { "X-Appwrite-Project": env.APPWRITE_PROJECT_ID, "X-Appwrite-Key": env.APPWRITE_API_KEY };
        const query = async (column: string, value: string) => {
          const u = new URL(base);
          u.searchParams.set("queries[]", JSON.stringify({ method: "equal", column, values: [value] }));
          const r = await fetch(u, { headers });
          if (!r.ok) throw new Error("referral_network_lookup_failed");
          return (await r.json() as { rows?: Array<Record<string, string | undefined>> }).rows || [];
        };
        const mine = (await query("referred_user_id", account.$id)).find(x => x.row_type === "relationship");
        const ownerId = mine?.team_owner_id || account.$id;
        const teamRows = (await query("team_owner_id", ownerId)).filter(x => x.row_type === "relationship" && x.status === "active");
        const directRows = teamRows.filter(x => x.referrer_user_id === account.$id);
        return json({ teamOwnerId: ownerId, directCount: directRows.length, teamCount: teamRows.length, members: teamRows.slice(0, 500).map(x => ({ memberId: x.referred_user_id, sponsorId: x.referrer_user_id, role: x.role || "member", joinedAt: x.attributed_at || "" })) }, 200, cors);
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : "referral_network_failed" }, 503, cors);
      }
    }

    // Referral codes and sponsor attribution are server-owned.
    if ((url.pathname === "/api/referrals/me" && request.method === "GET") ||
        ((url.pathname === "/api/referrals/activate" || url.pathname === "/api/referrals/attribute") && request.method === "POST")) {
      try {
        const account = await authenticate(request, env);
        if (!account) return json({ error: "verified_account_required" }, 401, cors);
        const tableId = env.REFERRAL_RELATIONSHIPS_TABLE_ID;
        if (!tableId || !env.APPWRITE_API_KEY) return json({ error: "referrals_not_configured" }, 503, cors);
        const base = `${env.APPWRITE_ENDPOINT.replace(/\/$/, "")}/tablesdb/${env.APPWRITE_DATABASE_ID}/tables/${tableId}/rows`;
        const headers = { "X-Appwrite-Project": env.APPWRITE_PROJECT_ID, "X-Appwrite-Key": env.APPWRITE_API_KEY, "Content-Type": "application/json" };
        const getRow = async (id: string) => {
          const r = await fetch(`${base}/${encodeURIComponent(id)}`, { headers });
          if (r.status === 404) return null;
          if (!r.ok) throw new Error("referral_lookup_failed");
          return await r.json() as Record<string, string | undefined>;
        };
        const queryRows = async (column: string, value: string) => {
          const u = new URL(base);
          u.searchParams.set("queries[]", JSON.stringify({ method: "equal", column, values: [value] }));
          const r = await fetch(u, { headers });
          if (!r.ok) throw new Error("referral_lookup_failed");
          return (await r.json() as { rows?: Array<Record<string, string | undefined>> }).rows || [];
        };
        if (url.pathname === "/api/referrals/me") {
          const rel = (await queryRows("referred_user_id", account.$id)).find(x => x.row_type === "relationship");
          const digest = await sha256(account.$id);
          const code = "ST" + digest.slice(0, 34).toUpperCase();
          const codeId = "c" + digest.slice(0, 31);
          let own = await getRow(codeId);
          if (!own) {
            const created = await fetch(base, { method: "POST", headers, body: JSON.stringify({ rowId: codeId, data: { row_type: "code", referral_code: code, user_id: account.$id, team_id: rel?.team_id || undefined, team_owner_id: rel?.team_owner_id || undefined, status: "active", created_at: new Date().toISOString() }, permissions: [] }) });
            if (!created.ok && created.status !== 409) return json({ error: "referral_code_create_failed" }, 503, cors);
            own = await getRow(codeId);
          }
          if (!own || own.user_id !== account.$id || own.referral_code !== code) return json({ error: "referral_code_unavailable" }, 503, cors);
          return json({ assigned: Boolean((rel && rel.status === "active") || (own.team_id && own.team_owner_id)), referralCode: code, sponsorUserId: rel?.referrer_user_id || undefined, teamOwnerId: rel?.team_owner_id || own.team_owner_id || undefined, role: rel?.role || "member", status: rel?.status || (own.team_id ? "active" : "unassigned") }, 200, cors);
        }
        const body = await request.json().catch(() => ({})) as { referralCode?: string };
        const code = String(body.referralCode || "").trim().toUpperCase();
        if (!/^ST[A-F0-9]{34}$/.test(code)) return json({ error: "invalid_referral_code" }, 400, cors);
        const sponsor = (await queryRows("referral_code", code)).find(x => x.row_type === "code" && x.status === "active");
        if (!sponsor?.user_id || !sponsor.team_id || !/^TEAM_[1-5]$/.test(String(sponsor.team_id)) || !sponsor.team_owner_id) return json({ error: "sponsor_team_not_assigned" }, 409, cors);
        if (sponsor.user_id === account.$id) return json({ error: "self_referral_not_allowed" }, 400, cors);
        const relId = "r" + (await sha256(account.$id)).slice(0, 31);
        const prior = await getRow(relId);
        if (prior) {
          if (prior.referred_user_id !== account.$id) return json({ error: "referral_record_conflict" }, 409, cors);
          return json({ assigned: prior.status === "active", sponsorUserId: prior.referrer_user_id, teamOwnerId: prior.team_owner_id, role: "member", status: prior.status }, 200, cors);
        }
        const created = await fetch(base, { method: "POST", headers, body: JSON.stringify({ rowId: relId, data: { row_type: "relationship", referrer_user_id: sponsor.user_id, referred_user_id: account.$id, referral_code: code, team_id: sponsor.team_id, team_owner_id: sponsor.team_owner_id, role: "member", status: "active", attributed_at: new Date().toISOString() }, permissions: [] }) });
        if (!created.ok) return json({ error: "referral_attribution_failed" }, 503, cors);
        const ownDigest = await sha256(account.$id);
        const ownCodeId = "c" + ownDigest.slice(0, 31);
        const ownCode = await getRow(ownCodeId);
        if (ownCode && ownCode.user_id === account.$id) {
          await fetch(`${base}/${encodeURIComponent(ownCodeId)}`, { method: "PATCH", headers, body: JSON.stringify({ data: { team_id: sponsor.team_id, team_owner_id: sponsor.team_owner_id }, permissions: [] }) });
        }
        return json({ assigned: true, sponsorUserId: sponsor.user_id, teamOwnerId: sponsor.team_owner_id, role: "member", status: "active" }, 201, cors);
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : "referral_request_failed" }, 503, cors);
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



    if (url.pathname === "/api/push/config" && request.method === "GET") {
      const account = await authenticate(request, env);
      if (!account) return json({ error: "unauthorized" }, 401, cors);
      const configured = env as PushEnv;
      if (!configured.VAPID_PUBLIC_KEY) return json({ error: "push_sender_not_configured" }, 503, cors);
      return json({ publicKey: configured.VAPID_PUBLIC_KEY }, 200, cors);
    }

    if (url.pathname === "/api/push/subscribe" && request.method === "POST") {
      try {
        const account = await authenticate(request, env);
        if (!account) return json({ error: "unauthorized" }, 401, cors);
        const configured = env as PushEnv;
        if (!configured.PUSH_SUBSCRIPTIONS_TABLE_ID || !configured.APPWRITE_API_KEY || !configured.VAPID_PUBLIC_KEY) {
          return json({ error: "push_storage_not_configured" }, 503, cors);
        }
        const body = await request.json().catch(() => null) as { endpoint?: string } | null;
        if (!body || typeof body.endpoint !== "string" || body.endpoint.length > 4096) return json({ error: "invalid_push_endpoint" }, 400, cors);
        const endpointUrl = new URL(body.endpoint);
        if (endpointUrl.protocol !== "https:" || !["fcm.googleapis.com", "fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"].some((host) => endpointUrl.hostname === host || endpointUrl.hostname.endsWith(`.${host}`))) {
          return json({ error: "unsupported_push_endpoint" }, 400, cors);
        }
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body.endpoint));
        const rowId = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
        const existing = await pushRow(configured, rowId, "GET");
        const rowData = { user_id: account.$id, endpoint: body.endpoint, created_at: new Date().toISOString(), active: true };
        if (existing && existing.user_id !== account.$id) return json({ error: "push_subscription_owner_mismatch" }, 403, cors);
        await pushRow(configured, rowId, existing ? "PATCH" : "POST", rowData);
        return json({ subscribed: true }, 200, cors);
      } catch (error) {
        const message = error instanceof Error ? error.message : "push_subscription_failed";
        return json({ error: message }, message === "push_storage_not_configured" ? 503 : 500, cors);
      }
    }

    if (url.pathname === "/api/push/test" && request.method === "POST") {
      try {
        const account = await authenticate(request, env);
        if (!account) return json({ error: "unauthorized" }, 401, cors);
        const configured = env as PushEnv;
        if (!configured.PUSH_SUBSCRIPTIONS_TABLE_ID || !configured.APPWRITE_API_KEY || !configured.VAPID_PRIVATE_KEY || !configured.VAPID_PUBLIC_KEY || !configured.VAPID_SUBJECT) {
          return json({ error: "push_sender_not_configured" }, 503, cors);
        }
        const queryUrl = new URL(`${configured.APPWRITE_ENDPOINT.replace(/\/$/, "")}/tablesdb/${configured.APPWRITE_DATABASE_ID}/tables/${configured.PUSH_SUBSCRIPTIONS_TABLE_ID}/rows`);
        queryUrl.searchParams.append("queries[]", JSON.stringify({ method: "equal", attribute: "user_id", values: [account.$id] }));
        queryUrl.searchParams.append("queries[]", JSON.stringify({ method: "equal", attribute: "active", values: [true] }));
        const response = await fetch(queryUrl, { headers: { "X-Appwrite-Project": configured.APPWRITE_PROJECT_ID, "X-Appwrite-Key": configured.APPWRITE_API_KEY } });
        if (!response.ok) return json({ error: "push_subscription_lookup_failed" }, 503, cors);
        const result = await response.json() as { rows?: Array<{ user_id: string; endpoint: string }> };
        const rows = (result.rows || []).filter((row) => row.user_id === account.$id && typeof row.endpoint === "string");
        if (!rows.length) return json({ error: "no_active_push_subscription" }, 404, cors);
        const outcomes = await Promise.allSettled(rows.map((row) => sendWebPush(row.endpoint, configured)));
        const sent = outcomes.filter((item) => item.status === "fulfilled").length;
        if (!sent) return json({ error: "push_provider_delivery_failed" }, 502, cors);
        return json({ sent, total: rows.length }, 200, cors);
      } catch (error) {
        const message = error instanceof Error ? error.message : "push_test_failed";
        return json({ error: message }, 503, cors);
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
