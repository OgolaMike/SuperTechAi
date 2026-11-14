type ExchangeProvider = "binance_spot" | "binance_futures" | "okx";

const PROVIDERS: Record<ExchangeProvider, { origin: string; prefix: string }> = {
  binance_spot: { origin: "https://api.binance.com", prefix: "/api/" },
  binance_futures: { origin: "https://fapi.binance.com", prefix: "/fapi/" },
  okx: { origin: "https://openapi.okx.com", prefix: "/api/v5/" },
};
const ALLOWED_HEADERS = new Set([
  "accept", "content-type", "x-mbx-apikey",
  "ok-access-key", "ok-access-sign", "ok-access-timestamp",
  "ok-access-passphrase", "x-simulated-trading",
]);
const enc = new TextEncoder();
const hex = (bytes: Uint8Array) => [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");

async function sha256(value: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(value))));
}

async function hmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(value))));
}

function bodyText(body: BodyInit | null | undefined): string | null {
  if (body === null || body === undefined) return null;
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (body instanceof ArrayBuffer) return new TextDecoder().decode(body);
  if (ArrayBuffer.isView(body)) return new TextDecoder().decode(body);
  throw new Error("exchange_gateway_body_type_unsupported");
}

function validateTarget(provider: ExchangeProvider, url: URL): void {
  const config = PROVIDERS[provider];
  if (!config || url.origin !== config.origin || !url.pathname.startsWith(config.prefix) ||
      url.pathname.split("/").some((part) => part === "." || part === "..")) {
    throw new Error("exchange_gateway_target_not_allowed");
  }
}

/**
 * Sends a signed exchange request through the SuperTech static-egress gateway.
 * The exchange API secret/private key is used locally for exchange signing and
 * is never sent to the gateway. The gateway receives only the already-signed
 * request and a separate short-lived HMAC service signature.
 *
 * This helper deliberately fails closed when the gateway is not configured:
 * trading requests must not silently fall back to Supabase's rotating egress IPs.
 */
export async function exchangeGatewayFetch(
  provider: ExchangeProvider,
  input: string | URL,
  init: RequestInit = {},
): Promise<Response> {
  const config = PROVIDERS[provider];
  if (!config) throw new Error("exchange_gateway_provider_unsupported");
  const upstream = input instanceof URL ? input : new URL(input);
  validateTarget(provider, upstream);

  const gatewayUrl = Deno.env.get("AUTOMATION_GATEWAY_URL")?.trim().replace(/\/+$/, "");
  const sharedSecret = Deno.env.get("AUTOMATION_GATEWAY_SECRET");
  if (!gatewayUrl || !sharedSecret || sharedSecret.length < 32) {
    throw new Error("automation_gateway_not_configured");
  }
  const gateway = new URL(gatewayUrl);
  if (gateway.protocol !== "https:") throw new Error("automation_gateway_https_required");

  const method = (init.method ?? "GET").toUpperCase();
  if (!["GET", "POST", "DELETE"].includes(method)) {
    throw new Error("exchange_gateway_method_not_allowed");
  }
  const headers = new Headers(init.headers);
  const safeHeaders: Record<string, string> = {};
  headers.forEach((value, name) => {
    const lower = name.toLowerCase();
    if (ALLOWED_HEADERS.has(lower)) safeHeaders[lower] = value;
  });
  if (provider.startsWith("binance_") && !safeHeaders["x-mbx-apikey"]) {
    throw new Error("binance_api_key_header_required");
  }
  if (provider === "okx" &&
      (!safeHeaders["ok-access-key"] || !safeHeaders["ok-access-sign"] ||
       !safeHeaders["ok-access-timestamp"] || !safeHeaders["ok-access-passphrase"])) {
    throw new Error("okx_authentication_headers_required");
  }

  const textBody = bodyText(init.body);
  const payload = JSON.stringify({
    provider,
    method,
    path: upstream.pathname + upstream.search,
    headers: safeHeaders,
    body: textBody,
  });
  const timestamp = String(Date.now());
  const nonce = crypto.randomUUID();
  const pathname = "/v1/exchange-request";
  const canonical = [timestamp, nonce, "POST", pathname, await sha256(payload)].join("\n");
  const signature = await hmac(sharedSecret, canonical);

  let response: Response;
  try {
    response = await fetch(gatewayUrl + pathname, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-STAI-Timestamp": timestamp,
        "X-STAI-Nonce": nonce,
        "X-STAI-Signature": signature,
      },
      body: payload,
      signal: init.signal ?? AbortSignal.timeout(15_000),
      redirect: "error",
    });
  } catch {
    throw new TypeError(provider === "okx" ? "okx_network_outcome_uncertain" : "binance_network_outcome_uncertain");
  }

  if (response.headers.get("x-stai-gateway-error") === "upstream_network_outcome_uncertain") {
    throw new TypeError(provider === "okx" ? "okx_network_outcome_uncertain" : "binance_network_outcome_uncertain");
  }
  return response;
}
