import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type VapidConfig = { publicKey: string; jwk: JsonWebKey };

export type PushSubscriptionRow = {
  endpoint: string;
  user_id: string | null;
  p256dh: string;
  auth: string;
  notify_signals: boolean;
  notify_targets: boolean;
  notify_stops: boolean;
  notify_limit_orders: boolean;
  notify_pending_orders: boolean;
  notify_super_signals: boolean;
  notify_income: boolean;
  notify_business: boolean;
  symbols: string[] | null;
  failure_count: number;
};

export type PushEventRow = {
  event_key: string;
  signal_key: string;
  kind: "signal" | "target" | "stop" | "limit_order" | "pending_order" | "super_signal" | "income" | "business" | "high_roc_stop";
  payload: EventPayload;
  recipient_user_id?: string | null;
};

export type EventPayload = {
  label: string;
  symbol: string;
  assetName: string;
  timeframe: string;
  direction: "BUY" | "SELL";
  digits: number;
  signalEpoch: number;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  price: number;
  eventEpoch: number;
  strengthScore?: number;
  momentumScore?: number;
  timeframeAgreement?: number;
  title?: string;
  message?: string;
  eventType?: string;
  orderType?: "BUY_STOP" | "SELL_STOP";
  roc3?: number;
  roc6?: number;
  roc12?: number;
  strength?: string;
  expiryEpoch?: number;
};

const encoder = new TextEncoder();
function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
const MAX_FAILURES = 5;
const VAPID_TOKEN_SECONDS = 12 * 3600;

function vapidSubject(): string {
  return `https://${new URL(Deno.env.get("SUPABASE_URL")!).host}`;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", asArrayBuffer(ikm), "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: asArrayBuffer(salt), info: asArrayBuffer(info) }, key, length * 8);
  return new Uint8Array(bits);
}

// RFC 8291 (aes128gcm) payload encryption for Web Push.
async function encryptPayload(plaintext: string, p256dh: string, authSecret: string): Promise<Uint8Array> {
  const userPublic = fromBase64Url(p256dh);
  const userAuth = fromBase64Url(authSecret);
  const ephemeral = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const ephemeralPublic = new Uint8Array(await crypto.subtle.exportKey("raw", ephemeral.publicKey));
  const userKey = await crypto.subtle.importKey("raw", asArrayBuffer(userPublic), { name: "ECDH", namedCurve: "P-256" }, false, []);
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: userKey }, ephemeral.privateKey, 256),
  );
  const ikm = await hkdf(
    userAuth,
    sharedSecret,
    concatBytes(encoder.encode("WebPush: info\0"), userPublic, ephemeralPublic),
    32,
  );
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const contentKey = await hkdf(salt, ikm, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode("Content-Encoding: nonce\0"), 12);
  const aesKey = await crypto.subtle.importKey("raw", asArrayBuffer(contentKey), "AES-GCM", false, ["encrypt"]);
  const padded = concatBytes(encoder.encode(plaintext), new Uint8Array([2]));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: asArrayBuffer(nonce) }, aesKey, asArrayBuffer(padded)));
  const recordSize = new Uint8Array([0, 0, 16, 0]);
  return concatBytes(salt, recordSize, new Uint8Array([ephemeralPublic.length]), ephemeralPublic, cipher);
}

async function vapidAuthorization(endpoint: string, config: VapidConfig): Promise<string> {
  const header = toBase64Url(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = toBase64Url(
    encoder.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + VAPID_TOKEN_SECONDS,
        sub: vapidSubject(),
      }),
    ),
  );
  const unsigned = `${header}.${claims}`;
  const key = await crypto.subtle.importKey("jwk", config.jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, asArrayBuffer(encoder.encode(unsigned))),
  );
  return `vapid t=${unsigned}.${toBase64Url(signature)}, k=${config.publicKey}`;
}

