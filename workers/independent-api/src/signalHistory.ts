import type { Env } from "./index";

type Account = { $id: string };
type SignalRow = {
  $id: string; user_id: string; signal_key: string; symbol: string; asset_name: string;
  timeframe: string; granularity: number; digits: number; direction: "BUY" | "SELL";
  signal_epoch: number; entry: number; stop_loss: number; tp1: number; tp2: number; tp3: number;
  band_mean: number; band_deviation: number; tp1_hit_epoch: number | null; tp2_hit_epoch: number | null;
  tp3_hit_epoch: number | null; sl_hit_epoch: number | null;
  status: "Open" | "TP1" | "TP2" | "TP3" | "Stopped"; closed: boolean; created_at: string;
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});
const base = (env: Env) => `${env.APPWRITE_ENDPOINT.replace(/\/$/, "")}/tablesdb/${env.APPWRITE_DATABASE_ID}/tables/${env.SIGNAL_RECORDS_TABLE_ID}/rows`;
const headers = (env: Env) => ({
  "X-Appwrite-Project": env.APPWRITE_PROJECT_ID,
  "X-Appwrite-Key": env.APPWRITE_API_KEY!,
  "Content-Type": "application/json",
});
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
async function rowId(userId: string, key: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(userId + ":" + key));
  return [...new Uint8Array(digest)].slice(0, 16).map(x => x.toString(16).padStart(2, "0")).join("");
}
function validRecord(value: unknown): value is Omit<SignalRow, "$id" | "user_id" | "created_at"> {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.signal_key === "string" && row.signal_key.length > 0 && row.signal_key.length <= 128
    && typeof row.symbol === "string" && row.symbol.length > 0 && row.symbol.length <= 64
    && typeof row.asset_name === "string" && row.asset_name.length <= 128
    && typeof row.timeframe === "string" && row.timeframe.length <= 16
    && isFiniteNumber(row.granularity) && row.granularity > 0
    && isFiniteNumber(row.digits) && row.digits >= 0 && row.digits <= 12
    && (row.direction === "BUY" || row.direction === "SELL")
    && isFiniteNumber(row.signal_epoch) && row.signal_epoch > 0
    && ["entry", "stop_loss", "tp1", "tp2", "tp3", "band_mean", "band_deviation"].every(key => isFiniteNumber(row[key]))
    && ["tp1_hit_epoch", "tp2_hit_epoch", "tp3_hit_epoch", "sl_hit_epoch"].every(key => row[key] === null || isFiniteNumber(row[key]))
    && ["Open", "TP1", "TP2", "TP3", "Stopped"].includes(String(row.status))
    && typeof row.closed === "boolean";
}
export async function handleSignalHistory(request: Request, env: Env, account: Account): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/signals/history") return null;
  if (!["GET", "POST"].includes(request.method)) return json({ error: "method_not_allowed" }, 405);
  if (!env.APPWRITE_API_KEY || !env.SIGNAL_RECORDS_TABLE_ID) return json({ error: "signal_history_not_configured" }, 503);
  try {
    if (request.method === "GET") {
      const query = new URL(base(env));
      query.searchParams.append("queries[]", JSON.stringify({ method: "equal", attribute: "user_id", values: [account.$id] }));
      query.searchParams.append("queries[]", JSON.stringify({ method: "orderDesc", attribute: "signal_epoch" }));
      query.searchParams.set("limit", "500");
      const response = await fetch(query, { headers: headers(env) });
      if (!response.ok) return json({ error: "signal_history_read_failed" }, 503);
      const result = await response.json() as { rows?: SignalRow[] };
      return json({ rows: (result.rows || []).filter(row => row.user_id === account.$id).map(({ $id, user_id, ...row }) => row) });
    }
    const body = await request.json().catch(() => null) as { rows?: unknown } | null;
    if (!body || !Array.isArray(body.rows) || body.rows.length > 100 || !body.rows.every(validRecord)) {
      return json({ error: "invalid_signal_history_payload" }, 400);
    }
    const results = await Promise.all(body.rows.map(async record => {
      const id = await rowId(account.$id, record.signal_key);
      const endpoint = `${base(env)}/${encodeURIComponent(id)}`;
      const existing = await fetch(endpoint, { headers: headers(env) });
      if (!existing.ok && existing.status !== 404) throw new Error("signal_history_lookup_failed");
      const data = { ...record, user_id: account.$id, created_at: new Date(record.signal_epoch * 1000).toISOString() };
      const saved = await fetch(existing.ok ? endpoint : base(env), {
        method: existing.ok ? "PATCH" : "POST",
        headers: headers(env),
        body: JSON.stringify(existing.ok ? { data, permissions: [] } : { rowId: id, data, permissions: [] }),
      });
      if (!saved.ok) throw new Error("signal_history_save_failed");
      return true;
    }));
    return json({ saved: results.length });
  } catch {
    return json({ error: "signal_history_service_unavailable" }, 503);
  }
}
