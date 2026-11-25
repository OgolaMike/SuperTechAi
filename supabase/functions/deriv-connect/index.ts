const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
const sha256 = async (value: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const base = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const clientId = Deno.env.get("DERIV_CLIENT_ID"), redirectUri = Deno.env.get("DERIV_REDIRECT_URI");
  if (!clientId || !redirectUri) return json({ error: "deriv_oauth_not_configured" }, 503);
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "authentication_required" }, 401);
  const identity = await fetch(`${base}/auth/v1/user`, { headers: { apikey: anon, Authorization: auth } });
  if (!identity.ok) return json({ error: "invalid_session" }, 401);
  const user = await identity.json();
  if (!user?.id) return json({ error: "invalid_session" }, 401);
  const state = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(64)));
  const challenge = b64url(await sha256(verifier));
  const stateHash = b64url(await sha256(state));
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  const saved = await fetch(`${base}/rest/v1/deriv_oauth_states`, {
    method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ state_hash: stateHash, user_id: user.id, code_verifier: verifier, expires_at: expiresAt })
  });
  if (!saved.ok) return json({ error: "could_not_start_authorisation" }, 500);
  const authorize = new URL("https://auth.deriv.com/oauth2/auth");
  authorize.search = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: redirectUri, scope: "trade", state, code_challenge: challenge, code_challenge_method: "S256" }).toString();
  return json({ authorizationUrl: authorize.toString() });
});