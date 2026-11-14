import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { exchangeGatewayFetch } from "./exchange-gateway.ts";

Deno.test("exchange gateway fails closed when not configured", async () => {
  const oldUrl = Deno.env.get("AUTOMATION_GATEWAY_URL");
  const oldSecret = Deno.env.get("AUTOMATION_GATEWAY_SECRET");
  Deno.env.delete("AUTOMATION_GATEWAY_URL");
  Deno.env.delete("AUTOMATION_GATEWAY_SECRET");
  try {
    await assertRejects(
      () => exchangeGatewayFetch("binance_futures", "https://fapi.binance.com/fapi/v2/account", {
        headers: { "X-MBX-APIKEY": "test" },
      }),
      Error,
      "automation_gateway_not_configured",
    );
  } finally {
    if (oldUrl !== undefined) Deno.env.set("AUTOMATION_GATEWAY_URL", oldUrl);
    if (oldSecret !== undefined) Deno.env.set("AUTOMATION_GATEWAY_SECRET", oldSecret);
  }
});

Deno.test("exchange gateway rejects a mismatched provider host before network access", async () => {
  await assertRejects(
    () => exchangeGatewayFetch("binance_futures", "https://api.binance.com/api/v3/account", {
      headers: { "X-MBX-APIKEY": "test" },
    }),
    Error,
    "exchange_gateway_target_not_allowed",
  );
});

Deno.test("exchange gateway rejects missing Binance API key before network access", async () => {
  await assertRejects(
    () => exchangeGatewayFetch("binance_spot", "https://api.binance.com/api/v3/account", {}),
    Error,
    "binance_api_key_header_required",
  );
});
