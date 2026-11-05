import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const clientId = Deno.env.get("CTRADER_CLIENT_ID");
  const redirectUri = Deno.env.get("CTRADER_REDIRECT_URI");
  if (!clientId || !redirectUri) return json({ error: "ctrader_not_configured" }, 503);
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "authentication_required" }, 401);

  const identity = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: auth } });
  if (!identity.ok) return json({ error: "invalid_session" }, 401);
  const user = await identity.json();
  if (!user?.id) return json({ error: "invalid_session" }, 401);

  const { redirectPath = "/" } = await req.json().catch(() => ({}));
  const safePath = typeof redirectPath === "string" && redirectPath.startsWith("/") && !redirectPath.startsWith("//") ? redirectPath : "/";
  const state = crypto.randomUUID() + "." + crypto.randomUUID();
  const stateHash = await sha256(state);
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  const insert = await fetch(`${url}/rest/v1/ctrader_oauth_states`, {
    method: "POST",
    headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ state_hash: stateHash, user_id: user.id, redirect_path: safePath, expires_at: expiresAt })
  });
  if (!insert.ok) return json({ error: "could_not_start_authorisation" }, 500);

  const authorize = new URL("https://id.ctrader.com/my/settings/openapi/grantingaccess/");
  authorize.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, scope: "trading", product: "web", state }).toString();
  return json({ authorizationUrl: authorize.toString(), expiresAt });
});
