export interface Env {
  DB: D1Database;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method !== "GET") {
      return json({ error: "Method not allowed" }, 405);
    }

    if (url.pathname === "/health") {
      try {
        const result = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
        return json({
          service: "supertechai-shadow-api",
          status: result?.ok === 1 ? "healthy" : "degraded",
          mode: "shadow",
          productionBackend: "supabase",
          database: "cloudflare-d1",
        }, result?.ok === 1 ? 200 : 503);
      } catch {
        return json({
          service: "supertechai-shadow-api",
          status: "database_unavailable",
          mode: "shadow",
        }, 503);
      }
    }

    return json({ error: "Not found" }, 404);
  },
};
