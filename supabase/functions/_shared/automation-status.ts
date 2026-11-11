export type ConnectionHealth = "connected" | "attention" | "not_connected";

export function classifyConnectionHealth(values: Array<string | null | undefined>): ConnectionHealth {
  if (values.some((value) => value === "connected")) return "connected";
  if (values.some((value) => value === "error" || value === "reauthorization_required")) return "attention";
  return "not_connected";
}

export function isRecentHeartbeat(
  lastSeenAt: string | null | undefined,
  now = Date.now(),
  maxAgeMs = 120_000,
): boolean {
  if (!lastSeenAt) return false;
  const timestamp = Date.parse(lastSeenAt);
  return Number.isFinite(timestamp) && timestamp <= now + 30_000 && now - timestamp <= maxAgeMs;
}

export function accountSuffix(login: string | null | undefined): string | null {
  if (!login) return null;
  const value = login.trim();
  return value.length === 0 ? null : value.slice(-4);
}
