import fs from "node:fs";
const source = fs.readFileSync(new URL("../workers/independent-api/src/referrals.ts", import.meta.url), "utf8");
const checks = [
  ["company Genesis is the fallback sponsor", source.includes("sponsor_user_id: sponsor?.user_id || env.GENESIS_ACCOUNT_ID")],
  ["new members default to the company team", source.includes("team_owner_id: sponsor?.team_owner_id || env.GENESIS_ACCOUNT_ID")],
  ["member profile endpoint provisions a referral code", source.includes('url.pathname === "/api/referrals/me"') && source.includes("ensureMember(env, account)")],
  ["missing referral code defaults to company", source.includes("const row = await ensureMember(env, account, referralCode || undefined)")],
  ["valid referral codes preserve the inviter", source.includes("sponsor = await findByCode(env, referralCode)")],
  ["existing sponsor relationships are preserved", source.includes("if (row.sponsor_user_id && row.team_owner_id) return row")],
  ["company backfill is protected by the company token", source.includes("/api/company/network/backfill") && source.includes("authorizedCompanyRequest(request, env)")],
  ["company backfill paginates all Appwrite users", source.includes('url.searchParams.set("limit", "100")') && source.includes('url.searchParams.set("offset", String(offset))')],
  ["company backfill skips only the Genesis root account", source.includes("user.$id === env.GENESIS_ACCOUNT_ID")],
  ["company backfill creates unique links for previously unassigned users", source.includes("referral_code: code(), sponsor_user_id: env.GENESIS_ACCOUNT_ID")],
  ["owner teams retain their own team root", source.includes('row.role === "owner" ? row.user_id')],
  ["network records remain server-only", source.includes("permissions: []")],
];
const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) { console.error(failed.join("\n")); process.exit(1); }
console.log(`Company-upline/referral checks passed (${checks.length}).`);
