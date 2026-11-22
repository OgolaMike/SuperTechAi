/**
 * Server-side source of truth for exchange automation capabilities.
 *
 * Market-data support is intentionally separate from order execution support.
 * A venue must not be shown as trading-ready until a provider adapter, secure
 * credential lifecycle, risk preflight, protected-order flow and reconciliation
 * have all been implemented and verified.
 */
export type CapabilityState = "implemented" | "not_implemented";

export type ExchangeAutomationCapability = {
  id: string;
  name: string;
  marketData: CapabilityState;
  spotExecution: CapabilityState;
  derivativesExecution: CapabilityState;
  executionFunctions: readonly string[];
  backendOnly: true;
};

export const EXCHANGE_AUTOMATION_CAPABILITIES: readonly ExchangeAutomationCapability[] = [
  {
    id: "BINANCE",
    name: "Binance",
    marketData: "implemented",
    spotExecution: "implemented",
    derivativesExecution: "implemented",
    executionFunctions: ["binance-spot", "binance-futures", "binance-futures-executor"],
    backendOnly: true,
  },
  {
    id: "OKX",
    name: "OKX",
    marketData: "implemented",
    spotExecution: "not_implemented",
    derivativesExecution: "implemented",
    executionFunctions: ["okx-futures", "okx-futures-executor"],
    backendOnly: true,
  },
  {
    id: "BYBIT",
    name: "Bybit",
    marketData: "implemented",
    spotExecution: "not_implemented",
    derivativesExecution: "not_implemented",
    executionFunctions: [],
    backendOnly: true,
  },
  {
    id: "KUCOIN",
    name: "KuCoin",
    marketData: "implemented",
    spotExecution: "not_implemented",
    derivativesExecution: "not_implemented",
    executionFunctions: [],
    backendOnly: true,
  },
  {
    id: "GATEIO",
    name: "Gate.io",
    marketData: "implemented",
    spotExecution: "not_implemented",
    derivativesExecution: "not_implemented",
    executionFunctions: [],
    backendOnly: true,
  },
  {
    id: "MEXC",
    name: "MEXC",
    marketData: "implemented",
    spotExecution: "not_implemented",
    derivativesExecution: "not_implemented",
    executionFunctions: [],
    backendOnly: true,
  },
  {
    id: "BITGET",
    name: "Bitget",
    marketData: "implemented",
    spotExecution: "not_implemented",
    derivativesExecution: "not_implemented",
    executionFunctions: [],
    backendOnly: true,
  },
  {
    id: "COINEX",
    name: "CoinEx",
    marketData: "implemented",
    spotExecution: "not_implemented",
    derivativesExecution: "not_implemented",
    executionFunctions: [],
    backendOnly: true,
  },
  {
    id: "BINGX",
    name: "BingX",
    marketData: "implemented",
    spotExecution: "not_implemented",
    derivativesExecution: "not_implemented",
    executionFunctions: [],
    backendOnly: true,
  },
  {
    id: "BITMART",
    name: "BitMart",
    marketData: "implemented",
    spotExecution: "not_implemented",
    derivativesExecution: "not_implemented",
    executionFunctions: [],
    backendOnly: true,
  },
] as const;

export function getExchangeAutomationCapability(
  exchangeId: string,
): ExchangeAutomationCapability | undefined {
  return EXCHANGE_AUTOMATION_CAPABILITIES.find(
    (exchange) => exchange.id === exchangeId.trim().toUpperCase(),
  );
}

export function isExchangeTradingReady(
  exchangeId: string,
  market: "spot" | "derivatives",
): boolean {
  const capability = getExchangeAutomationCapability(exchangeId);
  if (!capability) return false;
  return market === "spot"
    ? capability.spotExecution === "implemented"
    : capability.derivativesExecution === "implemented";
}
