import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-mt5-worker-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });

async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const workerId = req.headers.get("x-mt5-worker-id")?.trim() ?? "";
    const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
    if (!workerId || bearer.length < 32) return json({ error: "worker_unauthorized" }, 401);

    const { data: worker, error: authError } = await db
      .from("mt5_bridge_workers")
      .select("worker_id,user_id")
      .eq("worker_id", workerId)
      .eq("worker_token_hash", await digest(bearer))
      .maybeSingle();
    if (authError || !worker) return json({ error: "worker_unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const now = new Date().toISOString();

    if (body.action === "heartbeat") {
      const { error } = await db.from("mt5_bridge_workers").update({
        status: "online",
        version: typeof body.version === "string" ? body.version.slice(0, 40) : null,
        last_seen_at: now,
        last_error_code: null,
        updated_at: now,
      }).eq("worker_id", workerId).eq("user_id", worker.user_id);
      if (error) throw error;
      return json({ ok: true, serverTime: now });
    }

    if (body.action === "poll") {
      const { data, error } = await db.rpc("claim_mt5_bridge_commands", {
        p_worker_id: workerId,
        p_lease_seconds: 90,
        p_limit: 10,
      });
      if (error) throw error;
      return json({ commands: data ?? [] });
    }

    if (body.action === "complete") {
      const commandId = typeof body.commandId === "string" ? body.commandId : "";
      if (!commandId) return json({ error: "invalid_command_id" }, 400);
      const succeeded = body.succeeded === true;
      const result = body.result && typeof body.result === "object" && !Array.isArray(body.result)
        ? body.result
        : {};
      if (/(password|token|secret|credential|authorization)/i.test(JSON.stringify(result))) {
        return json({ error: "secret_fields_not_allowed" }, 400);
      }
      const { data, error } = await db.from("mt5_bridge_commands").update({
        status: succeeded ? "succeeded" : "failed",
        result,
        error_code: succeeded ? null : String(body.errorCode ?? "worker_failed").slice(0, 80),
        completed_at: now,
        lease_expires_at: null,
      }).eq("id", commandId)
        .eq("user_id", worker.user_id)
        .eq("claimed_by", workerId)
        .eq("status", "claimed")
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "command_not_owned_or_expired" }, 409);
      await db.from("mt5_execution_audit").insert({
        user_id: worker.user_id,
        worker_id: workerId,
        event_type: succeeded ? "command_succeeded" : "command_failed",
        idempotency_key: commandId,
        details: { errorCode: succeeded ? null : String(body.errorCode ?? "worker_failed").slice(0, 80) },
      });
      return json({ ok: true });
    }

    return json({ error: "unsupported_action" }, 400);
  } catch (error) {
    console.error("MT5 bridge error:", error instanceof Error ? error.message : "unknown");
    return json({ error: "bridge_internal_error" }, 500);
  }
});
