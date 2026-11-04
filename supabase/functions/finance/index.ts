import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const TRON_API = "https://api.trongrid.io";

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function isTronAddress(value: unknown): value is string {
  return typeof value === "string" && /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value);
}
function isTxHash(value: unknown): value is string {
  return typeof value === "string" && /^[a-fA-F0-9]{64}$/.test(value);
}
async function getUser(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  return error ? null : data.user ?? null;
}
async function isAdmin(userId: string) {
  const { data, error } = await db.from("admin_users").select("user_id").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return !!data;
}
async function getSettings() {
  const { data, error } = await db.from("finance_settings").select("*").eq("id", 1).single();
  if (error) throw error;
  return data;
}
async function ensureProfile(userId: string) {
  const { data, error } = await db.from("finance_member_profiles").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (data) return data;
  const code = crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase();
  const { data: created, error: createError } = await db.from("finance_member_profiles")
    .insert({ user_id: userId, referral_code: code }).select("*").single();
  if (createError) throw createError;
  return created;
}
type TronTransfer = { transaction_id?: string; token_info?: { decimals?: number; address?: string }; value?: string; block_timestamp?: number | string; confirmed?: boolean; is_confirmed?: boolean; to?: string; from?: string; block?: number | string };

async function verifyTrc20Transfer(address: string, txHash: string, createdAt: string, expiresAt: string) {
  const params = new URLSearchParams({
    only_confirmed: "true",
    only_to: "true",
    limit: "200",
    order_by: "block_timestamp,desc",
    contract_address: USDT_CONTRACT,
    min_timestamp: String(new Date(createdAt).getTime()),
    max_timestamp: String(new Date(expiresAt).getTime()),
  });
  const headers: Record<string, string> = { Accept: "application/json" };
  const apiKey = Deno.env.get("TRONGRID_API_KEY");
  if (!apiKey) throw new Error("TRON payment verification is not configured yet. Please contact SuperTech AI support.");
  headers["TRON-PRO-API-KEY"] = apiKey;
  const response = await fetch(`${TRON_API}/v1/accounts/${encodeURIComponent(address)}/transactions/trc20?${params}`, { headers });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`TRON verification service returned ${response.status}: ${detail.slice(0, 180)}`);
  }
  const payload = await response.json();
  const transfers = (payload as { data?: TronTransfer[] }).data ?? [];
  const tx = transfers.find((item) => String(item.transaction_id ?? "").toLowerCase() === txHash.toLowerCase());
  if (!tx) return null;
  const decimals = Number(tx.token_info?.decimals ?? 6);
  const rawValue = String(tx.value ?? "");
  const amount = Number(rawValue) / Math.pow(10, decimals);
  const blockTime = Number(tx.block_timestamp ?? 0);
  const confirmed = tx.confirmed === true || tx.is_confirmed === true || params.get("only_confirmed") === "true";
  if (String(tx.token_info?.address ?? "") !== USDT_CONTRACT) throw new Error("The transaction did not use the official USDT TRC20 contract.");
  if (String(tx.to ?? "") !== address) throw new Error("The transaction was not sent to the SuperTech AI treasury address.");
  if (amount !== 300) throw new Error("The transaction amount must be exactly 300 USDT.");
  if (blockTime < new Date(createdAt).getTime() || blockTime > new Date(expiresAt).getTime()) throw new Error("The payment was outside this payment order's validity window.");
  if (!confirmed) return null;
  return {
    transaction_id: tx.transaction_id,
    from: tx.from,
    to: tx.to,
    amount,
    token_contract: tx.token_info?.address,
    block_timestamp: blockTime,
    block: tx.block,
    confirmed: true,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const user = await getUser(req);
    if (!user) return reply({ error: "Please sign in first." }, 401);

    const url = new URL(req.url);
    const method = req.method.toUpperCase();
    const body = method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = String(body.action ?? url.searchParams.get("action") ?? "dashboard");

    if ((method === "GET" || method === "POST") && action === "dashboard") {
      const profile = await ensureProfile(user.id);
      const [{ data: orders, error: ordersError }, { data: withdrawals, error: withdrawalsError }, { data: owner }, { data: access, error: accessError }] = await Promise.all([
        db.from("finance_payment_orders").select("id,amount,network,status,tx_hash,created_at,expires_at,confirmed_at,treasury_address").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
        db.from("finance_withdrawal_requests").select("*").eq("user_id", user.id).order("requested_at", { ascending: false }).limit(30),
        db.from("finance_owner_accounts").select("owner_slot,display_name,payout_address").eq("user_id", user.id).eq("active", true).maybeSingle(),
        db.from("member_access").select("user_id").eq("user_id", user.id).maybeSingle(),
      ]);
      if (ordersError) throw ordersError;
      if (withdrawalsError) throw withdrawalsError;
      if (accessError) throw accessError;
      const accountCode = owner ? `owner:${owner.owner_slot}` : `member:${user.id}`;
      const { data: ownEntries, error: ownEntriesError } = await db.from("finance_ledger_entries").select("amount,entry_type,created_at").eq("account_code", accountCode).order("created_at", { ascending: false }).limit(100);
      if (ownEntriesError) throw ownEntriesError;
      const { data: balanceValue, error: balanceError } = await db.rpc("finance_get_balance", { p_account_code: accountCode });
      if (balanceError) throw balanceError;
      const balance = Number(balanceValue ?? 0);
      const { count: referralCount, error: referralError } = await db.from("finance_member_profiles").select("user_id", { count: "exact", head: true }).eq("sponsor_user_id", user.id);
      if (referralError) throw referralError;
      return reply({ profile, orders: orders ?? [], ledger: ownEntries ?? [], withdrawals: withdrawals ?? [], balance, accountCode, ownerAccount: owner ?? null, directReferrals: referralCount ?? 0, membershipPrice: 300, withdrawalFeePct: 15, membershipActive: !!access });
    }

    if (method === "POST" && action === "create-payment") {
      const settings = await getSettings();
      if (!isTronAddress(settings.treasury_address)) return reply({ error: "SuperTech AI's TRC20 treasury wallet has not been configured yet. Please contact support." }, 409);
      const profile = await ensureProfile(user.id);
      let sponsorId = profile.sponsor_user_id;
      let sponsorAccountCode = profile.sponsor_account_code ?? null;
      const referralCode = typeof body.referral_code === "string" ? body.referral_code.trim().toUpperCase() : "";

      // The company account sponsors the initial ten paid memberships. After that,
      // every new member must arrive through an existing member's personal link.
      if (!sponsorId && !sponsorAccountCode && referralCode) {
        if (referralCode === String(settings.company_referral_code ?? "SUPERTECHAI").toUpperCase()) {
          const { data: companyOrders, error: companyOrdersError } = await db
            .from("finance_payment_orders")
            .select("user_id,status,expires_at")
            .eq("sponsor_account_code", "company:account");
          if (companyOrdersError) throw companyOrdersError;
          const activeCompanyReferrals = new Set((companyOrders ?? [])
            .filter((row) => row.status === "confirmed" || (row.status === "pending" && new Date(row.expires_at).getTime() > Date.now()))
            .map((row) => row.user_id)).size;
          if (activeCompanyReferrals >= 10) {
            return reply({ error: "The company's initial ten membership places have been filled. Please use a referral link from an existing SuperTech AI member." }, 403);
          }
          const { error: linkError } = await db.from("finance_member_profiles")
            .update({ sponsor_account_code: "company:account", updated_at: new Date().toISOString() })
            .eq("user_id", user.id).is("sponsor_user_id", null).is("sponsor_account_code", null);
          if (linkError) throw linkError;
          sponsorAccountCode = "company:account";
        } else {
          const { data: sponsor, error: sponsorError } = await db.from("finance_member_profiles").select("user_id").eq("referral_code", referralCode).maybeSingle();
          if (sponsorError) throw sponsorError;
          if (!sponsor) return reply({ error: "That referral code was not found. Ask an existing member for their personal referral link." }, 400);
          if (sponsor.user_id === user.id) return reply({ error: "You cannot use your own referral code." }, 400);
          const { error: linkError } = await db.from("finance_member_profiles")
            .update({ sponsor_user_id: sponsor.user_id, updated_at: new Date().toISOString() })
            .eq("user_id", user.id).is("sponsor_user_id", null).is("sponsor_account_code", null);
          if (linkError) throw linkError;
          sponsorId = sponsor.user_id;
        }
      }
      if (!sponsorId && !sponsorAccountCode) {
        return reply({ error: "A referral link is required. The company code is available only for the initial ten memberships; everyone joining afterward must use an existing member's referral link." }, 403);
      }
      const { data: existing, error: existingError } = await db.from("finance_payment_orders").select("*").eq("user_id", user.id).eq("status", "pending").gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (existingError) throw existingError;
      if (existing) return reply({ order: existing, treasury_address: existing.treasury_address, amount: 300, network: "TRC20", token_contract: USDT_CONTRACT });
      const expiresAt = new Date(Date.now() + Number(settings.payment_expiry_minutes ?? 120) * 60_000).toISOString();
      const { data: order, error: insertError } = await db.from("finance_payment_orders").insert({
        user_id: user.id, sponsor_user_id: sponsorId, sponsor_account_code: sponsorAccountCode,
        referral_code: referralCode || null,
        amount: 300, network: "TRC20", token_contract: USDT_CONTRACT,
        treasury_address: settings.treasury_address, expires_at: expiresAt,
      }).select("*").single();
      if (insertError) throw insertError;
      return reply({ order, treasury_address: settings.treasury_address, amount: 300, network: "TRC20", token_contract: USDT_CONTRACT });
    }

    if (method === "POST" && action === "verify-payment") {
      const orderId = String(body.order_id ?? "");
      const txHash = String(body.tx_hash ?? "").trim();
      if (!orderId || !isTxHash(txHash)) return reply({ error: "Enter a valid TRON transaction hash." }, 400);
      const { data: order, error: orderError } = await db.from("finance_payment_orders").select("*").eq("id", orderId).eq("user_id", user.id).maybeSingle();
      if (orderError) throw orderError;
      if (!order) return reply({ error: "Payment order not found." }, 404);
      if (order.status === "confirmed") return reply({ ok: true, status: "confirmed", activated: true });
      if (order.status !== "pending") return reply({ error: `This payment order is ${order.status}.` }, 409);
      const transfer = await verifyTrc20Transfer(order.treasury_address, txHash, order.created_at, order.expires_at);
      if (!transfer) return reply({ ok: true, status: "pending", message: "The transaction has not reached confirmed TRON state yet. We will keep checking." }, 202);
      const { data: settled, error: settleError } = await db.rpc("finance_settle_membership", {
        p_order_id: order.id, p_tx_hash: txHash.toLowerCase(), p_chain_payload: transfer,
      });
      if (settleError) throw settleError;
      return reply({ ok: true, status: "confirmed", activated: true, settlement: settled });
    }

    if (method === "POST" && action === "request-withdrawal") {
      const amount = Number(body.amount);
      const destination = String(body.destination_address ?? "").trim();
      if (!Number.isFinite(amount) || amount <= 0 || !isTronAddress(destination)) return reply({ error: "Enter a valid USDT amount and TRON wallet address." }, 400);
      const { data: owner } = await db.from("finance_owner_accounts").select("owner_slot").eq("user_id", user.id).eq("active", true).maybeSingle();
      if (!owner) {
        const { data: access, error: accessError } = await db.from("member_access").select("user_id").eq("user_id", user.id).maybeSingle();
        if (accessError) throw accessError;
        if (!access) return reply({ error: "Complete your 300 USDT membership payment before requesting referral withdrawals." }, 403);
      }
      const { data, error } = await db.rpc("finance_create_withdrawal", {
        p_user_id: user.id, p_owner_slot: owner?.owner_slot ?? null,
        p_gross_amount: amount, p_destination_address: destination,
      });
      if (error) throw error;
      return reply(data);
    }

    if ((method === "GET" || method === "POST") && action === "admin") {
      if (!(await isAdmin(user.id))) return reply({ error: "Administrators only." }, 403);
      const [settings, owners, withdrawals, orders, entries] = await Promise.all([
        getSettings(),
        db.from("finance_owner_accounts").select("*").order("owner_slot"),
        db.from("finance_withdrawal_requests").select("*").order("requested_at", { ascending: false }).limit(100),
        db.from("finance_payment_orders").select("id,user_id,amount,status,tx_hash,created_at,confirmed_at").order("created_at", { ascending: false }).limit(100),
        db.rpc("finance_get_all_balances"),
      ]);
      if (owners.error) throw owners.error;
      if (withdrawals.error) throw withdrawals.error;
      if (orders.error) throw orders.error;
      if (entries.error) throw entries.error;
      const sums: Record<string, number> = {};
      for (const row of entries.data ?? []) sums[row.account_code] = Number(row.balance);
      return reply({ settings, owners: owners.data ?? [], withdrawals: withdrawals.data ?? [], orders: orders.data ?? [], accountBalances: sums });
    }

    if (method === "POST" && action === "update-settings") {
      if (!(await isAdmin(user.id))) return reply({ error: "Administrators only." }, 403);
      const address = String(body.treasury_address ?? "").trim();
      if (!isTronAddress(address)) return reply({ error: "Enter a valid TRC20 treasury address." }, 400);
      const { error } = await db.from("finance_settings").update({ treasury_address: address, updated_at: new Date().toISOString() }).eq("id", 1);
      if (error) throw error;
      await db.from("finance_audit_log").insert({ actor_user_id: user.id, event_type: "treasury_address_updated", entity_type: "finance_settings", entity_id: "1", details: { network: "TRC20" } });
      return reply({ ok: true });
    }

    if (method === "POST" && action === "update-owner") {
      if (!(await isAdmin(user.id))) return reply({ error: "Administrators only." }, 403);
      const slot = Number(body.owner_slot);
      const name = String(body.display_name ?? "").trim();
      const ownerUserId = body.user_id ? String(body.user_id) : null;
      const payoutAddress = body.payout_address ? String(body.payout_address).trim() : null;
      if (!Number.isInteger(slot) || slot < 1 || slot > 5 || !name || (payoutAddress && !isTronAddress(payoutAddress))) return reply({ error: "Invalid owner details." }, 400);
      const { error } = await db.from("finance_owner_accounts").update({
        display_name: name, user_id: ownerUserId, payout_address: payoutAddress,
        active: body.active !== false, updated_at: new Date().toISOString(),
      }).eq("owner_slot", slot);
      if (error) throw error;
      await db.from("finance_audit_log").insert({ actor_user_id: user.id, event_type: "owner_account_updated", entity_type: "owner_account", entity_id: String(slot), details: { display_name: name, user_id: ownerUserId, payout_address: payoutAddress } });
      return reply({ ok: true });
    }

    if (method === "POST" && action === "process-withdrawal") {
      if (!(await isAdmin(user.id))) return reply({ error: "Administrators only." }, 403);
      const id = String(body.withdrawal_id ?? "");
      const actionValue = String(body.withdrawal_action ?? "");
      if (!id || !["paid", "rejected"].includes(actionValue)) return reply({ error: "Invalid withdrawal action." }, 400);
      if (actionValue === "paid" && !isTxHash(body.tx_hash)) return reply({ error: "Enter the outgoing TRON transaction hash." }, 400);
      const { data, error } = await db.rpc("finance_finalize_withdrawal", {
        p_withdrawal_id: id, p_action: actionValue,
        p_tx_hash: body.tx_hash ?? null, p_reason: body.reason ?? null, p_admin_id: user.id,
      });
      if (error) throw error;
      return reply(data);
    }

    return reply({ error: "Unknown finance action." }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("finance function error", message);
    return reply({ error: message }, 500);
  }
});
