#!/usr/bin/env node
/**
 * Idempotently provisions blank Appwrite tables for the independent SuperTech AI
 * edition. Existing rows are never read, copied, deleted, or rewritten.
 * Schema mismatches fail closed rather than mutating existing columns.
 */
const endpoint = (process.env.APPWRITE_ENDPOINT || "https://fra.cloud.appwrite.io/v1").replace(/\/$/, "");
const projectId = process.env.APPWRITE_PROJECT_ID || "6b06de46003dde834eb6";
const databaseId = process.env.APPWRITE_DATABASE_ID || "6b06e4d900325c304d98";
const apiKey = process.env.APPWRITE_API_KEY;
if (!apiKey) throw new Error("Missing APPWRITE_API_KEY secret.");

const root = `${endpoint}/tablesdb/${encodeURIComponent(databaseId)}/tables`;
const headers = {
  "X-Appwrite-Project": projectId,
  "X-Appwrite-Key": apiKey,
  "Content-Type": "application/json",
  "X-Appwrite-Response-Format": "1.9.5",
};
async function request(path, method = "GET", body) {
  const response = await fetch(`${root}${path}`, {
    method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { /* keep status */ }
  if (!response.ok) {
    const error = new Error(`Appwrite ${method} ${path} failed (${response.status}): ${data.message || data.type || "request_failed"}`);
    error.status = response.status;
    throw error;
  }
  return data;
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check, label) {
  for (let i = 0; i < 30; i++) {
    const value = await check();
    if (value) return value;
    await sleep(2000);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}
async function list(path, key) {
  const value = await request(path);
  return Array.isArray(value[key]) ? value[key] : [];
}

const tables = [
  { id: "member_network", name: "Member Network", columns: [["row_type","varchar",16,true],["referral_code","varchar",64,false],["user_id","varchar",36,false],["email","varchar",320,false],["referrer_user_id","varchar",36,false],["referred_user_id","varchar",36,false],["sponsor_user_id","varchar",36,false],["team_id","varchar",32,false],["team_owner_id","varchar",36,false],["role","varchar",16,false],["status","varchar",24,false],["created_at","datetime",null,false],["attributed_at","datetime",null,false]], indexes: [["referral_code","unique",["referral_code"]],["user_id_key","key",["user_id"]],["sponsor_user_id_key","key",["sponsor_user_id"]],["team_owner_id_key","key",["team_owner_id"]],["referred_user_id_key","key",["referred_user_id"]]] },
  { id: "push_subscriptions", name: "Push Subscriptions", columns: [["user_id","varchar",36,true],["endpoint","varchar",4096,true],["active","boolean",null,true],["created_at","datetime",null,true]], indexes: [["user_id_key","key",["user_id"]]] },
  { id: "ctrader_oauth_states", name: "cTrader OAuth States", columns: [["state_hash","varchar",64,true],["user_id","varchar",36,true],["redirect_path","varchar",512,true],["expires_at","datetime",null,true],["consumed_at","datetime",null,false]], indexes: [["state_hash_unique","unique",["state_hash"]],["user_id_key","key",["user_id"]]] },
  { id: "ctrader_grants", name: "cTrader Grants", columns: [["user_id","varchar",36,true],["encrypted_access_token","varchar",4096,true],["encrypted_refresh_token","varchar",4096,true],["token_expires_at","datetime",null,true],["granted_scopes","varchar",128,true],["status","varchar",48,true]], indexes: [["user_id_unique","unique",["user_id"]]] },
  // Keep the total declared varchar capacity below Appwrite's per-table limit.
  { id: "alert_preferences", name: "Alert Preferences", columns: [["user_id","varchar",36,true],["categories_json","varchar",12000,false],["assets_json","varchar",1024,false],["default_asset_mode","varchar",32,false],["updated_at","datetime",null,true]], indexes: [["user_id_unique","unique",["user_id"]]] },
  { id: "signal_records", name: "Signal Records", columns: [["user_id","varchar",36,true],["signal_key","varchar",128,true],["symbol","varchar",64,true],["asset_name","varchar",128,true],["timeframe","varchar",16,true],["granularity","integer",null,true],["digits","integer",null,true],["direction","varchar",8,true],["signal_epoch","integer",null,true],["entry","double",null,false],["stop_loss","double",null,false],["tp1","double",null,false],["tp2","double",null,false],["tp3","double",null,false],["band_mean","double",null,false],["band_deviation","double",null,false],["tp1_hit_epoch","integer",null,false],["tp2_hit_epoch","integer",null,false],["tp3_hit_epoch","integer",null,false],["sl_hit_epoch","integer",null,false],["status","varchar",24,true],["closed","boolean",null,true],["created_at","datetime",null,true]], indexes: [["user_id_key","key",["user_id"]],["symbol_key","key",["symbol"]],["signal_epoch_key","key",["signal_epoch"]]] },
  { id: "payment_submissions", name: "Payment Submissions", columns: [["user_id","varchar",36,true],["plan_code","varchar",24,true],["amount_usd","double",null,true],["currency","varchar",12,true],["transaction_reference","varchar",160,true],["status","varchar",20,true],["submitted_at","datetime",null,true],["reviewed_at","datetime",null,false],["reviewed_by","varchar",36,false],["review_note","varchar",500,false]], indexes: [["user_id_key","key",["user_id"]],["transaction_reference_unique","unique",["transaction_reference"]],["status_key","key",["status"]]] },
  { id: "financial_ledger", name: "Financial Ledger", columns: [["user_id","varchar",36,true],["entry_type","varchar",32,true],["amount","double",null,true],["currency","varchar",12,true],["reference_id","varchar",128,true],["status","varchar",24,true],["metadata_json","varchar",12000,false],["created_at","datetime",null,true]], indexes: [["user_id_key","key",["user_id"]],["reference_id_key","key",["reference_id"]]] },
  { id: "commission_records", name: "Commission Records", columns: [["user_id","varchar",36,true],["source_user_id","varchar",36,true],["commission_type","varchar",24,true],["level","integer",null,false],["amount","double",null,true],["currency","varchar",12,true],["status","varchar",24,true],["reference_id","varchar",128,true],["created_at","datetime",null,true],["paid_at","datetime",null,false]], indexes: [["user_id_key","key",["user_id"]],["source_user_id_key","key",["source_user_id"]],["reference_id_key","key",["reference_id"]]] },
  { id: "academy_progress", name: "Academy Progress", columns: [["user_id","varchar",36,true],["lesson_id","varchar",128,true],["progress","double",null,true],["completed_at","datetime",null,false],["updated_at","datetime",null,true]], indexes: [["user_id_key","key",["user_id"]],["lesson_id_key","key",["lesson_id"]]] },
];

for (const schema of tables) {
  const tablePath = `/${encodeURIComponent(schema.id)}`;
  let table;
  try { table = await request(tablePath); console.log(`Found table ${schema.id}.`); }
  catch (error) {
    if (error.status !== 404) throw error;
    try { table = await request("", "POST", { tableId: schema.id, name: schema.name, permissions: [], rowSecurity: false, enabled: true, columns: [], indexes: [] }); console.log(`Created table ${schema.id}.`); }
    catch (createError) { if (createError.status !== 409) throw createError; table = await request(tablePath); }
  }
  if ((table.$permissions || []).length) { await request(tablePath, "PUT", { name: table.name || schema.name, permissions: [], rowSecurity: false, enabled: true }); table = await request(tablePath); }
  for (const [key,type,size,required] of schema.columns) {
    let columns = await list(`${tablePath}/columns?limit=100`, "columns");
    const existing = columns.find(column => column.key === key);
    if (existing) {
      if (existing.type !== type || Boolean(existing.required) !== required || (size !== null && existing.size !== size)) throw new Error(`Schema conflict in ${schema.id}.${key}; refusing to alter an existing column.`);
      if (existing.status !== "available") await waitFor(async () => (await list(`${tablePath}/columns?limit=100`, "columns")).find(x => x.key === key && x.status === "available"), `${schema.id}.${key}`);
      continue;
    }
    const body = { key, required, array: false }; if (size !== null) body.size = size;
    await request(`${tablePath}/columns/${type}`, "POST", body);
    await waitFor(async () => { columns = await list(`${tablePath}/columns?limit=100`, "columns"); return columns.find(x => x.key === key && x.status === "available"); }, `${schema.id}.${key}`);
    console.log(`Added ${schema.id}.${key}`);
  }
  for (const [key,type,columns] of schema.indexes) {
    let indexes = await list(`${tablePath}/indexes?limit=100`, "indexes"); const existing = indexes.find(index => index.key === key);
    if (existing) {
      if (existing.type !== type || JSON.stringify(existing.attributes || []) !== JSON.stringify(columns)) throw new Error(`Index conflict in ${schema.id}.${key}; refusing to replace it.`);
      if (existing.status !== "available") await waitFor(async () => (await list(`${tablePath}/indexes?limit=100`, "indexes")).find(x => x.key === key && x.status === "available"), `${schema.id} index ${key}`);
      continue;
    }
    await request(`${tablePath}/indexes`, "POST", { key, type, columns });
    await waitFor(async () => { indexes = await list(`${tablePath}/indexes?limit=100`, "indexes"); return indexes.find(x => x.key === key && x.status === "available"); }, `${schema.id} index ${key}`);
    console.log(`Added index ${schema.id}.${key}`);
  }
  const verified = await request(tablePath);
  if ((verified.$permissions || []).length || verified.rowSecurity !== false) throw new Error(`Table ${schema.id} is not private to server-side access.`);
  console.log(`Verified private table ${schema.id}.`);
}
console.log("SUCCESS: all independent Appwrite service tables are provisioned and private.");
