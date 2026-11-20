import { createClient } from "npm:@supabase/supabase-js@2";
import { validateSignalIngestion } from "../_shared/signal-ingestion.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://deriv-sma-signal-das-04us.bolt.host",
  "Access-Control-Allow-Headers": "content-type, x-signal-ingest-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "content-type": "application/json" },
});

function equalSecret(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const expectedSecret = Deno.env.get("SIGNAL_INGEST_SECRET") ?? "";
  const suppliedSecret = req.headers.get("x-signal-ingest-secret") ?? "";
  if (expectedSecret.length < 32 || !equalSecret(suppliedSecret, expectedSecret)) {
    return json({ error: "unauthorized" }, 401);
  }

  const declaredLength = Number(req.headers.get("content-length") ?? 0);
  if (declaredLength > 16_384) return json({ error: "request_too_large" }, 413);

  try {
    const raw = await req.text();
    if (raw.length > 16_384) return json({ error: "request_too_large" }, 413);
    let input: unknown;
    try { input = JSON.parse(raw); } catch { return json({ error: "invalid_json" }, 400); }
    const validated = validateSignalIngestion(input);
    if (!validated.ok) return json({ error: validated.error }, 400);

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return json({ error: "server_configuration_missing" }, 500);
    const db = createClient(url, serviceKey, { auth: { persistSession: false } });
    const p = validated.payload;
    const row = {
      signal_key: p.signal_key,
      symbol: p.symbol,
      direction: p.direction,
      strategy_version: p.strategy_version,
      primary_timeframe: "H4",
      confirmation_timeframe: "M15",
      signal_epoch: p.signal_epoch,
      entry_price: p.entry_price,
      stop_loss: p.stop_loss,
      take_profit: p.take_profit,
      evidence: {
        ...(p.evidence ?? {}),
        h4_candle_closed: p.h4_candle_closed,
        m15_confirmation_closed: p.m15_confirmation_closed,
        m15_confirmed: p.m15_confirmed,
      },
      explanation: p.explanation ?? null,
      status: validated.status,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await db.from("trader_signal_intents")
      .insert(row).select("id,signal_key,status,created_at").single();

    if (error?.code === "23505") {
      const { data: existing, error: readError } = await db.from("trader_signal_intents")
        .select("id,signal_key,status,created_at")
        .eq("signal_key", p.signal_key).maybeSingle();
      if (readError) throw readError;
      return json({ ok: true, duplicate: true, signal: existing }, 200);
    }
    if (error) throw error;
    return json({ ok: true, duplicate: false, signal: data }, 201);
  } catch (error) {
    console.error("Signal ingestion failed:", error instanceof Error ? error.message : "unknown");
    return json({ error: "signal_ingestion_failed" }, 500);
  }
});
