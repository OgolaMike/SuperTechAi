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
      const allowed = objectType === "pending_order"
        ? settings.adopt_pending_orders === true
        : settings.manage_existing_positions === true;
      if (!allowed) return json({ error: "adoption_permission_not_enabled" }, 403);

      const { data: item, error: itemError } = await db.from("mt5_trade_inventory")
        .select("ownership_status").eq("user_id", memberId)
        .eq("account_login", settings.login).eq("account_server", settings.server)
        .eq("object_type", objectType).eq("ticket", ticket).maybeSingle();
      if (itemError || !item) return json({ error: "inventory_item_not_found" }, 404);

      const adopting = body.action === "adopt_inventory";
      const allowedSourceStatuses = adopting
        ? ["discovered_unowned", "strategy_tagged_unverified"]
        : ["explicitly_adopted"];
      if (!allowedSourceStatuses.includes(item.ownership_status)) {
        return json({ error: "inventory_ownership_state_conflict", currentStatus: item.ownership_status }, 409);
      }
      const nextStatus = adopting ? "explicitly_adopted" : "discovered_unowned";
      const { data: changed, error: updateError } = await db.from("mt5_trade_inventory")
        .update({ ownership_status: nextStatus })
        .eq("user_id", memberId).eq("account_login", settings.login)
        .eq("account_server", settings.server).eq("object_type", objectType)
        .eq("ticket", ticket).eq("ownership_status", item.ownership_status)
        .select("ticket").maybeSingle();
      if (updateError) throw updateError;
      if (!changed) return json({ error: "inventory_ownership_state_conflict" }, 409);

      const { error: auditError } = await db.from("mt5_trade_adoption_audit").insert({
        user_id: memberId, account_login: settings.login, account_server: settings.server,
        object_type: objectType, ticket, action: adopting ? "adopt" : "revoke",
        previous_status: item.ownership_status, new_status: nextStatus,
      });
      if (auditError) throw auditError;
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
