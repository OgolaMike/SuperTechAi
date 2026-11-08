import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MAX_ENDPOINT_LENGTH = 2048;

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isValidEndpoint(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("https://") && value.length <= MAX_ENDPOINT_LENGTH;
}

function parseSymbols(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .filter((item): item is string => typeof item === "string" && item.length > 0 && item.length <= 64)
    .slice(0, 50);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  try {
    if (req.method === "GET") {
      const { data, error } = await db.from("push_config").select("public_key").eq("id", "vapid").maybeSingle();
      if (error) throw error;
      if (!data) return jsonResponse({ error: "Push notifications are still being set up. Try again shortly." }, 503);
      return jsonResponse({ publicKey: data.public_key });
    }

    if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

    const body = await req.json();
    if (body?.action === "subscribe") {
      const sub = body.subscription;
      const prefs = body.prefs ?? {};
      if (!isValidEndpoint(sub?.endpoint) || typeof sub?.keys?.p256dh !== "string" || typeof sub?.keys?.auth !== "string") {
        return jsonResponse({ error: "Invalid subscription" }, 400);
      }
      const { error } = await db.from("push_subscriptions").upsert(
        {
          endpoint: sub.endpoint,
          p256dh: sub.keys.p256dh,
          auth: sub.keys.auth,
          notify_signals: prefs.signals !== false,
          notify_targets: prefs.targets !== false,
          notify_stops: prefs.stops !== false,
          notify_limit_orders: prefs.limitOrders !== false,
          notify_pending_orders: prefs.pendingOrders !== false,
          notify_super_signals: prefs.superSignals !== false,
          notify_income: prefs.income !== false,
          notify_business: prefs.business !== false,
          symbols: parseSymbols(prefs.symbols),
          user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
          failure_count: 0,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "endpoint" },
      );
      if (error) throw error;
      return jsonResponse({ ok: true });
    }

    if (body?.action === "unsubscribe") {
      if (!isValidEndpoint(body.endpoint)) return jsonResponse({ error: "Invalid subscription" }, 400);
      const { error } = await db.from("push_subscriptions").delete().eq("endpoint", body.endpoint);
      if (error) throw error;
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch {
    return jsonResponse({ error: "Request failed" }, 500);
  }
});
