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

function withCors(response: Response, cors: HeadersInit): Response {\n  const headers = new Headers(response.headers);\n  new Headers(cors).forEach((value, key) => headers.set(key, value));\n  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });\n}\n\nfunction corsHeaders(origin: string, allowedOrigin: string): HeadersInit {
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
  const match = authorization.match(/^Bearer\\s+(.+)$/i);
  if (!match) return null;

  const endpoint = env.APPWRITE_ENDPOINT.replace(/\\/$/, "");
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

  const endpoint = env.APPWRITE_ENDPOINT.replace(/\\/$/, "");
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

    return json({ error: "not_found" }, 404, cors);
  },
};
