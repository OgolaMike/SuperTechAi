import type { Env } from "./index";

type Account = { $id: string; email: string; name?: string };
type NetworkRow = {
  $id: string;
  row_type: "member";
  user_id: string;
  email: string;
  referral_code: string;
  sponsor_user_id: string;
  team_owner_id: string;
  role: "member" | "owner";
  status: "active";
  created_at: string;
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});
const code = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
};
const endpoint = (env: Env) => `${env.APPWRITE_ENDPOINT.replace(/\/$/, "")}/tablesdb/${env.APPWRITE_DATABASE_ID}/tables/${env.MEMBER_NETWORK_TABLE_ID}/rows`;
const headers = (env: Env) => ({
  "X-Appwrite-Project": env.APPWRITE_PROJECT_ID,
  "X-Appwrite-Key": env.APPWRITE_API_KEY!,
  "Content-Type": "application/json",
});
async function getRow(env: Env, id: string): Promise<NetworkRow | null> {
  const response = await fetch(`${endpoint(env)}/${encodeURIComponent(id)}`, { headers: headers(env) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("network_storage_read_failed");
  return await response.json() as NetworkRow;
}
async function findByCode(env: Env, referralCode: string): Promise<NetworkRow | null> {
  const url = new URL(endpoint(env));
  url.searchParams.append("queries[]", JSON.stringify({ method: "equal", attribute: "referral_code", values: [referralCode] }));
  url.searchParams.append("queries[]", JSON.stringify({ method: "equal", attribute: "status", values: ["active"] }));
  const response = await fetch(url, { headers: headers(env) });
  if (!response.ok) throw new Error("network_code_lookup_failed");
  const result = await response.json() as { rows?: NetworkRow[] };
  return result.rows?.[0] ?? null;
}
async function createRow(env: Env, rowId: string, data: Omit<NetworkRow, "$id">): Promise<NetworkRow> {
  const response = await fetch(endpoint(env), {
    method: "POST", headers: headers(env),
    body: JSON.stringify({ rowId, data, permissions: [] }),
  });
  if (!response.ok) throw new Error("network_member_create_failed");
  return await response.json() as NetworkRow;
}
function safeMember(row: NetworkRow) {
  return {
    referralLink: null,
    referralCode: row.referral_code,
    sponsorUserId: row.sponsor_user_id,
    teamOwnerId: row.team_owner_id,
    role: row.role,
    status: row.status,
  };
}


export async function handleCompanyOwnerRequest(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/company/owners" || request.method !== "POST") return null;
  if (!env.APPWRITE_API_KEY || !env.MEMBER_NETWORK_TABLE_ID || !env.GENESIS_ADMIN_TOKEN || !env.GENESIS_ACCOUNT_ID) {
    return json({ error: "company_owner_onboarding_not_configured" }, 503);
  }
  const supplied = request.headers.get("x-genesis-token") || "";
  if (supplied.length !== env.GENESIS_ADMIN_TOKEN.length || supplied !== env.GENESIS_ADMIN_TOKEN) {
    return json({ error: "company_authorization_required" }, 403);
  }
  try {
    const body = await request.json().catch(() => null) as { userId?: string } | null;
    const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
    if (!/^[a-f0-9-]{36}$/i.test(userId) || userId === env.GENESIS_ACCOUNT_ID) {
      return json({ error: "valid_owner_user_id_required" }, 400);
    }
    if (await getRow(env, userId)) return json({ error: "account_already_in_network" }, 409);
    const userResponse = await fetch(env.APPWRITE_ENDPOINT.replace(/\/$/, "") + "/users/" + encodeURIComponent(userId), {
      headers: { "X-Appwrite-Project": env.APPWRITE_PROJECT_ID, "X-Appwrite-Key": env.APPWRITE_API_KEY },
    });
    if (!userResponse.ok) return json({ error: "owner_account_not_found" }, 404);
    const user = await userResponse.json() as { $id: string; email: string; emailVerification?: boolean; status?: boolean };
    if (user.$id !== userId || !user.emailVerification || user.status === false) {
      return json({ error: "owner_account_must_be_verified_and_active" }, 400);
    }
    const row = await createRow(env, userId, {
      row_type: "member", user_id: userId, email: user.email.toLowerCase(),
      referral_code: code(), sponsor_user_id: env.GENESIS_ACCOUNT_ID,
      team_owner_id: userId, role: "owner", status: "active",
      created_at: new Date().toISOString(),
    });
    return json({ ownerCreated: true, teamOwnerId: row.team_owner_id, referralCode: row.referral_code }, 201);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "company_owner_creation_failed" }, 503);
  }
}

