import type { Env } from "./index";
type Account = { $id: string };
type PreferenceRow = { $id: string; user_id: string; categories_json?: string };
type AlertMode = "full" | "bubble" | "muted";
type ModeMap = Record<string, AlertMode>;
type StoredPreferences = { categories: ModeMap; assets: ModeMap; defaultAssetMode: AlertMode; updatedAt: string | null };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});
function tableUrl(env: Env) {
  return `${env.APPWRITE_ENDPOINT.replace(/\/$/, "")}/tablesdb/${env.APPWRITE_DATABASE_ID}/tables/${env.ALERT_PREFERENCES_TABLE_ID}/rows`;
}
function headers(env: Env) {
  return { "X-Appwrite-Project": env.APPWRITE_PROJECT_ID, "X-Appwrite-Key": env.APPWRITE_API_KEY!, "Content-Type": "application/json" };
}
const validMode = (value: unknown): value is AlertMode => value === "full" || value === "bubble" || value === "muted";
const defaultPreferences = (): StoredPreferences => ({
  categories: { signals: "bubble", targets: "bubble", stops: "bubble", limitOrders: "bubble", pendingOrders: "bubble", superSignals: "bubble", income: "bubble", business: "bubble" },
  assets: {}, defaultAssetMode: "bubble", updatedAt: null,
});
function readPreferences(value?: string): StoredPreferences {
  try {
    const parsed = JSON.parse(value || "{}") as Partial<StoredPreferences>;
    const modes = (input: unknown): ModeMap => {
      if (!input || typeof input !== "object" || Array.isArray(input)) return {};
      return Object.fromEntries(Object.entries(input).filter(([key, mode]) => key.length <= 64 && validMode(mode))) as ModeMap;
    };
    const defaults = defaultPreferences();
    return {
      categories: { ...defaults.categories, ...modes(parsed.categories) },
      assets: modes(parsed.assets),
      defaultAssetMode: validMode(parsed.defaultAssetMode) ? parsed.defaultAssetMode : "bubble",
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
    };
  } catch { return defaultPreferences(); }
}
function present(row: PreferenceRow) { return readPreferences(row.categories_json); }
export async function handleAlertPreferences(request: Request, env: Env, account: Account): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/preferences/alerts") return null;
  if (!["GET", "PATCH"].includes(request.method)) return json({ error: "method_not_allowed" }, 405);
  if (!env.APPWRITE_API_KEY || !env.ALERT_PREFERENCES_TABLE_ID) return json({ error: "alert_preferences_not_configured" }, 503);
  const base = tableUrl(env);
  const rowId = account.$id.replace(/-/g, "").slice(0, 32);
  try {
    const read = await fetch(`${base}/${encodeURIComponent(rowId)}`, { headers: headers(env) });
    let row: PreferenceRow | null = null;
    if (read.ok) {
      row = await read.json() as PreferenceRow;
      if (row.user_id !== account.$id) return json({ error: "preference_owner_mismatch" }, 403);
    } else if (read.status !== 404) return json({ error: "alert_preferences_read_failed" }, 503);

    if (request.method === "GET") {
      if (row) return json(present(row));
      const defaults = defaultPreferences();
      const created = await fetch(base, { method: "POST", headers: headers(env), body: JSON.stringify({
        rowId, data: { user_id: account.$id, categories_json: JSON.stringify(defaults) }, permissions: [],
      }) });
      if (!created.ok) {
        const retry = await fetch(`${base}/${encodeURIComponent(rowId)}`, { headers: headers(env) });
        if (!retry.ok) return json({ error: "alert_preferences_initialize_failed" }, 503);
        const saved = await retry.json() as PreferenceRow;
        if (saved.user_id !== account.$id) return json({ error: "preference_owner_mismatch" }, 403);
        return json(present(saved));
      }
      return json(present(await created.json() as PreferenceRow));
    }

    const body = await request.json().catch(() => null) as { categories?: unknown; assets?: unknown; defaultAssetMode?: unknown } | null;
    if (!body) return json({ error: "invalid_preferences_payload" }, 400);
    const current = row ? present(row) : defaultPreferences();
    const categories = body.categories === undefined ? current.categories : body.categories;
    const assets = body.assets === undefined ? current.assets : body.assets;
    const mode = body.defaultAssetMode === undefined ? current.defaultAssetMode : body.defaultAssetMode;
    const validMap = (value: unknown, maxItems: number) => Boolean(value && typeof value === "object" && !Array.isArray(value)
      && Object.keys(value as object).length <= maxItems
      && Object.entries(value as Record<string, unknown>).every(([key, item]) => key.length > 0 && key.length <= 64 && validMode(item)));
    if (!validMap(categories, 50)) return json({ error: "invalid_alert_categories" }, 400);
    if (!validMap(assets, 80)) return json({ error: "invalid_alert_assets" }, 400);
    if (!validMode(mode)) return json({ error: "invalid_default_asset_mode" }, 400);
    const savedPreferences: StoredPreferences = {
      categories: categories as ModeMap, assets: assets as ModeMap, defaultAssetMode: mode,
      updatedAt: new Date().toISOString(),
    };
    const serialized = JSON.stringify(savedPreferences);
    if (serialized.length > 12000) return json({ error: "alert_preferences_too_large" }, 413);
    const saved = await fetch(row ? `${base}/${encodeURIComponent(rowId)}` : base, {
      method: row ? "PATCH" : "POST", headers: headers(env),
      body: JSON.stringify(row ? { data: { categories_json: serialized }, permissions: [] } : {
        rowId, data: { user_id: account.$id, categories_json: serialized }, permissions: [],
      }),
    });
    if (!saved.ok) return json({ error: "alert_preferences_save_failed" }, 503);
    const result = await saved.json() as PreferenceRow;
    if (result.user_id !== account.$id) return json({ error: "preference_owner_mismatch" }, 403);
    return json(present(result));
  } catch { return json({ error: "alert_preferences_service_unavailable" }, 503); }
}
