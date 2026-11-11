import {
  accountSuffix,
  classifyConnectionHealth,
  isRecentHeartbeat,
} from "./automation-status.ts";

function assertEquals(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

Deno.test("classifies connected provider when one connection is connected", () => {
  assertEquals(classifyConnectionHealth(["not_connected", "connected"]), "connected", "connected provider");
});

Deno.test("prioritizes required action and preserves connecting state", () => {
  assertEquals(classifyConnectionHealth(["connected", "error"]), "attention", "error alongside connection");
  assertEquals(classifyConnectionHealth(["connecting"]), "connecting", "connecting provider");
  assertEquals(classifyConnectionHealth(["not_connected", "connecting"]), "connecting", "connecting provider among inactive");
  assertEquals(classifyConnectionHealth(["connecting", "reauthorization_required"]), "attention", "attention takes priority");
  assertEquals(classifyConnectionHealth(["not_connected", "reauthorization_required"]), "attention", "reauthorization");
});

Deno.test("defaults empty or inactive providers to not connected", () => {
  assertEquals(classifyConnectionHealth([]), "not_connected", "empty provider list");
  assertEquals(classifyConnectionHealth(["not_connected", null]), "not_connected", "inactive provider list");
});

Deno.test("accepts only recent and plausible worker heartbeat timestamps", () => {
  const now = Date.parse("2026-11-12T12:00:00.000Z");
  assertEquals(isRecentHeartbeat("2026-11-12T11:59:30.000Z", now), true, "recent heartbeat");
  assertEquals(isRecentHeartbeat("2026-11-12T11:50:00.000Z", now), false, "stale heartbeat");
  assertEquals(isRecentHeartbeat("2026-11-12T12:05:00.000Z", now), false, "future heartbeat");
  assertEquals(isRecentHeartbeat(null, now), false, "missing heartbeat");
  assertEquals(isRecentHeartbeat("not-a-date", now), false, "invalid heartbeat");
});

Deno.test("returns only the last four account-login characters", () => {
  assertEquals(accountSuffix("123456789"), "6789", "masked login suffix");
  assertEquals(accountSuffix("123"), "123", "short login");
  assertEquals(accountSuffix(""), null, "empty login");
  assertEquals(accountSuffix(null), null, "missing login");
});
