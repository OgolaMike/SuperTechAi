import {
  EXCHANGE_AUTOMATION_CAPABILITIES,
  getExchangeAutomationCapability,
  isExchangeTradingReady,
} from "./exchange-provider-registry.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("all ten supported exchanges have explicit backend capability records", () => {
  const ids = EXCHANGE_AUTOMATION_CAPABILITIES.map((exchange) => exchange.id);
  assert(ids.length === 10, "expected exactly ten exchange records");
  assert(new Set(ids).size === 10, "exchange identifiers must be unique");
  for (const exchange of EXCHANGE_AUTOMATION_CAPABILITIES) {
    assert(exchange.backendOnly === true, `${exchange.id} must use backend execution`);
    assert(exchange.marketData === "implemented", `${exchange.id} market data must be tracked`);
  }
});

Deno.test("market data is not mistaken for trading readiness", () => {
  const pending = ["BYBIT", "KUCOIN", "GATEIO", "MEXC", "BITGET", "COINEX", "BINGX", "BITMART"];
  for (const id of pending) {
    assert(!isExchangeTradingReady(id, "spot"), `${id} Spot must stay unavailable until its adapter is verified`);
    assert(!isExchangeTradingReady(id, "derivatives"), `${id} derivatives must stay unavailable until its adapter is verified`);
  }
});

Deno.test("only existing provider execution paths are marked implemented", () => {
  assert(isExchangeTradingReady("BINANCE", "spot"), "Binance Spot executor should be recognized");
  assert(isExchangeTradingReady("BINANCE", "derivatives"), "Binance Futures executor should be recognized");
  assert(!isExchangeTradingReady("OKX", "spot"), "OKX Spot is not implemented");
  assert(isExchangeTradingReady("OKX", "derivatives"), "OKX Futures executor should be recognized");
});

Deno.test("exchange lookup is case-insensitive and rejects unknown providers", () => {
  assert(getExchangeAutomationCapability("bybit")?.id === "BYBIT", "lookup should normalize exchange id");
  assert(getExchangeAutomationCapability("UNKNOWN") === undefined, "unknown exchange must not be accepted");
});
