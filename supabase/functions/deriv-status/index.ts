const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const decrypt = async (value: string, keyText: string) => {
  const [version, ivText, cipherText] = value.split(".");
  if (version !== "v1" || !ivText || !cipherText) throw new Error("invalid_ciphertext");
  const raw = Uint8Array.from(atob(keyText), c => c.charCodeAt(0));
  if (raw.length !== 32) throw new Error("invalid_encryption_key");
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
  const decode = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(ivText) }, key, decode(cipherText));
  return new TextDecoder().decode(plain);
};
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const base = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, key = Deno.env.get("DERIV_TOKEN_ENCRYPTION_KEY");
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "authentication_required" }, 401);
  const identity = await fetch(`${base}/auth/v1/user`, { headers: { apikey: anon, Authorization: auth } });
  if (!identity.ok) return json({ error: "invalid_session" }, 401);
  const user = await identity.json();
  const query = await fetch(`${base}/rest/v1/deriv_oauth_grants?user_id=eq.${user.id}&select=accounts,token_expires_at,connection_status,encrypted_access_token&limit=1`, { headers: { apikey: service, Authorization: `Bearer ${service}` } });
  if (!query.ok) return json({ error: "status_unavailable" }, 500);
  const rows = await query.json();
  const row = rows[0];
  if (!row || row.connection_status !== "connected") return json({ connected: false, accounts: [] });
  if (Date.parse(row.token_expires_at) <= Date.now()) return json({ connected: false, needsReconnect: true, accounts: row.accounts ?? [] });
  if (!key) return json({ error: "secure_storage_not_configured" }, 503);
  try {
    const token = await decrypt(row.encrypted_access_token, key);
    const response = await fetch("https://api.derivws.com/trading/v1/options/accounts", { headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 401) return json({ connected: false, needsReconnect: true, accounts: row.accounts ?? [] });
    if (!response.ok) return json({ connected: true, accounts: row.accounts ?? [], accountCheck: "unavailable" });
    const payload = await response.json();
    const list = Array.isArray(payload.data) ? payload.data : payload.data ? [payload.data] : [];
    const accounts = list.map((a: Record<string, unknown>) => ({ account_id: String(a.account_id ?? ""), account_type: String(a.account_type ?? ""), currency: String(a.currency ?? ""), status: String(a.status ?? "") })).filter((a: {account_id:string}) => a.account_id);
    return json({ connected: true, accounts, expiresAt: row.token_expires_at });
  } catch { return json({ connected: false, needsReconnect: true, accounts: [] }); }
});