export async function handleReferralRequest(request: Request, env: Env, account: Account): Promise<Response | null> {
  if (!request.url.includes("/api/referrals/")) return null;
  if (!env.APPWRITE_API_KEY || !env.MEMBER_NETWORK_TABLE_ID) return json({ error: "member_network_not_configured" }, 503);
  const url = new URL(request.url);
  try {
    if (url.pathname === "/api/referrals/me" && request.method === "GET") {
      const row = await getRow(env, account.$id);
      if (!row) return json({ assigned: false, reason: "upline_required" }, 200);
      return json({ assigned: true, ...safeMember(row) });
    }
    if (url.pathname === "/api/referrals/activate" && request.method === "POST") {
      const existing = await getRow(env, account.$id);
      if (existing) return json({ assigned: true, ...safeMember(existing) });
      const body = await request.json().catch(() => null) as { referralCode?: string } | null;
      const referralCode = typeof body?.referralCode === "string" ? body.referralCode.trim().toLowerCase() : "";
      if (!/^[a-f0-9]{36}$/.test(referralCode)) return json({ error: "valid_upline_required" }, 400);
      const sponsor = await findByCode(env, referralCode);
      if (!sponsor || sponsor.user_id === account.$id) return json({ error: "invalid_upline" }, 400);
      const row = await createRow(env, account.$id, {
        row_type: "member",
        user_id: account.$id,
        email: account.email.toLowerCase(),
        referral_code: code(),
        sponsor_user_id: sponsor.user_id,
        team_owner_id: sponsor.team_owner_id,
        role: "member",
        status: "active",
        created_at: new Date().toISOString(),
      });
      return json({ assigned: true, ...safeMember(row) }, 201);
    }
    if (url.pathname === "/api/referrals/network" && request.method === "GET") {
      const current = await getRow(env, account.$id);
      if (!current) return json({ error: "upline_required" }, 403);
      const queryUrl = new URL(endpoint(env));
      queryUrl.searchParams.append("queries[]", JSON.stringify({ method: "equal", attribute: "team_owner_id", values: [current.team_owner_id] }));
      const directUrl = new URL(endpoint(env));
      directUrl.searchParams.append("queries[]", JSON.stringify({ method: "equal", attribute: "sponsor_user_id", values: [account.$id] }));
      const [response, directResponse] = await Promise.all([
        fetch(queryUrl, { headers: headers(env) }),
        fetch(directUrl, { headers: headers(env) }),
      ]);
      if (!response.ok || !directResponse.ok) return json({ error: "network_read_failed" }, 503);
      const [result, directResult] = await Promise.all([
        response.json() as Promise<{ rows?: NetworkRow[]; total?: number }>,
        directResponse.json() as Promise<{ total?: number }>,
      ]);
      const members = (result.rows || []).filter((row) => row.team_owner_id === current.team_owner_id);
      return json({
        teamOwnerId: current.team_owner_id,
        directCount: directResult.total ?? 0,
        teamCount: result.total ?? members.length,
        members: members.map((row) => ({
          memberId: row.user_id,
          sponsorId: row.sponsor_user_id,
          role: row.role,
          joinedAt: row.created_at,
        })),
      });
    }
    return json({ error: "method_not_allowed" }, 405);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "member_network_failed" }, 503);
  }
}
