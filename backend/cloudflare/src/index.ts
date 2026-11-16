import { neon } from "@neondatabase/serverless";

interface Env {
  DATABASE_URL?: string;
  APP_ORIGIN?: string;
  ENVIRONMENT?: string;
}

const jsonHeaders = { "content-type": "application/json; charset=utf-8" };

function corsHeaders(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get("Origin");
  const allowed = env.APP_ORIGIN && origin === env.APP_ORIGIN ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin",
  };
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

      try {
        const sql = neon(env.DATABASE_URL);
        const rows = await sql("select now() as database_time");
        return respond(request, env, {
          ok: true,
          service: "supertechai-api",
          database: "connected",
          databaseTime: rows[0]?.database_time ?? null,
          environment: env.ENVIRONMENT ?? "unconfigured",
        });
      } catch {
        return respond(request, env, {
          ok: false,
          service: "supertechai-api",
          database: "connection_failed",
          environment: env.ENVIRONMENT ?? "unconfigured",
        }, 503);
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
