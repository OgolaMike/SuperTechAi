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
        live_execution_enabled: false,
        emergency_stop: true,
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

    if (body.action === "pending_order_preflight_status") {
      const memberId = await memberIdFromToken(bearer);
      if (!memberId) return json({ error: "member_unauthorized" }, 401);
      const commandId = String(body.commandId ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(commandId)) return json({ error: "invalid_command_id" }, 400);
      const { data, error } = await db.from("mt5_bridge_commands")
        .select("id,command_type,status,result,error_code,created_at,completed_at")
        .eq("id", commandId).eq("user_id", memberId)
        .eq("command_type", "preflight_pending_order").maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "preflight_request_not_found" }, 404);
      return json({ command: data });
    }

    if (body.action === "preflight_pending_order") {
      const memberId = await memberIdFromToken(bearer);
      if (!memberId) return json({ error: "member_unauthorized" }, 401);
      const symbol = String(body.symbol ?? "").trim().slice(0, 40);
      const direction = String(body.direction ?? "").toUpperCase();
      const orderType = String(body.orderType ?? "").toUpperCase();
      const entry = Number(body.entry), stopLoss = Number(body.stopLoss), takeProfit = Number(body.takeProfit);
      const idempotencyKey = String(body.idempotencyKey ?? "");
      if (!symbol || !["BUY","SELL"].includes(direction) ||
          !["BUY_STOP","SELL_STOP","BUY_LIMIT","SELL_LIMIT"].includes(orderType) ||
          ![entry,stopLoss,takeProfit].every(Number.isFinite) ||
          !/^[0-9a-f-]{36}$/i.test(idempotencyKey)) {
        return json({ error: "invalid_pending_order_proposal" }, 400);
      }
      if ((orderType.startsWith("BUY") && direction !== "BUY") ||
          (orderType.startsWith("SELL") && direction !== "SELL")) {
        return json({ error: "order_type_direction_mismatch" }, 400);
      }
      const { data: settings, error: settingsError } = await db.from("mt5_account_settings")
        .select("login,server,bridge_status,place_new_orders,risk_controls_enabled,max_risk_per_trade_pct,max_daily_loss_pct,max_open_positions,max_spread_points,max_slippage_points")
        .eq("user_id", memberId).maybeSingle();
      if (settingsError || !settings) return json({ error: "mt5_account_not_paired" }, 404);
      if (settings.bridge_status !== "connected") return json({ error: "mt5_worker_not_connected" }, 409);
      if (settings.place_new_orders !== true || settings.risk_controls_enabled !== true) {
        return json({ error: "new_order_permission_or_risk_controls_disabled" }, 403);
      }
      if (Number(settings.max_spread_points) <= 0 || Number(settings.max_slippage_points) <= 0) {
        return json({ error: "spread_and_slippage_limits_required" }, 403);
      }
      const requestTime = new Date().toISOString();
      const utcDate = requestTime.slice(0,10);
      const { data: daily, error: dailyError } = await db.from("mt5_daily_risk_snapshots")
        .select("starting_equity,latest_equity,cash_flow_adjustment")
        .eq("user_id",memberId).eq("utc_date",utcDate).maybeSingle();
      if (dailyError || !daily || Number(daily.starting_equity) <= 0) {
        return json({ error: "daily_risk_baseline_unavailable" }, 409);
      }
      const dailyLossPct = Math.max(0, -((Number(daily.latest_equity)-Number(daily.starting_equity)-Number(daily.cash_flow_adjustment ?? 0))/Number(daily.starting_equity))*100);
      const { data: inserted, error: queueError } = await db.from("mt5_bridge_commands").insert({
        user_id: memberId, idempotency_key: idempotencyKey, command_type: "preflight_pending_order",
        payload: { login: settings.login, server: settings.server, symbol, direction, order_type: orderType,
          entry, stop_loss: stopLoss, take_profit: takeProfit, daily_loss_pct: dailyLossPct,
          settings: { place_new_orders: settings.place_new_orders, risk_controls_enabled: settings.risk_controls_enabled,
            max_risk_per_trade_pct: settings.max_risk_per_trade_pct, max_daily_loss_pct: settings.max_daily_loss_pct,
            max_open_positions: settings.max_open_positions, max_spread_points: settings.max_spread_points,
            max_slippage_points: settings.max_slippage_points } }
      }).select("id").single();
      if (queueError) {
        if (queueError.code === "23505") return json({ error: "duplicate_preflight_request" }, 409);
        throw queueError;
      }
      await db.from("mt5_execution_audit").insert({ user_id: memberId, event_type: "pending_order_preflight_requested",
        idempotency_key: idempotencyKey, details: { commandId: inserted.id, symbol, direction, orderType } });
      return json({ ok: true, commandId: inserted.id, message: "Pending order proposal queued for broker-side dry-run validation. No order will be placed." });
    }

    if (body.action === "approve_pending_order") {
      const memberId = await memberIdFromToken(bearer);
      if (!memberId) return json({ error: "member_unauthorized" }, 401);
      const approvalTime = new Date().toISOString();
      const preflightId = String(body.preflightCommandId ?? "");
      const idempotencyKey = String(body.idempotencyKey ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(preflightId) || !/^[0-9a-f-]{36}$/i.test(idempotencyKey)) {
        return json({ error: "invalid_execution_approval" }, 400);
      }
      const { data: preflight, error: preflightError } = await db.from("mt5_bridge_commands")
        .select("id,status,result,payload")
        .eq("id", preflightId).eq("user_id", memberId)
        .eq("command_type", "preflight_pending_order").maybeSingle();
      if (preflightError) throw preflightError;
      if (!preflight || preflight.status !== "succeeded" ||
          preflight.result?.preflight !== "approved" || preflight.result?.dry_run_only !== true) {
        return json({ error: "successful_broker_preflight_required" }, 409);
      }
      const { data: settings, error: settingsError } = await db.from("mt5_account_settings")
        .select("login,server,bridge_status,place_new_orders,risk_controls_enabled,live_execution_enabled,emergency_stop,max_daily_loss_pct")
        .eq("user_id", memberId).maybeSingle();
      if (settingsError || !settings) return json({ error: "mt5_account_not_paired" }, 404);
      if (settings.bridge_status !== "connected" || settings.place_new_orders !== true ||
          settings.risk_controls_enabled !== true || settings.live_execution_enabled !== true ||
          settings.emergency_stop !== false) {
        return json({ error: "live_execution_not_authorized_or_emergency_stop_active" }, 403);
      }
      const { data: workers, error: workerError } = await db.from("mt5_bridge_workers")
        .select("worker_id,last_seen_at").eq("user_id", memberId).eq("status", "online")
        .order("last_seen_at", { ascending: false }).limit(1);
      if (workerError) throw workerError;
      const worker = workers?.[0];
      if (!worker?.last_seen_at || Date.now() - Date.parse(worker.last_seen_at) > 30000) {
        return json({ error: "mt5_worker_heartbeat_stale" }, 409);
      }
      const utcDate = now.slice(0, 10);
      const { data: daily, error: dailyError } = await db.from("mt5_daily_risk_snapshots")
        .select("starting_equity,latest_equity,cash_flow_adjustment,history_complete,first_observed_at,updated_at")
        .eq("user_id", memberId).eq("utc_date", utcDate).maybeSingle();
      if (dailyError) throw dailyError;
      const midnight = Date.parse(utcDate + "T00:00:00.000Z");
      if (!daily || Number(daily.starting_equity) <= 0 || daily.history_complete !== true ||
          Date.parse(daily.first_observed_at) > midnight + 30 * 1000 ||
          Date.now() - Date.parse(daily.updated_at) > 30000) {
        return json({ error: "daily_risk_baseline_or_deal_history_not_execution_grade" }, 409);
      }
      const dailyLossPct = Math.max(0, -((Number(daily.latest_equity) -
        Number(daily.starting_equity) - Number(daily.cash_flow_adjustment ?? 0)) /
        Number(daily.starting_equity)) * 100);
      if (dailyLossPct >= Number(settings.max_daily_loss_pct)) {
        return json({ error: "daily_loss_limit_reached" }, 409);
      }
      const { data: inserted, error: queueError } = await db.from("mt5_bridge_commands").insert({
        user_id: memberId, idempotency_key: "execute:" + preflightId, command_type: "place_pending_order",
        payload: { ...preflight.payload, authorized_worker_id: worker.worker_id,
          source_preflight_command_id: preflightId, approved_at: approvalTime },
      }).select("id").single();
      if (queueError) {
        if (queueError.code === "23505") return json({ error: "duplicate_execution_request" }, 409);
        throw queueError;
      }
      await db.from("mt5_execution_audit").insert({
        user_id: memberId, worker_id: worker.worker_id, event_type: "pending_order_live_execution_approved",
        idempotency_key: "execute:" + preflightId, details: { commandId: inserted.id, preflightId,
          symbol: preflight.payload?.symbol, orderType: preflight.payload?.order_type },
      });
      return json({ ok: true, commandId: inserted.id, message: "Explicit order approval recorded; worker will repeat all checks before broker submission." });
    }

    if (body.action === "pending_order_execution_status") {
      const memberId = await memberIdFromToken(bearer);
      if (!memberId) return json({ error: "member_unauthorized" }, 401);
      const commandId = String(body.commandId ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(commandId)) return json({ error: "invalid_command_id" }, 400);
      const { data, error } = await db.from("mt5_bridge_commands")
        .select("id,command_type,status,result,error_code,created_at,completed_at")
        .eq("id", commandId).eq("user_id", memberId)
        .eq("command_type", "place_pending_order").maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "execution_request_not_found" }, 404);
      return json({ command: data });
    }

    if (body.action === "list_inventory" || body.action === "adopt_inventory" || body.action === "revoke_inventory_adoption") {
      const memberId = await memberIdFromToken(bearer);
      if (!memberId) return json({ error: "member_unauthorized" }, 401);
      const { data: settings, error: settingsError } = await db.from("mt5_account_settings")
        .select("login,server,adopt_pending_orders,manage_existing_positions")
        .eq("user_id", memberId).maybeSingle();
      if (settingsError || !settings) return json({ error: "mt5_account_not_paired" }, 404);

      if (body.action === "list_inventory") {
        const { data, error } = await db.from("mt5_trade_inventory")
          .select("object_type,ticket,identifier,symbol,side_or_type,volume,price_open,price_current,stop_loss,take_profit,profit,magic_number,broker_comment,ownership_status,last_seen_at")
          .eq("user_id", memberId).eq("account_login", settings.login)
          .eq("account_server", settings.server)
          .order("last_seen_at", { ascending: false }).limit(200);
        if (error) throw error;
        return json({ inventory: data ?? [] });
      }

      const objectType = body.objectType === "pending_order" || body.objectType === "position" ? body.objectType : "";
      const ticket = Number(body.ticket);
      if (!objectType || !Number.isSafeInteger(ticket) || ticket <= 0) {
        return json({ error: "valid_object_type_and_ticket_required" }, 400);
      }
      const adopting = body.action === "adopt_inventory";
      const { data: nextStatus, error: adoptionError } = await db.rpc("set_mt5_trade_adoption", {
        p_user_id: memberId,
        p_object_type: objectType,
        p_ticket: ticket,
        p_adopt: adopting,
      });
      if (adoptionError) {
        const message = adoptionError.message ?? "";
        if (message.includes("adoption_permission_not_enabled")) return json({ error: "adoption_permission_not_enabled" }, 403);
        if (message.includes("inventory_item_not_found")) return json({ error: "inventory_item_not_found" }, 404);
        if (message.includes("inventory_ownership_state_conflict")) return json({ error: "inventory_ownership_state_conflict" }, 409);
        throw adoptionError;
      }
      return json({ ok: true, ticket, objectType, ownershipStatus: nextStatus,
        message: adopting ? "This specific item is marked as adopted. No broker order was changed." : "Adoption was revoked. No broker order was changed." });
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
    if (body.action === "confirm_pending_order_send") {
      const commandId = String(body.commandId ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(commandId)) return json({ error: "invalid_command_id" }, 400);
      const { data: command, error: commandError } = await db.from("mt5_bridge_commands")
        .select("id,payload,status,claimed_by,command_type")
        .eq("id", commandId).eq("user_id", worker.user_id)
        .eq("claimed_by", workerId).eq("status", "claimed")
        .eq("command_type", "place_pending_order").maybeSingle();
      if (commandError) throw commandError;
      if (!command || command.payload?.authorized_worker_id !== workerId) {
        return json({ error: "execution_command_not_authorized_for_worker" }, 403);
      }
      const { data: settings, error: settingsError } = await db.from("mt5_account_settings")
        .select("login,server,bridge_status,place_new_orders,risk_controls_enabled,live_execution_enabled,emergency_stop,max_daily_loss_pct")
        .eq("user_id", worker.user_id).maybeSingle();
      if (settingsError || !settings) return json({ error: "mt5_account_not_paired" }, 404);
      if (settings.bridge_status !== "connected" || settings.place_new_orders !== true ||
          settings.risk_controls_enabled !== true || settings.live_execution_enabled !== true ||
          settings.emergency_stop !== false) {
        return json({ error: "live_execution_revoked_or_emergency_stop_active" }, 403);
      }
      const { data: workerState, error: workerStateError } = await db.from("mt5_bridge_workers")
        .select("status,last_seen_at").eq("worker_id", workerId).eq("user_id", worker.user_id).single();
      if (workerStateError) throw workerStateError;
      if (workerState.status !== "online" || !workerState.last_seen_at ||
          Date.now() - Date.parse(workerState.last_seen_at) > 30000) {
        return json({ error: "worker_heartbeat_stale" }, 409);
      }
      const utcDate = now.slice(0, 10);
      const { data: daily, error: dailyError } = await db.from("mt5_daily_risk_snapshots")
        .select("starting_equity,latest_equity,cash_flow_adjustment,history_complete,first_observed_at,updated_at")
        .eq("user_id", worker.user_id).eq("utc_date", utcDate).maybeSingle();
      if (dailyError) throw dailyError;
      const midnight = Date.parse(utcDate + "T00:00:00.000Z");
      if (!daily || Number(daily.starting_equity) <= 0 || daily.history_complete !== true ||
          Date.parse(daily.first_observed_at) > midnight + 30 * 1000 ||
          Date.now() - Date.parse(daily.updated_at) > 30000) {
        return json({ error: "daily_risk_baseline_or_deal_history_not_execution_grade" }, 409);
      }
      const lossPct = Math.max(0, -((Number(daily.latest_equity) -
        Number(daily.starting_equity) - Number(daily.cash_flow_adjustment ?? 0)) /
        Number(daily.starting_equity)) * 100);
      if (lossPct >= Number(settings.max_daily_loss_pct)) return json({ error: "daily_loss_limit_reached" }, 409);
      const { data: attempt, error: attemptError } = await db.from("mt5_execution_attempts")
        .select("state,worker_id,account_login,account_server")
        .eq("command_id", commandId).eq("user_id", worker.user_id).maybeSingle();
      if (attemptError) throw attemptError;
      if (!attempt || attempt.state !== "dispatching" || attempt.worker_id !== workerId ||
          attempt.account_login !== settings.login || attempt.account_server !== settings.server) {
        return json({ error: "execution_attempt_not_authorized" }, 409);
      }
      return json({ ok: true, final_authorization: true });
    }

    if (body.action === "authorize_pending_order_execution") {
      const commandId = String(body.commandId ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(commandId)) return json({ error: "invalid_command_id" }, 400);
      const { data: command, error: commandError } = await db.from("mt5_bridge_commands")
        .select("id,payload,status,claimed_by,command_type")
        .eq("id", commandId).eq("user_id", worker.user_id)
        .eq("claimed_by", workerId).eq("status", "claimed")
        .eq("command_type", "place_pending_order").maybeSingle();
      if (commandError) throw commandError;
      if (!command || command.payload?.authorized_worker_id !== workerId) {
        return json({ error: "execution_command_not_authorized_for_worker" }, 403);
      }
      const { data: settings, error: settingsError } = await db.from("mt5_account_settings")
        .select("login,server,bridge_status,place_new_orders,risk_controls_enabled,live_execution_enabled,emergency_stop,max_risk_per_trade_pct,max_daily_loss_pct,max_open_positions,max_spread_points,max_slippage_points")
        .eq("user_id", worker.user_id).maybeSingle();
      if (settingsError || !settings) return json({ error: "mt5_account_not_paired" }, 404);
      if (settings.bridge_status !== "connected" || settings.place_new_orders !== true ||
          settings.risk_controls_enabled !== true || settings.live_execution_enabled !== true ||
          settings.emergency_stop !== false) {
        return json({ error: "live_execution_not_authorized_or_emergency_stop_active" }, 403);
      }
      const { data: workerState, error: workerStateError } = await db.from("mt5_bridge_workers")
        .select("status,last_seen_at").eq("worker_id", workerId).eq("user_id", worker.user_id).single();
      if (workerStateError) throw workerStateError;
      if (workerState.status !== "online" || !workerState.last_seen_at ||
          Date.now() - Date.parse(workerState.last_seen_at) > 30000) {
        return json({ error: "worker_heartbeat_stale" }, 409);
      }
      const utcDate = now.slice(0, 10);
      const { data: daily, error: dailyError } = await db.from("mt5_daily_risk_snapshots")
        .select("starting_equity,latest_equity,cash_flow_adjustment,history_complete,first_observed_at,updated_at")
        .eq("user_id", worker.user_id).eq("utc_date", utcDate).maybeSingle();
      if (dailyError) throw dailyError;
      const midnight = Date.parse(utcDate + "T00:00:00.000Z");
      if (!daily || Number(daily.starting_equity) <= 0 || daily.history_complete !== true ||
          Date.parse(daily.first_observed_at) > midnight + 30 * 1000 ||
          Date.now() - Date.parse(daily.updated_at) > 30000) {
        return json({ error: "daily_risk_baseline_or_deal_history_not_execution_grade" }, 409);
      }
      const dailyLossPct = Math.max(0, -((Number(daily.latest_equity) -
        Number(daily.starting_equity) - Number(daily.cash_flow_adjustment ?? 0)) /
        Number(daily.starting_equity)) * 100);
      if (dailyLossPct >= Number(settings.max_daily_loss_pct)) return json({ error: "daily_loss_limit_reached" }, 409);
      const payload = command.payload ?? {};
      if (String(payload.login) !== settings.login || String(payload.server) !== settings.server) {
        return json({ error: "execution_account_identity_mismatch" }, 409);
      }
      const brokerComment = "STAI:" + command.id.replace(/-/g, "").slice(0, 26);
      const { data: attempt, error: attemptError } = await db.from("mt5_execution_attempts").insert({
        command_id: command.id, user_id: worker.user_id, worker_id: workerId,
        state: "dispatching", account_login: settings.login, account_server: settings.server,
        broker_comment: brokerComment,
      }).select("command_id,state,broker_ticket,broker_deal,broker_retcode,broker_message").single();
      if (attemptError && attemptError.code !== "23505") throw attemptError;
      if (attemptError?.code === "23505") {
        const { data: existing, error: existingError } = await db.from("mt5_execution_attempts")
          .select("command_id,state,broker_ticket,broker_deal,broker_retcode,broker_message,broker_comment")
          .eq("command_id", command.id).eq("user_id", worker.user_id).maybeSingle();
        if (existingError) throw existingError;
        if (!existing) return json({ error: "execution_idempotency_conflict" }, 409);
        return json({ ok: true, new_attempt: false, attempt: existing });
      }
      return json({ ok: true, new_attempt: true, broker_comment: brokerComment,
        settings: { place_new_orders: settings.place_new_orders, risk_controls_enabled: settings.risk_controls_enabled,
          max_risk_per_trade_pct: settings.max_risk_per_trade_pct, max_daily_loss_pct: settings.max_daily_loss_pct,
          max_open_positions: settings.max_open_positions, max_spread_points: settings.max_spread_points,
          max_slippage_points: settings.max_slippage_points }, daily_loss_pct: dailyLossPct });
    }
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
      const { data: command, error: commandReadError } = await db.from("mt5_bridge_commands")
        .select("id,command_type,idempotency_key")
        .eq("id", commandId).eq("user_id", worker.user_id)
        .eq("claimed_by", workerId).eq("status", "claimed").maybeSingle();
      if (commandReadError) throw commandReadError;
      if (!command) return json({ error: "command_not_owned_or_expired" }, 409);
      // Inventory synchronization is observational only. All discovered broker
      // objects remain unowned unless a future explicit adoption workflow grants scope.
      if (succeeded && (command.command_type === "list_pending_orders" || command.command_type === "list_positions")) {
        const isPosition = command.command_type === "list_positions";
        const rows = isPosition ? result.positions : result.pending_orders;
        if (!Array.isArray(rows) || rows.length > 10000) {
          return json({ error: "invalid_inventory_snapshot" }, 400);
        }
        const { data: accountSettings, error: accountError } = await db.from("mt5_account_settings")
          .select("login,server").eq("user_id", worker.user_id).maybeSingle();
        if (accountError || !accountSettings) throw accountError ?? new Error("account_settings_missing");
        const inventoryRows = rows.map((item: Record<string, unknown>) => {
          const ticket = Number(item.ticket);
          const symbol = String(item.symbol ?? "").slice(0, 40);
          const magic = Number(item.magic ?? 0);
          const comment = String(item.comment ?? "").slice(0, 80);
          const numeric = (value: unknown, fallback = 0) => {
            const n = Number(value ?? fallback);
            if (!Number.isFinite(n)) throw new Error("invalid_inventory_numeric_field");
            return n;
          };
          if (!Number.isSafeInteger(ticket) || ticket <= 0 || !symbol ||
              !Number.isSafeInteger(magic) || magic < 0) {
            throw new Error("invalid_inventory_identity");
          }
          return {
            user_id: worker.user_id,
            account_login: accountSettings.login,
            account_server: accountSettings.server,
            object_type: isPosition ? "position" : "pending_order",
            ticket,
            identifier: item.identifier == null ? null : numeric(item.identifier),
            symbol,
            side_or_type: numeric(item.type),
            volume: numeric(isPosition ? item.volume : item.volume_current),
            price_open: numeric(item.price_open),
            price_current: isPosition ? numeric(item.price_current) : null,
            stop_loss: numeric(item.sl),
            take_profit: numeric(item.tp),
            profit: isPosition ? numeric(item.profit) : null,
            magic_number: magic,
            broker_reason: item.reason == null ? null : numeric(item.reason),
            broker_comment: comment,
            last_seen_at: now,
            last_sync_id: command.idempotency_key.split(":")[0].slice(0, 80),
          };
        });
        if (inventoryRows.length) {
          const { error: inventoryError } = await db.from("mt5_trade_inventory").upsert(inventoryRows, {
            onConflict: "user_id,account_login,account_server,object_type,ticket",
          });
          if (inventoryError) throw inventoryError;
          const tagged = inventoryRows.filter((item) => item.magic_number === 601025 &&
            item.broker_comment.startsWith("STAI:"));
          for (const item of tagged) {
            await db.from("mt5_trade_inventory").update({
              ownership_status: "strategy_tagged_unverified",
            }).eq("user_id", worker.user_id)
              .eq("account_login", accountSettings.login)
              .eq("account_server", accountSettings.server)
              .eq("object_type", item.object_type)
              .eq("ticket", item.ticket)
              .eq("ownership_status", "discovered_unowned");
          }
        }
      }

      if (command.command_type === "place_pending_order") {
        const executionState = ["accepted", "rejected", "uncertain"].includes(String(result.execution_state))
          ? String(result.execution_state) : (succeeded ? "uncertain" : "rejected");
        const { error: attemptUpdateError } = await db.from("mt5_execution_attempts").update({
          state: executionState,
          broker_ticket: Number.isSafeInteger(Number(result.broker_ticket)) && Number(result.broker_ticket) > 0 ? Number(result.broker_ticket) : null,
          broker_deal: Number.isSafeInteger(Number(result.broker_deal)) && Number(result.broker_deal) > 0 ? Number(result.broker_deal) : null,
          broker_retcode: Number.isInteger(Number(result.broker_retcode)) ? Number(result.broker_retcode) : null,
          broker_message: String(result.broker_message ?? "").slice(0, 120),
          updated_at: now,
        }).eq("command_id", commandId).eq("user_id", worker.user_id);
        if (attemptUpdateError) throw attemptUpdateError;
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