export async function loadVapid(db: SupabaseClient): Promise<VapidConfig> {
  const { data, error } = await db
    .from("push_config")
    .select("public_key, private_jwk")
    .eq("id", "vapid")
    .maybeSingle();
  if (error) throw new Error(`Could not read push keys: ${error.message}`);
  if (data) return { publicKey: data.public_key, jwk: data.private_jwk as JsonWebKey };

  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const publicKey = toBase64Url(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)));
  const { error: insertError } = await db
    .from("push_config")
    .upsert({ id: "vapid", public_key: publicKey, private_jwk: jwk }, { onConflict: "id", ignoreDuplicates: true });
  if (insertError) throw new Error(`Could not store push keys: ${insertError.message}`);
  return loadVapid(db);
}

function wantsEvent(sub: PushSubscriptionRow, event: PushEventRow): boolean {
  if (event.recipient_user_id && event.recipient_user_id !== sub.user_id) return false;
  if (event.kind === 'income') return sub.notify_income;
  if (event.kind === 'business') return sub.notify_business;
  if (sub.symbols && !sub.symbols.includes(event.payload.symbol)) return false;
  if (event.kind === "super_signal") return sub.notify_super_signals;
  if (event.kind === "high_roc_stop") return sub.notify_pending_orders;
  if (event.kind === "signal") return sub.notify_signals;
  if (event.kind === "target") return sub.notify_targets;
  if (event.kind === "stop") return sub.notify_stops;
  if (event.kind === "limit_order") return sub.notify_limit_orders;
  return sub.notify_pending_orders;
}

