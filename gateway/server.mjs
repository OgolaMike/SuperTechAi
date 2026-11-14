import { createServer } from "node:http";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { setDefaultResultOrder } from "node:dns";

setDefaultResultOrder("ipv4first");

const PROVIDERS = {
  binance_spot: { origin: "https://api.binance.com", prefix: "/api/" },
  binance_futures: { origin: "https://fapi.binance.com", prefix: "/fapi/" },
  okx: { origin: "https://openapi.okx.com", prefix: "/api/v5/" },
};
const METHODS = new Set(["GET", "POST", "DELETE"]);
const ALLOWED_HEADERS = new Set([
  "accept", "content-type", "x-mbx-apikey",
  "ok-access-key", "ok-access-sign", "ok-access-timestamp",
  "ok-access-passphrase", "x-simulated-trading",
]);
const MAX_BODY_BYTES = 64 * 1024;
const MAX_CLOCK_SKEW_MS = 30_000;
const NONCE_TTL_MS = 120_000;
const RATE_WINDOW_MS = 60_000;
const DEFAULT_RATE_LIMITS = {
  binance_spot: 4_500,
  binance_futures: 1_800,
  binance_spot_per_key: 1_500,
  binance_futures_per_key: 600,
  okx_per_key: 60,
};

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function estimateRequestWeight(provider, target, method) {
  const path = target.pathname;
  if (provider === "binance_futures") {
    if (path.endsWith("/positionSide/dual") || path.endsWith("/income")) return 30;
    if (path.endsWith("/openOrders") && !target.searchParams.has("symbol")) return 40;
    if (path.endsWith("/account") || path.endsWith("/positionRisk")) return 5;
    return 1;
  }
  if (provider === "binance_spot") {
    if (path.endsWith("/account")) return 20;
    if (path.endsWith("/openOrders") && !target.searchParams.has("symbol")) return 80;
    if (path.endsWith("/orderList")) return 2;
    if (path.endsWith("/order")) return 4;
    return method === "GET" ? 5 : 1;
  }
  return 1;
}

export function signGatewayRequest(secret, { timestamp, nonce, method, pathname, body }) {
  const canonical = [timestamp, nonce, method.toUpperCase(), pathname, sha256(body)].join("\n");
  return createHmac("sha256", secret).update(canonical).digest("hex");
}

export function validateProviderTarget(provider, method, rawPath) {
  const config = PROVIDERS[provider];
  if (!config) throw new Error("unsupported_provider");
  if (!METHODS.has(method)) throw new Error("unsupported_method");
  if (typeof rawPath !== "string" || rawPath.length < 2 || rawPath.length > 4096 ||
      !rawPath.startsWith("/") || rawPath.startsWith("//") ||
      rawPath.includes("\\") || rawPath.includes("#") || /[\u0000-\u001f]/.test(rawPath)) {
    throw new Error("invalid_upstream_path");
  }
  const rawPathname = rawPath.split("?", 1)[0];
  let decodedPath;
  try { decodedPath = decodeURIComponent(rawPathname); }
  catch { throw new Error("invalid_upstream_path_encoding"); }
  if (decodedPath.split("/").some((part) => part === "." || part === "..") ||
      decodedPath.includes("\\")) throw new Error("invalid_upstream_path");
  const target = new URL(rawPath, config.origin);
  if (target.origin !== config.origin || !target.pathname.startsWith(config.prefix)) {
    throw new Error("upstream_target_not_allowed");
  }
  return target;
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("request_body_too_large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function writeJson(res, status, body, extraHeaders = {}) {
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": payload.length,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...extraHeaders,
  });
  res.end(payload);
}

