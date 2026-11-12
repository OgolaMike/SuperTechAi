const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const ALLOWED_HOSTS = new Set([
  "www.okx.com",
  "api.bybit.com",
  "api.kucoin.com",
  "api.gateio.ws",
  "api.bitget.com",
  "api.mexc.com",
  "api.huobi.pro",
]);

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=15" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return respond({ error: "method_not_allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const rawUrl = typeof body?.url === "string" ? body.url : "";
    const target = new URL(rawUrl);
    const allowedPath = (target.hostname === "www.okx.com" && target.pathname.startsWith("/api/v5/market/"))
      || (target.hostname === "api.bybit.com" && target.pathname.startsWith("/v5/market/"))
      || (target.hostname === "api.kucoin.com" && target.pathname.startsWith("/api/v1/market/"))
      || (target.hostname === "api.gateio.ws" && target.pathname.startsWith("/api/v4/spot/"))
      || (target.hostname === "api.bitget.com" && target.pathname.startsWith("/api/v2/spot/market/"))
      || (target.hostname === "api.mexc.com" && (target.pathname.startsWith("/api/v3/ticker/") || target.pathname.startsWith("/api/v3/klines")))
      || (target.hostname === "api.huobi.pro" && target.pathname.startsWith("/market/"));
    if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname) || !allowedPath || target.username || target.password) {
      return respond({ error: "exchange_host_not_allowed" }, 400);
    }
    const upstream = await fetch(target.toString(), {
      headers: { Accept: "application/json", "User-Agent": "SuperTechAi-MarketData/1.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!upstream.ok) return respond({ error: "exchange_upstream_error", status: upstream.status }, 502);
    const data = await upstream.json();
    return respond(data);
  } catch (error) {
    return respond({ error: error instanceof Error ? error.message : "exchange_market_unavailable" }, 502);
  }
});
