import {
  accountSuffix,
  classifyConnectionHealth,
  isRecentHeartbeat,
} from "./automation-status.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.test("classifies connected provider when one connection is connected", () => {
  assertEquals(classifyConnectionHealth(["not_connected", "connected"]), "connected");
});

Deno.test("flags attention when no provider is connected but one needs action", () => {
  assertEquals(classifyConnectionHealth(["not_connected", "reauthorization_required"]), "attention");
  assertEquals(classifyConnectionHealth(["error"]), "attention");
});

Deno.test("defaults empty or inactive providers to not connected", () => {
  assertEquals(classifyConnectionHealth([]), "not_connected");
  assertEquals(classifyConnectionHealth(["not_connected", null]), "not_connected");
});

Deno.test("accepts only recent and plausible worker heartbeat timestamps", () => {
  const now = Date.parse("2026-11-12T12:00:00.000Z");
  assertEquals(isRecentHeartbeat("2026-11-12T11:59:30.000Z", now), true);
  assertEquals(isRecentHeartbeat("2026-11-12T11:50:00.000Z", now), false);
  assertEquals(isRecentHeartbeat("2026-11-12T12:05:00.000Z", now), false);
  assertEquals(isRecentHeartbeat(null, now), false);
  assertEquals(isRecentHeartbeat("not-a-date", now), false);
});

Deno.test("returns only the last four account-login characters", () => {
  assertEquals(accountSuffix("123456789"), "6789");
  assertEquals(accountSuffix("123"), "123");
  assertEquals(accountSuffix(""), null);
  assertEquals(accountSuffix(null), null);
});
