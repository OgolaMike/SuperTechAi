const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "GET, OPTIONS", "Content-Type": "text/html; charset=utf-8" };
const page = (title: string, message: string, status = 200) => new Response(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font:16px system-ui;background:#0b1020;color:#fff;display:grid;min-height:90vh;place-items:center"><main style="max-width:520px;padding:28px"><h2>${title}</h2><p>${message}</p><p>You can close this window and return to SuperTech AI.</p></main></body></html>`, { status, headers: cors });
const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
};
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const encrypt = async (plain: string, keyText: string) => {
  const raw = Uint8Array.from(atob(keyText), (c) => c.charCodeAt(0));
  if (raw.length !== 32) throw new Error("CTRADER_TOKEN_ENCRYPTION_KEY must be base64 for exactly 32 random bytes");
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain));
  return `v1.${b64(iv)}.${b64(new Uint8Array(cipher))}`;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET") return page("Invalid request", "Unsupported request method.", 405);
  const u = new URL(req.url);
  const code = u.searchParams.get("code");
  const state = u.searchParams.get("state");
  const oauthError = u.searchParams.get("error");
  if (oauthError) return page("Authorisation not completed", "cTrader did not grant access. Return to SuperTech AI and try again.", 400);
  if (!code || !state || code.length > 2048 || state.length > 256) return page("Invalid authorisation response", "The callback was incomplete. Start again from SuperTech AI.", 400);

  const base = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const clientId = Deno.env.get("CTRADER_CLIENT_ID");
  const clientSecret = Deno.env.get("CTRADER_CLIENT_SECRET");
  const redirectUri = Deno.env.get("CTRADER_REDIRECT_URI");
  const encryptionKey = Deno.env.get("CTRADER_TOKEN_ENCRYPTION_KEY");
  if (!clientId || !clientSecret || !redirectUri || !encryptionKey) return page("Connection setup incomplete", "The cTrader integration is awaiting administrator configuration.", 503);

  const headers = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" };
  const stateHash = await sha256(state);
  const consumed = await fetch(`${base}/rest/v1/ctrader_oauth_states?state_hash=eq.${stateHash}&consumed_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id,redirect_path`, {
    method: "PATCH", headers: { ...headers, Prefer: "return=representation" }, body: JSON.stringify({ consumed_at: new Date().toISOString() })
  });
  if (!consumed.ok) return page("Authorisation could not be verified", "The security check failed. Start a new connection from SuperTech AI.", 400);
  const states = await consumed.json();
  if (!Array.isArray(states) || states.length !== 1) return page("Authorisation expired", "This request was already used or expired. Start again from SuperTech AI.", 400);
  const owner = states[0];

  const tokenUrl = new URL("https://openapi.ctrader.com/apps/token");
  tokenUrl.search = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret }).toString();
  const tokenResponse = await fetch(tokenUrl, { headers: { Accept: "application/json" } });
  if (!tokenResponse.ok) return page("Token exchange failed", "cTrader did not accept the authorisation code. Please reconnect.", 502);
  const token = await tokenResponse.json();
  if (!token.accessToken || !token.refreshToken || token.errorCode) return page("Token exchange failed", "cTrader returned an invalid authorisation response. Please reconnect.", 502);

  try {
    const [access, refresh] = await Promise.all([encrypt(token.accessToken, encryptionKey), encrypt(token.refreshToken, encryptionKey)]);
    const save = await fetch(`${base}/rest/v1/ctrader_oauth_grants`, {
      method: "POST", headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({ user_id: owner.user_id, encrypted_access_token: access, encrypted_refresh_token: refresh, token_expires_at: new Date(Date.now() + Number(token.expiresIn || 2628000) * 1000).toISOString(), granted_scopes: ["trading"], status: "account_discovery_pending" })
    });
    if (!save.ok) return page("Secure storage failed", "Access was authorised but could not be stored securely. Contact support before reconnecting.", 500);
  } catch {
    return page("Secure storage is not configured", "The token encryption key is invalid. Contact support.", 503);
  }
  return page("cTrader authorised", "Your cTrader authorisation was received and encrypted. Account discovery is the next setup step.");
});
