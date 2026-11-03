import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-mt5-worker-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "content-type": "application/json" },
});
async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}
function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function memberIdFromToken(token: string): Promise<string | null> {
  if (!token) return null;
  const authClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { auth: { persistSession: false } },
  );
  const { data, error } = await authClient.auth.getUser(token);
  return error || !data.user ? null : data.user.id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const authHeader = req.headers.get("authorization") ?? "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();

    // Member-initiated pairing: validate the Supabase user session and issue
    // a one-time worker credential. No MT5 password is requested or stored.
    if (body.action === "pair") {
      if (!bearer) return json({ error: "member_unauthorized" }, 401);
      const memberId = await memberIdFromToken(bearer);
      if (!memberId) return json({ error: "member_unauthorized" }, 401);

      const login = String(body.accountLogin ?? "").trim();
      const server = String(body.server ?? "").trim();
      if (!/^\d{4,20}$/.test(login) || !server || server.length > 120) {
        return json({ error: "valid_mt5_login_and_server_required" }, 400);
      }

      const userId = memberId;
      const { error: settingsError } = await db.from("mt5_account_settings").upsert({
        user_id: userId,
        login,
        server,
        bridge_status: "connecting",
        auto_trade_enabled: false,
        adopt_pending_orders: false,
        manage_existing_positions: false,
        place_new_orders: false,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (settingsError) throw settingsError;

      // Re-pairing revokes every previously issued worker token for this member.
      const { error: revokeError } = await db.from("mt5_bridge_workers").update({
        status: "offline", worker_token_hash: null, updated_at: new Date().toISOString(),
      }).eq("user_id", userId);
      if (revokeError) throw revokeError;

      const workerId = crypto.randomUUID();
      const workerToken = randomToken();
      const { error: workerError } = await db.from("mt5_bridge_workers").insert({
        worker_id: workerId,
        user_id: userId,
        worker_token_hash: await digest(workerToken),
        status: "offline",
      });
      if (workerError) throw workerError;

      return json({
        ok: true,
        workerId,
        workerToken,
        message: "Copy this worker token now. It is returned once and cannot be retrieved again.",
      });
    }


    if (body.action === "request_read_only_sync") {
      const memberId = await memberIdFromToken(bearer);
      if (!memberId) return json({ error: "member_unauthorized" }, 401);
      const { data: settings, error: settingsError } = await db.from("mt5_account_settings")
        .select("bridge_status").eq("user_id", memberId).maybeSingle();
      if (settingsError || !settings) return json({ error: "mt5_account_not_paired" }, 404);
      if (settings.bridge_status !== "connected") return json({ error: "mt5_worker_not_connected" }, 409);
      const syncId = crypto.randomUUID();
      const commands = ["sync_account", "list_pending_orders", "list_positions"].map((commandType) => ({
        user_id: memberId,
        idempotency_key: `${syncId}:${commandType}`,
        command_type: commandType,
        payload: {},
      }));
      const { error } = await db.from("mt5_bridge_commands").insert(commands);
      if (error) throw error;
      return json({ ok: true, syncId, queued: commands.length });
    }

    if (body.action === "read_only_sync_status") {
      const memberId = await memberIdFromToken(bearer);
      if (!memberId) return json({ error: "member_unauthorized" }, 401);
      const syncId = String(body.syncId ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(syncId)) return json({ error: "invalid_sync_id" }, 400);
      const { data, error } = await db.from("mt5_bridge_commands")
        .select("command_type,status,result,error_code,created_at,completed_at")
        .eq("user_id", memberId)
        .like("idempotency_key", `${syncId}:%`)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return json({ commands: data ?? [] });
    }

    const workerId = req.headers.get("x-mt5-worker-id")?.trim() ?? "";
    if (!workerId || bearer.length < 32) return json({ error: "worker_unauthorized" }, 401);
    const { data: worker, error: authError } = await db
      .from("mt5_bridge_workers")
      .select("worker_id,user_id")
      .eq("worker_id", workerId)
      .eq("worker_token_hash", await digest(bearer))
      .maybeSingle();
    if (authError || !worker) return json({ error: "worker_unauthorized" }, 401);

    const now = new Date().toISOString();
    if (body.action === "heartbeat") {
      const account = body.account && typeof body.account === "object" ? body.account : {};
      const { data: settings, error: settingsError } = await db
        .from("mt5_account_settings")
        .select("login,server")
        .eq("user_id", worker.user_id)
        .maybeSingle();
      if (settingsError || !settings) throw settingsError ?? new Error("account_settings_missing");
      if (String(account.login ?? "") !== settings.login || String(account.server ?? "") !== settings.server) {
        await db.from("mt5_bridge_workers").update({
          status: "error", last_error_code: "account_identity_mismatch", last_seen_at: now, updated_at: now,
        }).eq("worker_id", workerId);
        await db.from("mt5_account_settings").update({
          bridge_status: "error", updated_at: now,
        }).eq("user_id", worker.user_id);
        return json({ error: "account_identity_mismatch" }, 409);
      }
      const balance = Number(account.balance);
      const equity = Number(account.equity);
      if (!Number.isFinite(balance) || !Number.isFinite(equity) || balance <= 0 || equity <= 0) {
        return json({ error: "invalid_account_risk_snapshot" }, 400);
      }
      // The server defines the UTC date and first-observed baseline. The worker
      // cannot choose the date or overwrite the opening baseline.
      const utcDate = now.slice(0, 10);
      const { error: baselineInsertError } = await db.from("mt5_daily_risk_snapshots").upsert({
        user_id: worker.user_id,
        utc_date: utcDate,
        starting_balance: balance,
        starting_equity: equity,
        latest_balance: balance,
        latest_equity: equity,
        daily_equity_change_pct: 0,
        updated_at: now,
      }, { onConflict: "user_id,utc_date", ignoreDuplicates: true });
      if (baselineInsertError) throw baselineInsertError;
      const { data: baseline, error: baselineReadError } = await db.from("mt5_daily_risk_snapshots")
        .select("starting_balance,starting_equity")
        .eq("user_id", worker.user_id).eq("utc_date", utcDate).single();
      if (baselineReadError || !baseline) throw baselineReadError ?? new Error("daily_risk_baseline_missing");
      const dealSummary = account.deal_summary && typeof account.deal_summary === "object"
        ? account.deal_summary : {};
      const cashFlowAdjustment = Number(dealSummary.cash_flow_adjustment ?? 0);
      const realizedTradingNet = Number(dealSummary.realized_trading_net ?? 0);
      const dealCount = Number(dealSummary.deal_count ?? 0);
      const historyComplete = dealSummary.history_complete === true;
      const latestDealEpoch = Number(dealSummary.latest_deal_epoch ?? 0);
      if (!Number.isFinite(cashFlowAdjustment) || !Number.isFinite(realizedTradingNet) ||
          !Number.isInteger(dealCount) || dealCount < 0 || dealCount > 100000 ||
          !Number.isFinite(latestDealEpoch) || latestDealEpoch < 0) {
        return json({ error: "invalid_deal_history_summary" }, 400);
      }
      // Remove deposits, withdrawals, credits, charges, corrections and bonuses
      // from the equity delta. Commissions, swaps and fees remain trading costs.
      const dailyEquityChangePct = ((equity - Number(baseline.starting_equity) -
        cashFlowAdjustment) / Number(baseline.starting_equity)) * 100;
      const dailyLossPct = Math.max(0, -dailyEquityChangePct);
      const { error: snapshotUpdateError } = await db.from("mt5_daily_risk_snapshots").update({
        latest_balance: balance,
        latest_equity: equity,
        daily_equity_change_pct: Number(dailyEquityChangePct.toFixed(4)),
        cash_flow_adjustment: cashFlowAdjustment,
        realized_trading_net: realizedTradingNet,
        deal_count: dealCount,
        history_complete: historyComplete,
        latest_deal_epoch: latestDealEpoch || null,
        updated_at: now,
      }).eq("user_id", worker.user_id).eq("utc_date", utcDate);
      if (snapshotUpdateError) throw snapshotUpdateError;

      const { error } = await db.from("mt5_bridge_workers").update({
        status: "online",
        version: typeof body.version === "string" ? body.version.slice(0, 40) : null,
        last_seen_at: now,
        last_error_code: null,
        updated_at: now,
      }).eq("worker_id", workerId).eq("user_id", worker.user_id);
      if (error) throw error;
      await db.from("mt5_account_settings").update({
        bridge_status: "connected", last_seen_at: now, updated_at: now,
      }).eq("user_id", worker.user_id);
      return json({
        ok: true, serverTime: now, dailyLossPct: Number(dailyLossPct.toFixed(4)),
        dailyEquityChangePct: Number(dailyEquityChangePct.toFixed(4)),
        cashFlowAdjustment, realizedTradingNet, dealCount, historyComplete, utcDate,
      });
    }

    if (body.action === "poll") {
      const { data, error } = await db.rpc("claim_mt5_bridge_commands", {
        p_worker_id: workerId, p_lease_seconds: 90, p_limit: 10,
      });
      if (error) throw error;
      return json({ commands: data ?? [] });
    }

    if (body.action === "complete") {
      const commandId = typeof body.commandId === "string" ? body.commandId : "";
      if (!commandId) return json({ error: "invalid_command_id" }, 400);
      const succeeded = body.succeeded === true;
      const result = body.result && typeof body.result === "object" && !Array.isArray(body.result) ? body.result : {};
      if (/(password|token|secret|credential|authorization)/i.test(JSON.stringify(result))) {
        return json({ error: "secret_fields_not_allowed" }, 400);
      }
      const { data, error } = await db.from("mt5_bridge_commands").update({
        status: succeeded ? "succeeded" : "failed",
        result,
        error_code: succeeded ? null : String(body.errorCode ?? "worker_failed").slice(0, 80),
        completed_at: now,
        lease_expires_at: null,
      }).eq("id", commandId).eq("user_id", worker.user_id)
        .eq("claimed_by", workerId).eq("status", "claimed")
        .select("id").maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "command_not_owned_or_expired" }, 409);
      await db.from("mt5_execution_audit").insert({
        user_id: worker.user_id, worker_id: workerId,
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
