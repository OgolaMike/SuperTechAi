import type { Env } from "./index";

type Account = { $id: string; email: string; name?: string };
type MembershipRow = {
  $id: string; user_id: string; email: string; status: "pending" | "approved" | "rejected" | "suspended";
  plan_code: "free" | "standard_300" | "automation_500"; created_at: string; updated_at: string;
  reviewed_at?: string; reviewed_by?: string; review_note?: string;
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});
const base = (env: Env) => `${env.APPWRITE_ENDPOINT.replace(/\/$/, "")}/tablesdb/${env.APPWRITE_DATABASE_ID}/tables/${env.MEMBERSHIP_TABLE_ID || "membership_requests"}/rows`;
const headers = (env: Env) => ({
  "X-Appwrite-Project": env.APPWRITE_PROJECT_ID, "X-Appwrite-Key": env.APPWRITE_API_KEY!, "Content-Type": "application/json",
});
function publicStatus(row: MembershipRow) {
  return { status: row.status, planCode: row.plan_code, createdAt: row.created_at, reviewedAt: row.reviewed_at || null, reviewNote: row.review_note || null };
}
async function getMembership(env: Env, userId: string): Promise<MembershipRow | null> {
  const response = await fetch(`${base(env)}/${encodeURIComponent(userId)}`, { headers: headers(env) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("membership_read_failed");
  return await response.json() as MembershipRow;
}
async function ensureMembership(env: Env, account: Account): Promise<MembershipRow> {
  const current = await getMembership(env, account.$id);
  if (current) return current;
  const now = new Date().toISOString();
  const response = await fetch(base(env), {
    method: "POST", headers: headers(env),
    body: JSON.stringify({
      rowId: account.$id,
      data: { user_id: account.$id, email: account.email.toLowerCase(), status: "pending", plan_code: "free", created_at: now, updated_at: now, reviewed_at: "", reviewed_by: "", review_note: "" },
      permissions: [],
    }),
  });
  if (!response.ok) {
    // A concurrent first login may have created the deterministic row.
    const raced = await getMembership(env, account.$id);
    if (raced) return raced;
    throw new Error("membership_request_create_failed");
  }
  return await response.json() as MembershipRow;
}
async function isCompanyAdmin(env: Env, account: Account): Promise<boolean> {
  return Boolean(env.GENESIS_ACCOUNT_ID && account.$id === env.GENESIS_ACCOUNT_ID);
}
export async function handleMembershipRequest(request: Request, env: Env, account: Account): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/membership/") && !url.pathname.startsWith("/api/admin/members")) return null;
  if (!env.APPWRITE_API_KEY || !env.APPWRITE_DATABASE_ID) return json({ error: "membership_storage_not_configured" }, 503);

  try {
    if (url.pathname === "/api/membership/status" && request.method === "GET") {
      if (await isCompanyAdmin(env, account)) return json({ status: "approved", planCode: "automation_500", isAdmin: true });
      const row = await ensureMembership(env, account);
      return json({ ...publicStatus(row), isAdmin: false });
    }
    if (url.pathname === "/api/admin/members" && request.method === "GET") {
      if (!(await isCompanyAdmin(env, account))) return json({ error: "company_admin_required" }, 403);
      const query = new URL(base(env));
      query.searchParams.set("queries[]", JSON.stringify({ method: "orderDesc", attribute: "created_at" }));
      query.searchParams.set("limit", "100");
      const response = await fetch(query, { headers: headers(env) });
      if (!response.ok) return json({ error: "membership_list_failed" }, 503);
      const result = await response.json() as { rows?: MembershipRow[]; total?: number };
      return json({ members: (result.rows || []).map(row => ({
        userId: row.user_id, email: row.email, status: row.status, planCode: row.plan_code,
        createdAt: row.created_at, reviewedAt: row.reviewed_at || null, reviewedBy: row.reviewed_by || null, reviewNote: row.review_note || "",
      })), total: result.total ?? result.rows?.length ?? 0 });
    }
    const match = url.pathname.match(/^\/api\/admin\/members\/([a-f0-9-]{36})$/i);
    if (match && request.method === "POST") {
      if (!(await isCompanyAdmin(env, account))) return json({ error: "company_admin_required" }, 403);
      const targetId = match[1];
      const body = await request.json().catch(() => null) as { action?: string; planCode?: string; note?: string } | null;
      if (!body || !["approve", "reject", "suspend"].includes(body.action || "")) return json({ error: "invalid_membership_action" }, 400);
      const plan = body.planCode || "free";
      if (body.action === "approve" && !["free", "standard_300", "automation_500"].includes(plan)) return json({ error: "invalid_membership_plan" }, 400);
      if (typeof body.note === "string" && body.note.length > 500) return json({ error: "review_note_too_long" }, 400);
      const existing = await getMembership(env, targetId);
      if (!existing) return json({ error: "member_not_found" }, 404);
      const now = new Date().toISOString();
      const next = {
        status: body.action === "approve" ? "approved" : body.action === "reject" ? "rejected" : "suspended",
        plan_code: body.action === "approve" ? plan : existing.plan_code,
        updated_at: now, reviewed_at: now, reviewed_by: account.$id, review_note: (body.note || "").trim(),
      };
      const response = await fetch(`${base(env)}/${encodeURIComponent(targetId)}`, {
        method: "PATCH", headers: headers(env),
        body: JSON.stringify({ data: next, permissions: [] }),
      });
      if (!response.ok) return json({ error: "membership_update_failed" }, 503);
      const saved = await response.json() as MembershipRow;
      return json({ updated: true, member: { userId: saved.user_id, status: saved.status, planCode: saved.plan_code } });
    }
    return json({ error: "method_not_allowed" }, 405);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "membership_service_failed" }, 503);
  }
}
