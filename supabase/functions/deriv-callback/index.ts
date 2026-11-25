const headers = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'" };
const appUrl = (Deno.env.get("APP_URL") || "").replace(/\/$/, "");
const page = (title: string, message: string, status = 200) => {
  const destination = `${appUrl}/?view=options-trader&deriv=${status < 400 ? "connected" : "error"}`;
  return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="1;url=${destination}"><title>${title}</title></head><body style="font:16px system-ui;background:#0b1020;color:#fff;display:grid;min-height:90vh;place-items:center"><main style="max-width:520px;padding:28px"><h2>${title}</h2><p>${message}</p><p>Returning to SuperTech AI…</p></main></body></html>`, { status, headers });
};
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const sha256 = async (value: string) => { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join(""); };
const encrypt = async (plain: string, keyText: string) => {
  const raw = Uint8Array.from(atob(keyText), c => c.charCodeAt(0));
  if (raw.length !== 32) throw new Error("invalid_encryption_key");
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain));
  return `v1.${b64(iv)}.${b64(new Uint8Array(cipher))}`;
};
Deno.serve(async (req: Request) => {
  if (req.method !== "GET") return page("Invalid request", "Unsupported request method.", 405);
  const u = new URL(req.url), code = u.searchParams.get("code"), state = u.searchParams.get("state"), providerError = u.searchParams.get("error");
  const base = Deno.env.get("SUPABASE_URL"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), clientId = Deno.env.get("DERIV_CLIENT_ID"), redirectUri = Deno.env.get("DERIV_REDIRECT_URI"), key = Deno.env.get("DERIV_TOKEN_ENCRYPTION_KEY");
  if (!base || !service || !clientId || !redirectUri || !key || !appUrl) return page("Connection setup incomplete", "SuperTech AI is awaiting administrator configuration.", 503);
  if (!state || state.length > 256 || (code && code.length > 2048)) return page("Invalid authorisation response", "The security check failed. Start again from SuperTech AI.", 400);
  const apiHeaders = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" };
  const stateHash = await sha256(state);
  const consumed = await fetch(`${base}/rest/v1/deriv_oauth_states?state_hash=eq.${stateHash}&consumed_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id,code_verifier`, {
    method: "PATCH", headers: { ...apiHeaders, Prefer: "return=representation" }, body: JSON.stringify({ consumed_at: new Date().toISOString() })
  });
  if (!consumed.ok) return page("Could not verify connection", "Please start a new connection from SuperTech AI.", 400);
  const rows = await consumed.json().catch(() => []);
  if (!Array.isArray(rows) || rows.length !== 1) return page("Authorisation expired", "Please start a new connection from SuperTech AI.", 400);
  if (providerError || !code) return page("Connection cancelled", "No Deriv account was connected. You can try again in SuperTech AI.", 400);
  try {
    const form = new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, code, code_verifier: rows[0].code_verifier, redirect_uri: redirectUri });
    const tokenResponse = await fetch("https://auth.deriv.com/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form });
    const token = await tokenResponse.json();
    if (!tokenResponse.ok || typeof token.access_token !== "string" || !Number.isFinite(Number(token.expires_in))) return page("Could not finish connection", "Deriv did not accept the authorisation. Please reconnect.", 502);
    const accountsResponse = await fetch("https://api.derivws.com/trading/v1/options/accounts", { headers: { Authorization: `Bearer ${token.access_token}` } });
    const accountPayload = await accountsResponse.json();
    if (!accountsResponse.ok) return page("Account check failed", "Authorisation was received, but Deriv accounts could not be verified. Please reconnect or contact support.", 502);
    const accountRows = Array.isArray(accountPayload.data) ? accountPayload.data : accountPayload.data ? [accountPayload.data] : [];
    const safeAccounts = accountRows.map((a: Record<string, unknown>) => ({ account_id: String(a.account_id ?? ""), account_type: String(a.account_type ?? ""), currency: String(a.currency ?? ""), status: String(a.status ?? "") })).filter((a: {account_id:string}) => a.account_id);
    const encrypted = await encrypt(token.access_token, key);
    const expires = new Date(Date.now() + Number(token.expires_in) * 1000).toISOString();
    const saved = await fetch(`${base}/rest/v1/deriv_oauth_grants`, {
      method: "POST", headers: { ...apiHeaders, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ user_id: rows[0].user_id, encrypted_access_token: encrypted, token_expires_at: expires, accounts: safeAccounts, connection_status: "connected", updated_at: new Date().toISOString() })
    });
    if (!saved.ok) return page("Secure save failed", "The account was authorised but could not be stored securely. No trades have been enabled. Contact support.", 500);
    return page("Deriv connected", "Your Deriv account is connected securely. Return to SuperTech AI to choose Demo or Real.");
  } catch {
    return page("Connection interrupted", "No trading was enabled. Please reconnect from SuperTech AI.", 500);
  }
});