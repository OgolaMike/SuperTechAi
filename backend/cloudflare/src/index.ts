import { Client } from "@neondatabase/serverless";

interface Env {
  DATABASE_URL?: string;
  APP_ORIGIN?: string;
  ENVIRONMENT?: string;
}

const jsonHeaders = { "content-type": "application/json; charset=utf-8" };

function corsHeaders(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get("Origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin",
  };
  if (origin && env.APP_ORIGIN && origin === env.APP_ORIGIN) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function respond(request: Request, env: Env, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...jsonHeaders, ...corsHeaders(request, env) },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    if (url.pathname === "/health" && request.method === "GET") {
      if (!env.DATABASE_URL) {
        return respond(request, env, {
          ok: false,
          service: "supertechai-api",
          database: "not_configured",
          environment: env.ENVIRONMENT ?? "unconfigured",
        }, 503);
      }

      const client = new Client(env.DATABASE_URL);
      try {
        await client.connect();
        const result = await client.query("select now() as database_time");
        return respond(request, env, {
          ok: true,
          service: "supertechai-api",
          database: "connected",
          databaseTime: result.rows[0]?.database_time ?? null,
          environment: env.ENVIRONMENT ?? "unconfigured",
        });
      } catch {
        return respond(request, env, {
          ok: false,
          service: "supertechai-api",
          database: "connection_failed",
          environment: env.ENVIRONMENT ?? "unconfigured",
        }, 503);
      } finally {
        try { await client.end(); } catch { /* connection may not have opened */ }
      }
    }

    if (url.pathname.startsWith("/api/")) {
      return respond(request, env, {
        error: "route_not_migrated",
        message: "This API route is not enabled until its authorization and data contract have been migrated and tested.",
      }, 501);
    }

    return respond(request, env, { service: "supertechai-api", status: "ready", health: "/health" });
  },
} satisfies ExportedHandler<Env>;
