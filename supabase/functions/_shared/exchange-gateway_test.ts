import { exchangeGatewayFetch } from "./exchange-gateway.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function expectError(run: () => Promise<unknown>, expected: string) {
  try {
    await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(message.includes(expected), `Expected error containing "${expected}", received "${message}"`);
    return;
  }
  throw new Error(`Expected "${expected}" to be thrown`);
}

Deno.test("exchange gateway validates target, fails closed, and rejects missing credentials", async () => {
  const oldUrl = Deno.env.get("AUTOMATION_GATEWAY_URL");
  const oldSecret = Deno.env.get("AUTOMATION_GATEWAY_SECRET");
  try {
    Deno.env.delete("AUTOMATION_GATEWAY_URL");
    Deno.env.delete("AUTOMATION_GATEWAY_SECRET");
    await expectError(
      () => exchangeGatewayFetch("binance_futures", "https://fapi.binance.com/fapi/v2/account", {
        headers: { "X-MBX-APIKEY": "test" },
      }),
      "automation_gateway_not_configured",
    );
    await expectError(
      () => exchangeGatewayFetch("binance_futures", "https://api.binance.com/api/v3/account", {
        headers: { "X-MBX-APIKEY": "test" },
      }),
      "exchange_gateway_target_not_allowed",
    );

    Deno.env.set("AUTOMATION_GATEWAY_URL", "https://gateway.example.test");
    Deno.env.set("AUTOMATION_GATEWAY_SECRET", "test-only-secret-at-least-32-bytes-long");
    await expectError(
      () => exchangeGatewayFetch("binance_spot", "https://api.binance.com/api/v3/account", {}),
      "binance_api_key_header_required",
    );
  } finally {
    if (oldUrl !== undefined) Deno.env.set("AUTOMATION_GATEWAY_URL", oldUrl);
    else Deno.env.delete("AUTOMATION_GATEWAY_URL");
    if (oldSecret !== undefined) Deno.env.set("AUTOMATION_GATEWAY_SECRET", oldSecret);
    else Deno.env.delete("AUTOMATION_GATEWAY_SECRET");
  }
});
