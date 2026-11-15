import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const randomHex = (length = 32) => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
};
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
function displayName(user: { user_metadata?: Record<string, unknown>; email?: string }) {
  const meta = user.user_metadata ?? {};
  const candidate = [meta.full_name, meta.name, meta.display_name].find((v) => typeof v === "string" && v.trim());
  return typeof candidate === "string" ? candidate.trim().slice(0, 80) : (user.email?.split("@")[0] || "SuperTechAi Member").slice(0, 80);
}
async function requireUser(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw Object.assign(new Error("Sign in required"), { status: 401 });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw Object.assign(new Error("Your session has expired. Please sign in again."), { status: 401 });
  return data.user;
}
async function isAdmin(userId: string) {
  const { data, error } = await db.from("admin_users").select("user_id").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
async function hasMembership(userId: string) {
  const [{ data: member, error: memberError }, { data: admin, error: adminError }] = await Promise.all([
    db.from("member_access").select("user_id").eq("user_id", userId).maybeSingle(),
    db.from("admin_users").select("user_id").eq("user_id", userId).maybeSingle(),
  ]);
  if (memberError) throw memberError;
  if (adminError) throw adminError;
  return Boolean(member || admin);
}
async function getReferralCode(userId: string) {
  const { data, error } = await db.from("finance_member_profiles").select("referral_code").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data?.referral_code ?? null;
}
async function issueCard(userId: string, issuedBy: string, name: string, replace: boolean) {
  const allowed = await hasMembership(userId);
  if (!allowed) throw Object.assign(new Error("This account does not currently have active SuperTechAi membership."), { status: 403 });
  const { data: existing, error: existingError } = await db.from("nfc_member_cards")
    .select("id,card_code,display_name,status,created_at,last_tapped_at")
    .eq("owner_user_id", userId).in("status", ["active", "suspended", "revoked"])
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (existingError) throw existingError;
  if (existing?.status === "active" && !replace) return { card: existing, token: null, alreadyIssued: true };
  if (existing && existing.status !== "active" && !replace) {
    throw Object.assign(new Error("A previous card is suspended or revoked. Please contact a SuperTechAi administrator for a replacement."), { status: 403 });
  }
  if (existing && replace) {
    const { error } = await db.from("nfc_member_cards").update({ status: "replaced", updated_at: new Date().toISOString() })
      .eq("owner_user_id", userId).in("status", ["active", "suspended"]);
    if (error) throw error;
  }
  const token = randomHex(32);
  const cardCode = "ST-" + randomHex(4).toUpperCase();
  const { data: card, error } = await db.from("nfc_member_cards").insert({
    owner_user_id: userId, token_hash: await sha256(token), card_code: cardCode,
    display_name: name, card_type: "standard", status: "active", issued_by: issuedBy,
  }).select("id,card_code,display_name,status,created_at,last_tapped_at").single();
  if (error) throw error;
  return { card, token, alreadyIssued: false };
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const action = typeof body?.action === "string" ? body.action : "";
    if (action === "resolve") {
      const token = typeof body?.token === "string" ? body.token.trim() : "";
      if (!/^[a-f0-9]{64}$/i.test(token)) return json({ error: "This card link is not valid." }, 400);
      const { data: card, error } = await db.from("nfc_member_cards")
        .select("id,owner_user_id,card_code,display_name,status,created_at")
        .eq("token_hash", await sha256(token)).maybeSingle();
      if (error) throw error;
      if (!card) return json({ error: "We could not verify this SuperTechAi card." }, 404);
      const activeMember = await hasMembership(card.owner_user_id);
      const membershipStatus = activeMember ? "active" : "inactive";
      if (card.status === "active") {
        const { error: logError } = await db.from("nfc_tap_events").insert({ card_id: card.id, event_type: "profile_view" });
        if (logError) console.error("NFC tap log failed", logError.message);
        const { error: updateError } = await db.from("nfc_member_cards").update({ last_tapped_at: new Date().toISOString() }).eq("id", card.id);
        if (updateError) console.error("NFC last-tap update failed", updateError.message);
      }
      return json({
        verified: card.status === "active" && activeMember,
        cardStatus: card.status,
        membershipStatus,
        cardCode: card.card_code,
        displayName: card.display_name,
        memberSince: card.created_at,
        referralCode: card.status === "active" && activeMember ? await getReferralCode(card.owner_user_id) : null,
      });
    }

    const user = await requireUser(req);
    if (action === "my-card") {
      const allowed = await hasMembership(user.id);
      if (!allowed) return json({ error: "Your SuperTechAi membership is not active yet." }, 403);
      const { data: card, error } = await db.from("nfc_member_cards")
        .select("id,card_code,display_name,status,created_at,last_tapped_at")
        .eq("owner_user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return json({ card: card ?? null, referralCode: await getReferralCode(user.id) });
    }
    if (action === "issue-self") {
      if (body?.replace === true && !(await isAdmin(user.id))) return json({ error: "Only an administrator can replace a suspended or previously issued card." }, 403);
      const result = await issueCard(user.id, user.id, displayName(user), body?.replace === true);
      return json({ ...result, referralCode: await getReferralCode(user.id) }, result.alreadyIssued ? 200 : 201);
    }
    if (action === "list-cards" || action === "list-members" || action === "create-event" || action === "list-events" || action === "set-card-status" || action === "issue-member" || action === "check-in") {
      if (!(await isAdmin(user.id))) return json({ error: "Administrator access required." }, 403);
    }
    if (action === "list-cards") {
      const { data, error } = await db.from("nfc_member_cards")
        .select("id,owner_user_id,card_code,display_name,status,created_at,last_tapped_at")
        .order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return json({ cards: data ?? [] });
    }
    if (action === "list-members") {
      const { data: users, error: usersError } = await db.auth.admin.listUsers({ page: 1, perPage: 500 });
      if (usersError) throw usersError;
      const [{ data: approved, error: approvedError }, { data: admins, error: adminsError }] = await Promise.all([
        db.from("member_access").select("user_id"), db.from("admin_users").select("user_id"),
      ]);
      if (approvedError) throw approvedError;
      if (adminsError) throw adminsError;
      const ids = new Set([...(approved ?? []).map((x) => x.user_id), ...(admins ?? []).map((x) => x.user_id)]);
      return json({ members: (users?.users ?? []).filter((u) => ids.has(u.id)).map((u) => ({
        id: u.id, email: u.email ?? "", displayName: displayName(u),
      })) });
    }
    if (action === "issue-member") {
      const userId = typeof body?.userId === "string" ? body.userId : "";
      if (!userId) return json({ error: "Choose a member first." }, 400);
      const { data: target, error } = await db.auth.admin.getUserById(userId);
      if (error || !target.user) return json({ error: "Member account not found." }, 404);
      const result = await issueCard(userId, user.id, displayName(target.user), body?.replace === true);
      return json(result, result.alreadyIssued ? 200 : 201);
    }
    if (action === "set-card-status") {
      const cardId = typeof body?.cardId === "string" ? body.cardId : "";
      const status = body?.status;
      if (!cardId || !["active", "suspended", "revoked"].includes(status)) return json({ error: "Invalid card update." }, 400);
      if (status === "active") {
        const { data: current, error: currentError } = await db.from("nfc_member_cards").select("owner_user_id").eq("id", cardId).maybeSingle();
        if (currentError) throw currentError;
        if (!current || !(await hasMembership(current.owner_user_id))) return json({ error: "The member must have active access before the card can be activated." }, 409);
      }
      const { error } = await db.from("nfc_member_cards").update({ status, updated_at: new Date().toISOString() }).eq("id", cardId);
      if (error) throw error;
      return json({ ok: true });
    }
    if (action === "create-event") {
      const title = typeof body?.title === "string" ? body.title.trim().slice(0, 120) : "";
      if (!title) return json({ error: "Enter an event name." }, 400);
      const eventCode = "EV-" + randomHex(5).toUpperCase();
      const { data, error } = await db.from("nfc_community_events").insert({
        event_code: eventCode, title, starts_at: body?.startsAt ?? null, ends_at: body?.endsAt ?? null, created_by: user.id,
      }).select("id,event_code,title,starts_at,ends_at,status,created_at").single();
      if (error) throw error;
      return json({ event: data }, 201);
    }
    if (action === "list-events") {
      const { data, error } = await db.from("nfc_community_events").select("id,event_code,title,starts_at,ends_at,status,created_at").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return json({ events: data ?? [] });
    }
    if (action === "check-in") {
      const token = typeof body?.token === "string" ? body.token.trim() : "";
      const eventCode = typeof body?.eventCode === "string" ? body.eventCode.trim() : "";
      if (!/^[a-f0-9]{64}$/i.test(token) || !eventCode) return json({ error: "Scan a member card and select an event." }, 400);
      const [{ data: card, error: cardError }, { data: event, error: eventError }] = await Promise.all([
        db.from("nfc_member_cards").select("id,owner_user_id").eq("token_hash", await sha256(token)).eq("status", "active").maybeSingle(),
        db.from("nfc_community_events").select("id,status").eq("event_code", eventCode).maybeSingle(),
      ]);
      if (cardError) throw cardError;
      if (eventError) throw eventError;
      if (!card || !(await hasMembership(card.owner_user_id))) return json({ error: "This card or membership is not active." }, 404);
      if (!event || !["scheduled", "active"].includes(event.status)) return json({ error: "This event is not accepting check-ins." }, 409);
      const { error: attendanceError } = await db.from("nfc_event_attendance").upsert({
        event_id: event.id, card_id: card.id, member_user_id: card.owner_user_id,
      }, { onConflict: "event_id,member_user_id", ignoreDuplicates: true });
      if (attendanceError) throw attendanceError;
      const { error: tapError } = await db.from("nfc_tap_events").insert({ card_id: card.id, event_type: "event_checkin", event_id: event.id });
      if (tapError) console.error("NFC check-in tap log failed", tapError.message);
      return json({ ok: true, message: "Attendance recorded." });
    }
    return json({ error: "Unknown NFC community action." }, 400);
  } catch (error) {
    const status = typeof error === "object" && error !== null && "status" in error ? Number((error as { status: unknown }).status) : 500;
    const message = error instanceof Error ? error.message : "The NFC service could not complete this request.";
    if (status >= 500) console.error("NFC community error:", message);
    return json({ error: status >= 500 ? "The NFC service is temporarily unavailable." : message }, status || 500);
  }
});