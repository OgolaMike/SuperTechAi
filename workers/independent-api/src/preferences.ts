import type { Env } from "./index";

type Account = { $id: string };
type PreferenceRow = {
  $id: string;
  user_id: string;
  categories_json?: string;
  assets_json?: string;
  default_asset_mode?: string;
  updated_at?: string;
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

function tableUrl(env: Env) {
  return `${env.APPWRITE_ENDPOINT.replace(/\/$/, "")}/tablesdb/${env.APPWRITE_DATABASE_ID}/tables/${env.ALERT_PREFERENCES_TABLE_ID}/rows`;
}
function headers(env: Env) {
  return {
    "X-Appwrite-Project": env.APPWRITE_PROJECT_ID,
    "X-Appwrite-Key": env.APPWRITE_API_KEY!,
    "Content-Type": "application/json",
  };
}
function parseArray(value: string | undefined): string[] {
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch { return []; }
}
function present(row: PreferenceRow) {
  return {
    categories: parseArray(row.categories_json),
    assets: parseArray(row.assets_json),
    defaultAssetMode: row.default_asset_mode || "all",
    updatedAt: row.updated_at || null,
  };
}

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
    } else if (read.status !== 404) {
      return json({ error: "alert_preferences_read_failed" }, 503);
    }

    if (request.method === "GET") {
      if (row) return json(present(row));
      const defaults = {
        user_id: account.$id,
        categories_json: JSON.stringify(["signals", "price_alerts"]),
        assets_json: "[]",
        default_asset_mode: "all",
        updated_at: new Date().toISOString(),
      };
      const created = await fetch(base, {
        method: "POST", headers: headers(env),
        body: JSON.stringify({ rowId, data: defaults, permissions: [] }),
      });
      if (!created.ok) {
        // Concurrent first reads may race to create the deterministic row.
        const retry = await fetch(`${base}/${encodeURIComponent(rowId)}`, { headers: headers(env) });
        if (!retry.ok) return json({ error: "alert_preferences_initialize_failed" }, 503);
        const saved = await retry.json() as PreferenceRow;
        if (saved.user_id !== account.$id) return json({ error: "preference_owner_mismatch" }, 403);
        return json(present(saved));
      }
      return json(present(await created.json() as PreferenceRow));
    }

    const body = await request.json().catch(() => null) as {
      categories?: unknown; assets?: unknown; defaultAssetMode?: unknown;
    } | null;
    if (!body) return json({ error: "invalid_preferences_payload" }, 400);
    const current = row || {
      $id: rowId, user_id: account.$id,
      categories_json: JSON.stringify(["signals", "price_alerts"]),
      assets_json: "[]", default_asset_mode: "all",
    };
    const categories = body.categories === undefined ? parseArray(current.categories_json) : body.categories;
    const assets = body.assets === undefined ? parseArray(current.assets_json) : body.assets;
    const mode = body.defaultAssetMode === undefined ? current.default_asset_mode || "all" : body.defaultAssetMode;
    if (!Array.isArray(categories) || categories.length > 50 || categories.some(x => typeof x !== "string" || x.length > 64)) {
      return json({ error: "invalid_alert_categories" }, 400);
    }
    if (!Array.isArray(assets) || assets.length > 80 || assets.some(x => typeof x !== "string" || x.length > 32)) {
      return json({ error: "invalid_alert_assets" }, 400);
    }
    if (!["all", "selected"].includes(String(mode))) return json({ error: "invalid_default_asset_mode" }, 400);
    const categoriesJson = JSON.stringify([...new Set(categories as string[])]);
    const assetsJson = JSON.stringify([...new Set(assets as string[])]);
    if (categoriesJson.length > 12000 || assetsJson.length > 1024) return json({ error: "alert_preferences_too_large" }, 413);
    const data = {
      user_id: account.$id, categories_json: categoriesJson, assets_json: assetsJson,
      default_asset_mode: mode, updated_at: new Date().toISOString(),
    };
    const saved = await fetch(row ? `${base}/${encodeURIComponent(rowId)}` : base, {
      method: row ? "PATCH" : "POST", headers: headers(env),
      body: JSON.stringify(row ? { data, permissions: [] } : { rowId, data, permissions: [] }),
    });
    if (!saved.ok) return json({ error: "alert_preferences_save_failed" }, 503);
    const result = await saved.json() as PreferenceRow;
    if (result.user_id !== account.$id) return json({ error: "preference_owner_mismatch" }, 403);
    return json(present(result));
  } catch {
    return json({ error: "alert_preferences_service_unavailable" }, 503);
  }
}