function formatTime(epoch: number): string {
  return `${new Date(epoch * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function buildMessage(event: PushEventRow): string {
  const p = event.payload;
  const price = (value: number) => value.toFixed(p.digits);
  let title: string;
  let body: string;
  if (event.kind === "income" || event.kind === "business") {
    title = p.title ?? (event.kind === "income" ? "Income update · SuperTech AI" : "Business update · SuperTech AI");
    body = p.message ?? (event.kind === "income" ? "A new earning has been credited to your account." : "There is new activity in your referral business.");
  } else if (event.kind === "super_signal") {
    title = `SUPER SIGNAL ${p.direction} · ${p.assetName}`;
    body = `All eight timeframes agree · Entry ${price(p.entry)} · SL ${price(p.stopLoss)} · TP1 ${price(p.tp1)} · TP2 ${price(p.tp2)} · TP3 ${price(p.tp3)} · ${formatTime(p.signalEpoch)}`;
  } else if (event.kind === "signal") {
    title = `${p.direction} ${p.assetName} · ${p.timeframe}`;
    body = `Entry ${price(p.entry)} · SL ${price(p.stopLoss)} · TP1 ${price(p.tp1)} · TP2 ${price(p.tp2)} · TP3 ${price(p.tp3)}\nSignal ${formatTime(p.signalEpoch)}`;
  } else if (event.kind === "target") {
    title = `${p.assetName} ${p.timeframe}: ${p.label} reached`;
    body = `Price ${price(p.price)} · Entry ${price(p.entry)} · Confirmed ${formatTime(p.eventEpoch)}`;
  } else if (event.kind === "stop") {
    title = `${p.assetName} ${p.timeframe}: Stop-loss hit`;
    body = `Price ${price(p.price)} · Entry ${price(p.entry)} · Confirmed ${formatTime(p.eventEpoch)}`;
  } else if (event.kind === "high_roc_stop") {
    title = `HIGH ROC ${p.orderType ?? p.label} · ${p.assetName}`;
    body = `Momentum ${p.strength ?? "HIGH"} · ROC 3/6/12: ${(p.roc3 ?? 0).toFixed(2)}% / ${(p.roc6 ?? 0).toFixed(2)}% / ${(p.roc12 ?? 0).toFixed(2)}% · Stop entry ${price(p.entry)} · SL ${price(p.stopLoss)} · TP ${price(p.tp1)} · Expires ${formatTime(p.expiryEpoch ?? p.signalEpoch + 3600)}`;
  } else if (event.kind === "pending_order") {
    title = `PENDING ${p.direction} ORDER · ${p.assetName}`;
    body = `Confirmed M15 BB(60, 2.5) reversal · Entry ${price(p.entry)} · SL ${price(p.stopLoss)} · Target ${price(p.tp1)} · ${formatTime(p.eventEpoch)}`;
  } else {
    title = `${p.direction} LIMIT SIGNAL · ${p.assetName}`;
    body = `Entry ${price(p.entry)} · SL ${price(p.stopLoss)} · TP ${price(p.tp3)} · Strength ${p.strengthScore ?? p.momentumScore ?? 0}/100 · ${p.timeframeAgreement ?? 8}/8 timeframes · ${formatTime(p.eventEpoch)}`;
  }
  return JSON.stringify({
    title,
    body,
    url: `/?signal=${encodeURIComponent(event.signal_key)}`,
    tag: event.event_key,
  });
}

async function sendPush(sub: PushSubscriptionRow, message: string, config: VapidConfig) {
  try {
    const body = await encryptPayload(message, sub.p256dh, sub.auth);
    const response = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: await vapidAuthorization(sub.endpoint, config),
        TTL: "3600",
        Urgency: "high",
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
      },
      body: asArrayBuffer(body),
    });
    return { ok: response.status === 201, gone: response.status === 404 || response.status === 410, status: response.status };
  } catch (error) {
    return { ok: false, gone: false, status: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

// Sends each undispatched event to every subscription whose preferences allow it.
export async function dispatchPending(
  db: SupabaseClient,
  config: VapidConfig,
): Promise<{ sent: number; failed: number; removed: number }> {
  const { data: events, error } = await db
    .from("push_events")
    .select("event_key, signal_key, kind, payload, recipient_user_id")
    .is("dispatched_at", null)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(`Could not read pending events: ${error.message}`);
  const totals = { sent: 0, failed: 0, removed: 0 };
  if (!events?.length) return totals;

  const { data: subs, error: subsError } = await db
    .from("push_subscriptions")
    .select("endpoint, user_id, p256dh, auth, notify_signals, notify_targets, notify_stops, notify_limit_orders, notify_pending_orders, notify_super_signals, notify_income, notify_business, symbols, failure_count");
  if (subsError) throw new Error(`Could not read subscriptions: ${subsError.message}`);
  const subscriptions = (subs ?? []) as PushSubscriptionRow[];

  for (const event of events as PushEventRow[]) {
    // Never deliver a delayed High ROC stop alert after its signal has expired.
    if (event.kind === "high_roc_stop" && Number(event.payload.expiryEpoch ?? 0) <= Math.floor(Date.now() / 1000)) {
      const { error: expiredError } = await db.from("push_events")
        .update({ dispatched_at: new Date().toISOString() }).eq("event_key", event.event_key);
      if (expiredError) throw new Error("Could not retire expired High ROC event: " + expiredError.message);
      continue;
    }
    const message = buildMessage(event);
    for (const sub of subscriptions.filter((item) => wantsEvent(item, event))) {
      const result = await sendPush(sub, message, config);
      if (result.ok) {
        totals.sent += 1;
        await db
          .from("push_subscriptions")
          .update({ failure_count: 0, last_error: null, last_success_at: new Date().toISOString() })
          .eq("endpoint", sub.endpoint);
        continue;
      }
      const failures = sub.failure_count + 1;
      const reason = "error" in result && result.error ? result.error : `Push service responded ${result.status}`;
      if (result.gone || failures >= MAX_FAILURES) {
        totals.removed += 1;
        await db.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      } else {
        totals.failed += 1;
        await db
          .from("push_subscriptions")
          .update({ failure_count: failures, last_error: reason })
          .eq("endpoint", sub.endpoint);
      }
    }
    const { error: markError } = await db
      .from("push_events")
      .update({ dispatched_at: new Date().toISOString() })
      .eq("event_key", event.event_key);
    if (markError) throw new Error(`Could not mark event dispatched: ${markError.message}`);
  }
  return totals;
}
