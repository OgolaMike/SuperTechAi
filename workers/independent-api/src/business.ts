import type { Env } from "./index";

type Account = { $id: string; email: string };
type Row = { $id: string; [key: string]: unknown };
type User = { $id: string; email?: string; name?: string; status?: boolean; emailVerification?: boolean };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const table = (env: Env, id: string) => `${env.APPWRITE_ENDPOINT.replace(/\/$/, "")}/tablesdb/${env.APPWRITE_DATABASE_ID}/tables/${id}/rows`;
const apiHeaders = (env: Env) => ({ "X-Appwrite-Project": env.APPWRITE_PROJECT_ID, "X-Appwrite-Key": env.APPWRITE_API_KEY!, "Content-Type": "application/json" });
const isCompany = (env: Env, account: Account) => Boolean(env.GENESIS_ACCOUNT_ID && account.$id === env.GENESIS_ACCOUNT_ID);
const money = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

async function listRows(env: Env, tableId: string): Promise<Row[]> {
  const all: Row[] = [];
  for (let offset = 0; offset < 5000; offset += 100) {
    const url = new URL(table(env, tableId));
    url.searchParams.set("limit", "100");
    url.searchParams.set("offset", String(offset));
    const response = await fetch(url, { headers: apiHeaders(env) });
    if (!response.ok) throw new Error("company_finance_read_failed");
    const payload = await response.json() as { rows?: Row[]; total?: number };
    const rows = payload.rows || [];
    all.push(...rows);
    if (!rows.length || all.length >= (payload.total ?? all.length)) break;
  }
  return all;
}

async function listUsers(env: Env): Promise<User[]> {
  const all: User[] = [];
  for (let offset = 0; offset < 5000; offset += 100) {
    const url = new URL(env.APPWRITE_ENDPOINT.replace(/\/$/, "") + "/users");
    url.searchParams.set("limit", "100");
    url.searchParams.set("offset", String(offset));
    const response = await fetch(url, { headers: apiHeaders(env) });
    if (!response.ok) throw new Error("company_member_read_failed");
    const payload = await response.json() as { users?: User[]; total?: number };
    const users = payload.users || [];
    all.push(...users);
    if (!users.length || all.length >= (payload.total ?? all.length)) break;
  }
  return all;
}

function weekWindow(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find(x => x.type === type)?.value || "";
  const localDate = new Date(Date.UTC(Number(part("year")), Number(part("month")) - 1, Number(part("day"))));
  const weekday = (localDate.getUTCDay() + 6) % 7;
  localDate.setUTCDate(localDate.getUTCDate() - weekday);
  const startKey = localDate.toISOString().slice(0, 10);
  const endDate = new Date(localDate); endDate.setUTCDate(endDate.getUTCDate() + 7);
  const weekKey = startKey.replace(/-/g, "");
  // Nairobi is UTC+3 year-round; convert local Monday midnight boundaries to UTC.
  const start = new Date(localDate.getTime() - 3 * 60 * 60 * 1000);
  const end = new Date(endDate.getTime() - 3 * 60 * 60 * 1000);
  return { weekKey, start: start.toISOString(), end: end.toISOString(), startDate: startKey, endDate: endDate.toISOString().slice(0, 10) };
}

