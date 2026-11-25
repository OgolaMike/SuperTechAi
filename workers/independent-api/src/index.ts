export interface Env {
  APPWRITE_ENDPOINT: string;
  APPWRITE_PROJECT_ID: string;
  ALLOWED_ORIGIN: string;
}

type AppwriteAccount = {
  $id: string;
  email: string;
  name?: string;
  emailVerification: boolean;
  status: boolean;
};

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });

function corsHeaders(origin: string, allowedOrigin: string): HeadersInit {
  if (!origin || origin !== allowedOrigin) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, OPTIONS",
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("origin") || "";
    const cors = corsHeaders(origin, env.ALLOWED_ORIGIN);

    if (request.method === "OPTIONS") {
      if (origin !== env.ALLOWED_ORIGIN) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({ ok: true, service: "supertechai-independent-api", backend: "appwrite", databaseReady: false }, 200, cors);
    }

    if (url.pathname === "/api/me" && request.method === "GET") {
      if (origin && origin !== env.ALLOWED_ORIGIN) return json({ error: "origin_not_allowed" }, 403);
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

    return json({ error: "not_found" }, 404, cors);
  },
};
