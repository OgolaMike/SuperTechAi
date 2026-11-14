import test from "node:test";
import assert from "node:assert/strict";
import { createGatewayServer, signGatewayRequest, validateProviderTarget } from "./server.mjs";

const secret = "test-only-supertech-gateway-secret-32-bytes";

async function withServer(options, run) {
  const server = createGatewayServer({ secret, ...options });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try { await run(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

function signedHeaders(body, nonce = "test-nonce-1234567890", timestamp = String(Date.now())) {
  const signature = signGatewayRequest(secret, {
    timestamp, nonce, method: "POST", pathname: "/v1/exchange-request", body,
  });
  return {
    "content-type": "application/json",
    "x-stai-timestamp": timestamp,
    "x-stai-nonce": nonce,
    "x-stai-signature": signature,
  };
}

test("only fixed provider hosts and endpoint prefixes are allowed", () => {
  assert.equal(validateProviderTarget("binance_futures", "GET", "/fapi/v2/account").hostname, "fapi.binance.com");
  assert.equal(validateProviderTarget("binance_spot", "GET", "/api/v3/account").hostname, "api.binance.com");
  assert.equal(validateProviderTarget("okx", "POST", "/api/v5/trade/order").hostname, "openapi.okx.com");
  assert.throws(() => validateProviderTarget("binance_futures", "GET", "https://evil.example/fapi/v2/account"));
  assert.throws(() => validateProviderTarget("binance_futures", "GET", "/fapi/../api/v3/account"));
  assert.throws(() => validateProviderTarget("binance_futures", "PATCH", "/fapi/v2/account"));
  assert.throws(() => validateProviderTarget("okx", "GET", "/api/v4/account"));
});

test("authenticated Binance request is forwarded to the fixed host", async () => {
  let forwarded;
  await withServer({
    fetchImpl: async (url, init) => {
      forwarded = { url: String(url), init };
      return new Response(JSON.stringify({ canTrade: true }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    },
  }, async (base) => {
    const payload = JSON.stringify({
      provider: "binance_futures",
      method: "GET",
      path: "/fapi/v2/account?timestamp=1&signature=abc",
      headers: { "X-MBX-APIKEY": "test-api-key" },
      body: null,
    });
    const response = await fetch(base + "/v1/exchange-request", {
      method: "POST", headers: signedHeaders(payload), body: payload,
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { canTrade: true });
    assert.equal(forwarded.url, "https://fapi.binance.com/fapi/v2/account?timestamp=1&signature=abc");
    assert.equal(forwarded.init.headers.get("x-mbx-apikey"), "test-api-key");
  });
});

test("rejects invalid signatures and replayed nonces", async () => {
  await withServer({ fetchImpl: async () => new Response("ok") }, async (base) => {
    const payload = JSON.stringify({
      provider: "binance_futures", method: "GET", path: "/fapi/v2/account",
      headers: { "X-MBX-APIKEY": "test-api-key" }, body: null,
    });
    const invalid = await fetch(base + "/v1/exchange-request", {
      method: "POST", headers: { ...signedHeaders(payload), "x-stai-signature": "0".repeat(64) }, body: payload,
    });
    assert.equal(invalid.status, 401);
    const headers = signedHeaders(payload, "replay-nonce-123456");
    const first = await fetch(base + "/v1/exchange-request", { method: "POST", headers, body: payload });
    const second = await fetch(base + "/v1/exchange-request", { method: "POST", headers, body: payload });
    assert.equal(first.status, 200);
    assert.equal(second.status, 409);
  });
});

test("does not retry or disguise an uncertain upstream order result", async () => {
  let attempts = 0;
  await withServer({
    fetchImpl: async () => { attempts++; throw new Error("socket timeout"); },
  }, async (base) => {
    const payload = JSON.stringify({
      provider: "binance_futures", method: "POST", path: "/fapi/v1/order",
      headers: { "X-MBX-APIKEY": "test-api-key", "Content-Type": "application/x-www-form-urlencoded" },
      body: "symbol=BTCUSDT&side=BUY&type=MARKET",
    });
    const response = await fetch(base + "/v1/exchange-request", {
      method: "POST", headers: signedHeaders(payload), body: payload,
    });
    assert.equal(response.status, 502);
    assert.equal(response.headers.get("x-stai-gateway-error"), "upstream_network_outcome_uncertain");
    assert.equal(attempts, 1);
  });
});

test("applies shared-IP request-weight limits before forwarding", async () => {
  let attempts = 0;
  await withServer({
    rateLimits: { binance_futures: 1, binance_futures_per_key: 1 },
    fetchImpl: async () => {
      attempts++;
      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    },
  }, async (base) => {
    const makeRequest = async (nonce) => {
      const payload = JSON.stringify({
        provider: "binance_futures",
        method: "POST",
        path: "/fapi/v1/order",
        headers: { "X-MBX-APIKEY": "test-api-key", "Content-Type": "application/x-www-form-urlencoded" },
        body: "symbol=BTCUSDT&side=BUY&type=MARKET",
      });
      return fetch(base + "/v1/exchange-request", {
        method: "POST", headers: signedHeaders(payload, nonce), body: payload,
      });
    };
    const first = await makeRequest("rate-limit-nonce-0001");
    const second = await makeRequest("rate-limit-nonce-0002");
    assert.equal(first.status, 200);
    assert.equal(second.status, 429);
    assert.equal(second.headers.get("retry-after") !== null, true);
    assert.equal(attempts, 1);
  });
});
