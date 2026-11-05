const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const base = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "authentication_required" }, 401);
  const identity = await fetch(`${base}/auth/v1/user`, { headers: { apikey: anon, Authorization: auth } });
  if (!identity.ok) return json({ error: "invalid_session" }, 401);
  const user = await identity.json();
  const result = await fetch(`${base}/rest/v1/ctrader_oauth_grants?user_id=eq.${user.id}&status=neq.revoked`, {
    method: "PATCH", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ status: "revoked", encrypted_access_token: "revoked", encrypted_refresh_token: "revoked", updated_at: new Date().toISOString() })
  });
  if (!result.ok) return json({ error: "disconnect_failed" }, 500);
  return json({ disconnected: true, note: "New automation must be paused by the execution gateway before this connection is removed." });
});
