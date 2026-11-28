const ALLOWED_ORIGIN = "https://main.supertechai.pages.dev";
const ALLOWED_HOSTS = new Set([
  "www.okx.com", "api.bybit.com", "api.kucoin.com", "api.gateio.ws",
  "api.bitget.com", "api.mexc.com", "api.coinex.com", "api-cloud.bitmart.com",
  "open-api.bingx.com", "data-api.binance.vision", "api.binance.com",
  "api1.binance.com", "api2.binance.com", "api3.binance.com", "stream.binance.com",
]);
const cors = (origin: string) => origin === ALLOWED_ORIGIN ? {
  "access-control-allow-origin": origin,
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "accept, content-type",
  "access-control-max-age": "600",
  "vary": "Origin",
} : {};
const json = (value: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });

export default {
  async fetch(request: Request): Promise<Response> {
    const origin = request.headers.get("origin") || "";
    const headers = cors(origin);
    if (origin && origin !== ALLOWED_ORIGIN) return json({ error: "origin_not_allowed" }, 403);
    if (request.method === "OPTIONS") return new Response(null, { status: origin === ALLOWED_ORIGIN ? 204 : 403, headers });
    const incoming = new URL(request.url);
    if (incoming.pathname === "/stream" && request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      const rawSocketUrl = incoming.searchParams.get("url") || "";
      let socketTarget: URL;
      try { socketTarget = new URL(rawSocketUrl); } catch { return json({ error: "invalid_market_stream_url" }, 400, headers); }
      if (socketTarget.protocol !== "wss:" || socketTarget.hostname !== "stream.binance.com" || socketTarget.port !== "9443" || socketTarget.pathname !== "/stream") {
        return json({ error: "market_stream_not_allowed" }, 403, headers);
      }
      try {
        const upstreamRequest = new Request(socketTarget.toString(), request);
        return await fetch(upstreamRequest);
      } catch {
        return json({ error: "market_stream_unavailable" }, 502, headers);
      }
    }
    if (incoming.pathname === "/health" && request.method === "GET") return json({ ok: true, service: "supertechai-market-data", providers: [...ALLOWED_HOSTS] }, 200, headers);
    if (incoming.pathname !== "/api/market-proxy" || request.method !== "GET") return json({ error: "not_found" }, 404, headers);
    const raw = incoming.searchParams.get("url") || "";
    let target: URL;
    try { target = new URL(raw); } catch { return json({ error: "invalid_market_url" }, 400, headers); }
    if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname) || target.username || target.password || target.port) {
      return json({ error: "market_provider_not_allowed" }, 403, headers);
    }
    const cache = caches.default;
    const cacheKey = new Request(target.toString(), { method: "GET" });
    const cached = await cache.match(cacheKey);
    if (cached) {
      const responseHeaders = new Headers(cached.headers);
      Object.entries(headers).forEach(([key, value]) => responseHeaders.set(key, value));
      responseHeaders.set("x-market-cache", "HIT");
      return new Response(cached.body, { status: cached.status, headers: responseHeaders });
    }
    try {
      const upstream = await fetch(target.toString(), {
        method: "GET",
        headers: { "accept": "application/json", "user-agent": "SuperTechAI-MarketData/1.0" },
        signal: AbortSignal.timeout(5000),
      });
      const body = await upstream.arrayBuffer();
      if (body.byteLength > 8_000_000) return json({ error: "market_response_too_large" }, 502, headers);
      const responseHeaders = new Headers({
        "content-type": upstream.headers.get("content-type") || "application/json",
        "cache-control": upstream.ok ? "public, max-age=8" : "no-store",
        "x-market-provider": target.hostname,
        "x-market-cache": "MISS",
        ...headers,
      });
      const response = new Response(body, { status: upstream.status, headers: responseHeaders });
      if (upstream.ok) await cache.put(cacheKey, response.clone());
      return response;
    } catch {
      if (cached) {
        const responseHeaders = new Headers(cached.headers);
        Object.entries(headers).forEach(([key, value]) => responseHeaders.set(key, value));
        responseHeaders.set("x-market-cache", "STALE");
        return new Response(cached.body, { status: cached.status, headers: responseHeaders });
      }
      return json({ error: "market_provider_unreachable", provider: target.hostname }, 502, headers);
    }
  },
};
