import { createClient } from "npm:@supabase/supabase-js@2";
import {
  accountSuffix,
  classifyConnectionHealth,
  isRecentHeartbeat,
} from "../_shared/automation-status.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "no-store",
  "Vary": "Authorization",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);

  const authorization = req.headers.get("Authorization") ?? "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return json({ error: "authentication_required" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ error: "status_service_not_configured" }, 503);
  }

  try {
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "invalid_session" }, 401);

    const userId = authData.user.id;
    const db = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Every lookup is restricted to the authenticated member. The worker table
    // is accessed only here, and only non-secret health fields are selected.
    const [spot, futures, okx, ctrader, mt5, workers] = await Promise.all([
      db.from("binance_spot_settings")
        .select("connection_status,last_checked_at,account_label")
        .eq("user_id", userId)
        .maybeSingle(),
      db.from("binance_futures_settings")
        .select("connection_status,last_checked_at,account_label")
        .eq("user_id", userId)
        .maybeSingle(),
      db.from("okx_futures_settings")
        .select("connection_status,account_label,account_mode,demo_trading,last_checked_at")
        .eq("user_id", userId)
        .maybeSingle(),
      db.from("ctrader_connections")
        .select("connection_status,environment,account_label,broker_name,token_expires_at")
        .eq("user_id", userId),
      db.from("mt5_account_settings")
        .select("bridge_status,last_seen_at,login,server")
        .eq("user_id", userId)
        .maybeSingle(),
      db.from("mt5_bridge_workers")
        .select("status,last_seen_at")
        .eq("user_id", userId),
    ]);

    if ([spot.error, futures.error, okx.error, ctrader.error, mt5.error, workers.error].some(Boolean)) {
      console.error("automation-status: one or more member-scoped status queries failed");
      return json({ error: "automation_status_unavailable" }, 503);
    }

    const ctraderRows = ctrader.data ?? [];
    const now = Date.now();
    const ctraderStates = ctraderRows.map((row) => {
      const tokenExpiry = row.token_expires_at ? Date.parse(row.token_expires_at) : Number.NaN;
      const expired = Number.isFinite(tokenExpiry) && tokenExpiry <= now;
      return expired && row.connection_status === "connected"
        ? "reauthorization_required"
        : row.connection_status;
    });

    const workerRows = workers.data ?? [];
    const onlineWorkers = workerRows.filter((worker) =>
      worker.status === "online" && isRecentHeartbeat(worker.last_seen_at, now)
    ).length;
    const mt5HeartbeatExpected = mt5.data?.bridge_status === "connected";
    const mt5Status = mt5.data?.bridge_status === "error" ||
        (mt5HeartbeatExpected && onlineWorkers === 0)
      ? "attention"
      : mt5HeartbeatExpected && onlineWorkers > 0
      ? "connected"
      : mt5.data?.bridge_status === "connecting"
      ? "connecting"
      : "not_connected";

    return json({
      providers: {
        binance: {
          status: classifyConnectionHealth([
            spot.data?.connection_status,
            futures.data?.connection_status,
          ]),
          spotStatus: spot.data?.connection_status ?? "not_connected",
          futuresStatus: futures.data?.connection_status ?? "not_connected",
          spotCheckedAt: spot.data?.last_checked_at ?? null,
          futuresCheckedAt: futures.data?.last_checked_at ?? null,
          accountLabel: futures.data?.account_label ?? spot.data?.account_label ?? null,
        },
        okx: {
          status: classifyConnectionHealth([okx.data?.connection_status]),
          accountLabel: okx.data?.account_label ?? null,
          accountMode: okx.data?.account_mode ?? null,
          demoTrading: okx.data?.demo_trading ?? null,
          lastCheckedAt: okx.data?.last_checked_at ?? null,
        },
        ctrader: {
          status: ctraderRows.length === 0
            ? "not_connected"
            : classifyConnectionHealth(ctraderStates),
          connectedAccounts: ctraderStates.filter((state) => state === "connected").length,
          totalAccounts: ctraderRows.length,
        },
        mt5: {
          status: mt5Status,
          onlineWorkers,
          loginSuffix: accountSuffix(mt5.data?.login),
          server: mt5.data?.server ?? null,
          lastSeenAt: mt5.data?.last_seen_at ?? null,
        },
        deriv: { status: "not_available" },
      },
    });
  } catch {
    console.error("automation-status: unexpected status lookup failure");
    return json({ error: "automation_status_unavailable" }, 503);
  }
});