async function stableId(value: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

function randomIndex(length: number): number {
  if (length < 1) throw new Error("no_eligible_members");
  const ceiling = Math.floor(0x100000000 / length) * length;
  const buffer = new Uint32Array(1);
  let value = ceiling;
  while (value >= ceiling) {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  }
  return value % length;
}

async function patchRow(env: Env, tableId: string, id: string, data: Record<string, unknown>) {
  const response = await fetch(table(env, tableId) + "/" + encodeURIComponent(id), {
    method: "PATCH", headers: apiHeaders(env), body: JSON.stringify({ data, permissions: [] }),
  });
  if (!response.ok) throw new Error("company_finance_update_failed");
  return await response.json() as Row;
}

async function createUniqueRow(env: Env, tableId: string, id: string, data: Record<string, unknown>) {
  const endpoint = `${table(env, tableId)}/${encodeURIComponent(id)}`;
  const existing = await fetch(endpoint, { headers: apiHeaders(env) });
  if (existing.ok) return await existing.json() as Row;
  if (existing.status !== 404) throw new Error("company_finance_read_failed");
  const created = await fetch(table(env, tableId), { method: "POST", headers: apiHeaders(env), body: JSON.stringify({ rowId: id, data, permissions: [] }) });
  if (created.ok) return await created.json() as Row;
  if (created.status === 409) {
    const raced = await fetch(endpoint, { headers: apiHeaders(env) });
    if (raced.ok) return await raced.json() as Row;
  }
  throw new Error("company_finance_write_failed");
}

async function businessOverview(env: Env) {
  const [payments, commissions, ledger] = await Promise.all([
    listRows(env, env.PAYMENT_SUBMISSIONS_TABLE_ID || "payment_submissions"),
    listRows(env, env.COMMISSION_RECORDS_TABLE_ID || "commission_records"),
    listRows(env, env.FINANCIAL_LEDGER_TABLE_ID || "financial_ledger"),
  ]);
  const approved = payments.filter(row => row.status === "approved");
  const totalSales = approved.reduce((sum, row) => sum + money(row.amount_usd), 0);
  const commissionTypes = ["direct", "infinity", "infinity_pool", "unilevel", "just_4_you", "just_4_you_pool"];
  const income = Object.fromEntries(commissionTypes.map(type => {
    const rows = commissions.filter(row => row.commission_type === type && row.status !== "reversed");
    return [type, { accrued: rows.reduce((sum, row) => sum + money(row.amount), 0), pending: rows.filter(row => row.status === "pending" || row.status === "reserved").reduce((sum, row) => sum + money(row.amount), 0), paid: rows.filter(row => row.status === "paid").reduce((sum, row) => sum + money(row.amount), 0), records: rows.length }];
  }));
  const companyRows = ledger.filter(row => row.entry_type === "company_share" && row.status === "confirmed");
  const companyRevenue = companyRows.reduce((sum, row) => sum + money(row.amount), 0);
  const companyReferralIncome = commissions.filter(row => row.user_id === env.GENESIS_ACCOUNT_ID && row.status !== "reversed" && ["direct", "infinity", "unilevel"].includes(String(row.commission_type))).reduce((sum, row) => sum + money(row.amount), 0);
  const companyTotalIncome = companyRevenue + companyReferralIncome;
  const pendingPayments = payments.filter(row => row.status === "pending");
  const rejectedPayments = payments.filter(row => row.status === "rejected");
  const withdrawals = ledger.filter(row => row.entry_type === "withdrawal" || row.entry_type === "payout");
  const period = weekWindow();
  const weeklySales = approved.filter(row => {
    const at = String(row.reviewed_at || row.submitted_at || "");
    return at >= period.start && at < period.end;
  }).reduce((sum, row) => sum + money(row.amount_usd), 0);
  const just4youPool = commissions.filter(row => row.commission_type === "just_4_you_pool" && row.status === "reserved" && approved.some(payment => payment.$id === row.reference_id)).reduce((sum, row) => sum + money(row.amount), 0);
  return {
    currency: "USD", totalSales, approvedPayments: approved.length, pendingPayments: pendingPayments.length,
    pendingPaymentValue: pendingPayments.reduce((sum, row) => sum + money(row.amount_usd), 0),
    companyReferralIncome, companyTotalIncome,
    rejectedPayments: rejectedPayments.length, companyRevenue, companyRevenueRecords: companyRows.length,
    income, weekly: { start: period.startDate, end: period.endDate, qualifyingSales: weeklySales, just4youPool: weeklySales * 0.05 },
    just4youReservedTotal: just4youPool,
    withdrawalRecords: withdrawals.length,
    planSales: {
      standard300: approved.filter(row => row.plan_code === "standard_300").reduce((sum, row) => sum + money(row.amount_usd), 0),
      automation500: approved.filter(row => row.plan_code === "automation_500").reduce((sum, row) => sum + money(row.amount_usd), 0),
    },
  };
}

async function just4youDashboard(env: Env) {
  const period = weekWindow(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
  const [payments, users, memberships, draws] = await Promise.all([
    listRows(env, env.PAYMENT_SUBMISSIONS_TABLE_ID || "payment_submissions"),
    listUsers(env),
    listRows(env, env.MEMBERSHIP_TABLE_ID || "membership_requests"),
    listRows(env, env.JUST4YOU_DRAWS_TABLE_ID || "just4you_draws"),
  ]);
  const approved = payments.filter(row => row.status === "approved" && String(row.reviewed_at || row.submitted_at || "") >= period.start && String(row.reviewed_at || row.submitted_at || "") < period.end);
  const sales = approved.reduce((sum, row) => sum + money(row.amount_usd), 0);
  const eligibleIds = new Set(memberships.filter(row => row.status === "approved" && row.plan_code && row.user_id).map(row => String(row.user_id)));
  const eligible = users.filter(user => user.$id !== env.GENESIS_ACCOUNT_ID && user.status !== false && user.emailVerification === true && eligibleIds.has(user.$id));
  const latest = draws.sort((a, b) => String(b.drawn_at || "").localeCompare(String(a.drawn_at || "")))[0] || null;
  const existing = draws.find(row => row.week_key === period.weekKey) || null;
  return {
    weekStart: period.startDate, weekEnd: period.endDate, qualifyingSales: sales, bonusRatePct: 5,
    salesPool: sales * 0.05, eligibleMembers: eligible.length,
    latestDraw: latest ? { weekStart: latest.week_start, weekEnd: latest.week_end, winnerName: latest.winner_name, winnerUserId: latest.winner_user_id, prizeAmount: money(latest.prize_amount), drawnAt: latest.drawn_at, status: latest.status } : null,
    currentDraw: existing ? { weekStart: existing.week_start, winnerName: existing.winner_name, prizeAmount: money(existing.prize_amount), drawnAt: existing.drawn_at, status: existing.status } : null,
    canDraw: !existing && sales > 0 && eligible.length > 0,
  };
}

async function runJust4YouDraw(env: Env, actor: Account) {
  if (!env.JUST4YOU_DRAWS_TABLE_ID) throw new Error("just4you_draws_table_not_configured");
  const period = weekWindow(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
  const drawId = await stableId("just4you:" + period.weekKey);
  const drawEndpoint = table(env, env.JUST4YOU_DRAWS_TABLE_ID) + "/" + encodeURIComponent(drawId);
  const priorResponse = await fetch(drawEndpoint, { headers: apiHeaders(env) });
  let drawRow: Row | null = null;
  if (priorResponse.ok) drawRow = await priorResponse.json() as Row;
  else if (priorResponse.status !== 404) throw new Error("just4you_draw_read_failed");

  if (!drawRow) {
    const [payments, users, memberships] = await Promise.all([
      listRows(env, env.PAYMENT_SUBMISSIONS_TABLE_ID || "payment_submissions"),
      listUsers(env),
      listRows(env, env.MEMBERSHIP_TABLE_ID || "membership_requests"),
    ]);
    const qualifying = payments.filter(row => row.status === "approved" && String(row.reviewed_at || row.submitted_at || "") >= period.start && String(row.reviewed_at || row.submitted_at || "") < period.end);
    const sales = qualifying.reduce((sum, row) => sum + money(row.amount_usd), 0);
    const paidIds = new Set(memberships.filter(row => row.status === "approved" && row.plan_code && row.user_id).map(row => String(row.user_id)));
    const eligible = users.filter(user => user.$id !== env.GENESIS_ACCOUNT_ID && user.status !== false && user.emailVerification === true && paidIds.has(user.$id));
    if (sales <= 0) throw new Error("no_qualifying_bonus_pool");
    if (!eligible.length) throw new Error("no_eligible_members");
    const winner = eligible[randomIndex(eligible.length)];
    const prize = Math.round(sales * 0.05 * 100) / 100;
    drawRow = await createUniqueRow(env, env.JUST4YOU_DRAWS_TABLE_ID, drawId, {
      week_key: period.weekKey, week_start: period.startDate, week_end: period.endDate,
      qualifying_sales: sales, prize_amount: prize, eligible_members: eligible.length,
      winner_user_id: winner.$id, winner_name: winner.name || winner.email || "SuperTech AI member",
      drawn_at: new Date().toISOString(), drawn_by: actor.$id, status: "awarded",
    });
  }

  // Resume safely if an earlier request created the draw row but failed while
  // recording the member award. Deterministic IDs prevent duplicate credits.
  const [weekPayments, weekCommissions] = await Promise.all([
    listRows(env, env.PAYMENT_SUBMISSIONS_TABLE_ID || "payment_submissions"),
    listRows(env, env.COMMISSION_RECORDS_TABLE_ID || "commission_records"),
  ]);
  const weekPaymentIds = new Set(weekPayments.filter(row => row.status === "approved" && String(row.reviewed_at || row.submitted_at || "") >= period.start && String(row.reviewed_at || row.submitted_at || "") < period.end).map(row => row.$id));
  const reservedPoolRows = weekCommissions.filter(row => row.commission_type === "just_4_you_pool" && row.status === "reserved" && weekPaymentIds.has(String(row.reference_id)));
  for (const poolRow of reservedPoolRows) {
    await patchRow(env, env.COMMISSION_RECORDS_TABLE_ID || "commission_records", poolRow.$id, { status: "allocated" });
  }

  const winnerId = String(drawRow.winner_user_id || "");
  const winnerName = String(drawRow.winner_name || "SuperTech AI member");
  const prize = money(drawRow.prize_amount);
  if (!winnerId || prize <= 0) throw new Error("just4you_draw_record_invalid");
  const commissionId = await stableId("just4you-award:" + period.weekKey);
  await createUniqueRow(env, env.COMMISSION_RECORDS_TABLE_ID || "commission_records", commissionId, {
    user_id: winnerId, source_user_id: env.GENESIS_ACCOUNT_ID || actor.$id,
    commission_type: "just_4_you", level: null, amount: prize, currency: "USD",
    status: "pending", reference_id: drawId, created_at: String(drawRow.drawn_at || new Date().toISOString()), paid_at: null,
  });
  const ledgerId = await stableId("just4you-ledger:" + period.weekKey);
  await createUniqueRow(env, env.FINANCIAL_LEDGER_TABLE_ID || "financial_ledger", ledgerId, {
    user_id: winnerId, entry_type: "just_4_you_bonus", amount: prize, currency: "USD",
    reference_id: drawId, status: "pending", metadata_json: JSON.stringify({ weekKey: period.weekKey, eligibleMembers: drawRow.eligible_members }),
    created_at: String(drawRow.drawn_at || new Date().toISOString()),
  });
  return { drawn: true, weekStart: period.startDate, weekEnd: period.endDate, winnerName, winnerUserId: winnerId, prizeAmount: prize, eligibleMembers: money(drawRow.eligible_members), drawId };
}
export async function handleCompanyBusinessRequest(request: Request, env: Env, account: Account): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/company/business") && !url.pathname.startsWith("/api/company/just4you")) return null;
  if (!isCompany(env, account)) return json({ error: "company_admin_required" }, 403);
  if (!env.APPWRITE_API_KEY) return json({ error: "company_finance_not_configured" }, 503);
  try {
    if (url.pathname === "/api/company/business" && request.method === "GET") return json(await businessOverview(env));
    if (url.pathname === "/api/company/just4you" && request.method === "GET") return json(await just4youDashboard(env));
    if (url.pathname === "/api/company/just4you/draw" && request.method === "POST") return json(await runJust4YouDraw(env, account), 201);
    return json({ error: "method_not_allowed" }, 405);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "company_business_failed" }, 503);
  }
}


export async function runScheduledJust4YouDraw(env: Env) {
  if (!env.GENESIS_ACCOUNT_ID) throw new Error("company_genesis_account_not_configured");
  return runJust4YouDraw(env, { $id: env.GENESIS_ACCOUNT_ID, email: "" });
}