export function createGatewayServer({
  secret = process.env.GATEWAY_SHARED_SECRET,
  fetchImpl = fetch,
  clock = () => Date.now(),
  timeoutMs = 12_000,
  rateLimits = DEFAULT_RATE_LIMITS,
} = {}) {
  if (typeof secret !== "string" || Buffer.byteLength(secret) < 32) {
    throw new Error("GATEWAY_SHARED_SECRET_must_be_at_least_32_bytes");
  }
  const usedNonces = new Map();
  const rateWindows = new Map();

  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://gateway.internal");
    if (req.method === "GET" && url.pathname === "/healthz") {
      return writeJson(res, 200, { ok: true, service: "supertech-exchange-gateway" });
    }
    if (req.method !== "POST" || url.pathname !== "/v1/exchange-request") {
      return writeJson(res, 404, { error: "not_found" });
    }

    let rawBody;
    try { rawBody = await readBody(req); }
    catch (error) { return writeJson(res, 413, { error: error.message }); }

    const timestamp = req.headers["x-stai-timestamp"];
    const nonce = req.headers["x-stai-nonce"];
    const suppliedSignature = req.headers["x-stai-signature"];
    const now = clock();
    const numericTimestamp = Number(timestamp);
    if (typeof timestamp !== "string" || !Number.isFinite(numericTimestamp) ||
        Math.abs(now - numericTimestamp) > MAX_CLOCK_SKEW_MS ||
        typeof nonce !== "string" || !/^[a-zA-Z0-9_-]{16,128}$/.test(nonce) ||
        typeof suppliedSignature !== "string" || !/^[a-f0-9]{64}$/i.test(suppliedSignature)) {
      return writeJson(res, 401, { error: "gateway_authentication_required" });
    }

    for (const [key, expiresAt] of usedNonces) {
      if (expiresAt <= now) usedNonces.delete(key);
    }
    for (const [key, entry] of rateWindows) {
      if (entry.windowStart + RATE_WINDOW_MS <= now) rateWindows.delete(key);
    }
    if (usedNonces.has(nonce)) return writeJson(res, 409, { error: "gateway_replay_rejected" });

    const expectedSignature = signGatewayRequest(secret, {
      timestamp, nonce, method: req.method, pathname: url.pathname, body: rawBody,
    });
    const expected = Buffer.from(expectedSignature, "hex");
    const supplied = Buffer.from(suppliedSignature, "hex");
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      return writeJson(res, 401, { error: "gateway_signature_invalid" });
    }
    usedNonces.set(nonce, now + NONCE_TTL_MS);

    let payload;
    try { payload = JSON.parse(rawBody.toString("utf8")); }
    catch { return writeJson(res, 400, { error: "invalid_json" }); }

    const provider = payload?.provider;
    const method = String(payload?.method ?? "").toUpperCase();
    let target;
    try { target = validateProviderTarget(provider, method, payload?.path); }
    catch (error) { return writeJson(res, 400, { error: error.message }); }

    if (payload.body !== null && payload.body !== undefined && typeof payload.body !== "string") {
      return writeJson(res, 400, { error: "upstream_body_must_be_text" });
    }
    const incomingHeaders = payload.headers && typeof payload.headers === "object" ? payload.headers : {};
    const upstreamHeaders = new Headers();
    for (const [name, value] of Object.entries(incomingHeaders)) {
      const lower = name.toLowerCase();
      if (!ALLOWED_HEADERS.has(lower) || typeof value !== "string" || value.length > 8192) {
        return writeJson(res, 400, { error: "upstream_header_not_allowed" });
      }
      upstreamHeaders.set(name, value);
    }
    if (provider.startsWith("binance_") && !upstreamHeaders.has("x-mbx-apikey")) {
      return writeJson(res, 400, { error: "binance_api_key_header_required" });
    }
    if (provider === "okx" &&
        (!upstreamHeaders.has("ok-access-key") || !upstreamHeaders.has("ok-access-sign") ||
         !upstreamHeaders.has("ok-access-timestamp") || !upstreamHeaders.has("ok-access-passphrase"))) {
      return writeJson(res, 400, { error: "okx_authentication_headers_required" });
    }

    // Centralise request-weight budgets because every member now shares this
    // gateway's public egress IP. Per-key budgets also protect provider account limits.
    const apiKey = provider === "okx"
      ? upstreamHeaders.get("ok-access-key")
      : upstreamHeaders.get("x-mbx-apikey");
    const keyHash = sha256(apiKey ?? "");
    const windowStart = Math.floor(now / RATE_WINDOW_MS) * RATE_WINDOW_MS;
    const weight = provider === "okx" ? 1 : estimateRequestWeight(provider, target, method);
    const globalLimit = provider === "okx" ? Number.POSITIVE_INFINITY : Number(rateLimits[provider]);
    const accountLimit = Number(rateLimits[provider + "_per_key"] ?? rateLimits.okx_per_key);
    const globalKey = "global:" + provider;
    const accountKey = "account:" + provider + ":" + keyHash;
    const globalWindow = rateWindows.get(globalKey);
    const accountWindow = rateWindows.get(accountKey);
    const globalUsed = globalWindow?.windowStart === windowStart ? globalWindow.used : 0;
    const accountUsed = accountWindow?.windowStart === windowStart ? accountWindow.used : 0;
    if (globalUsed + weight > globalLimit || accountUsed + weight > accountLimit) {
      const retryAfter = Math.max(1, Math.ceil((windowStart + RATE_WINDOW_MS - now) / 1000));
      return writeJson(res, 429, { error: "gateway_rate_limit", retryAfterSeconds: retryAfter }, {
        "retry-after": String(retryAfter),
      });
    }
    if (Number.isFinite(globalLimit)) {
      rateWindows.set(globalKey, { windowStart, used: globalUsed + weight });
    }
    rateWindows.set(accountKey, { windowStart, used: accountUsed + weight });

    const started = clock();
    try {
      const upstream = await fetchImpl(target, {
        method,
        headers: upstreamHeaders,
        ...(method === "GET" ? {} : { body: payload.body ?? "" }),
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
      const responseBody = Buffer.from(await upstream.arrayBuffer());
      const responseHeaders = {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      };
      for (const name of ["content-type", "x-mbx-used-weight-1m", "x-mbx-order-count-10s",
        "x-mbx-order-count-1d", "retry-after"]) {
        const value = upstream.headers.get(name);
        if (value) responseHeaders[name] = value;
      }
      console.log(JSON.stringify({
        event: "exchange_proxy",
        provider,
        method,
        path: target.pathname,
        status: upstream.status,
        duration_ms: Math.max(0, clock() - started),
      }));
      res.writeHead(upstream.status, responseHeaders);
      return res.end(responseBody);
    } catch {
      // Never retry an order here. The caller must reconcile by client order ID
      // because a network timeout does not prove that the exchange rejected it.
      console.error(JSON.stringify({
        event: "exchange_proxy_upstream_uncertain",
        provider,
        method,
        path: target.pathname,
        duration_ms: Math.max(0, clock() - started),
      }));
      return writeJson(res, 502, { error: "upstream_network_outcome_uncertain" }, {
        "x-stai-gateway-error": "upstream_network_outcome_uncertain",
      });
    }
  });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const port = Number(process.env.PORT ?? 8080);
  const host = process.env.HOST ?? "0.0.0.0";
  const server = createGatewayServer();
  server.listen(port, host, () => {
    console.log(JSON.stringify({ event: "gateway_started", host, port }));
  });
  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.on(signal, () => server.close(() => process.exit(0)));
  }
}
