#!/usr/bin/env node
/**
 * Idempotently provisions the private member_network TablesDB table.
 * Existing member rows are never rewritten or deleted.
 */
const endpoint = (process.env.APPWRITE_ENDPOINT || "https://fra.cloud.appwrite.io/v1").replace(/\/$/, "");
const projectId = process.env.APPWRITE_PROJECT_ID || "6b06de46003dde834eb6";
const databaseId = process.env.APPWRITE_DATABASE_ID || "6b06e4d900325c304d98";
const tableId = process.env.MEMBER_NETWORK_TABLE_ID || "member_network";
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
  try { data = raw ? JSON.parse(raw) : {}; } catch { /* status-only error */ }
  if (!response.ok) {
    const error = new Error(`Appwrite ${method} ${path} failed (${response.status}): ${data.message || data.type || "request_failed"}`);
    error.status = response.status;
    throw error;
  }
  return data;
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function list(path, key) {
  const result = await request(path);
  return Array.isArray(result[key]) ? result[key] : [];
}
async function waitFor(check, label) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const result = await check();
    if (result) return result;
    await wait(2000);
  }
  throw new Error(`Timed out waiting for Appwrite ${label}.`);
}

let table;
const tablePath = `/${encodeURIComponent(tableId)}`;
try {
  table = await request(tablePath);
  console.log("member_network table already exists.");
} catch (error) {
  if (error.status !== 404) throw error;
  try {
    table = await request("", "POST", {
      tableId,
      name: "Member Network",
      permissions: [],
      rowSecurity: true,
      enabled: true,
      columns: [],
      indexes: [],
    });
    console.log("Created member_network table.");
  } catch (createError) {
    if (createError.status !== 409) throw createError;
    table = await request(tablePath);
  }
}

// The table must remain private; do not relax row security or add client grants.
if (table.rowSecurity !== true || (table.$permissions || []).length !== 0) {
  await request(tablePath, "PUT", {
    name: table.name || "Member Network",
    permissions: [],
    rowSecurity: true,
    enabled: true,
  });
}

const definitions = [
  { key: "row_type", type: "varchar", size: 16, required: true },
  { key: "user_id", type: "varchar", size: 36, required: true },
  { key: "email", type: "varchar", size: 320, required: true },
  { key: "referral_code", type: "varchar", size: 36, required: true },
  { key: "sponsor_user_id", type: "varchar", size: 36, required: true },
  { key: "team_owner_id", type: "varchar", size: 36, required: true },
  { key: "role", type: "varchar", size: 16, required: true },
  { key: "status", type: "varchar", size: 16, required: true },
  { key: "created_at", type: "datetime", required: true },
];
for (const definition of definitions) {
  let columns = await list(`${tablePath}/columns?limit=100`, "columns");
  const existing = columns.find(column => column.key === definition.key);
  if (existing) {
    const valid = existing.type === definition.type &&
      Boolean(existing.required) === definition.required &&
      (definition.size === undefined || existing.size === definition.size);
    if (!valid) throw new Error(`Existing ${definition.key} column conflicts with the required network schema; refusing data changes.`);
    continue;
  }
  const body = { key: definition.key, required: definition.required, array: false };
  if (definition.size !== undefined) body.size = definition.size;
  await request(`${tablePath}/columns/${definition.type}`, "POST", body);
  await waitFor(async () => {
    columns = await list(`${tablePath}/columns?limit=100`, "columns");
    const column = columns.find(item => item.key === definition.key);
    return column?.status === "available" ? column : null;
  }, `column ${definition.key}`);
  console.log(`Created column ${definition.key}.`);
}
const indexes = [
  { key: "user_id_unique", type: "unique", columns: ["user_id"] },
  { key: "referral_code_unique", type: "unique", columns: ["referral_code"] },
  { key: "team_owner_id_key", type: "key", columns: ["team_owner_id"] },
  { key: "sponsor_user_id_key", type: "key", columns: ["sponsor_user_id"] },
  { key: "status_key", type: "key", columns: ["status"] },
];
for (const definition of indexes) {
  let current = await list(`${tablePath}/indexes?limit=100`, "indexes");
  const existing = current.find(index => index.key === definition.key);
  if (existing) {
    const attrs = existing.attributes || existing.columns || [];
    if (existing.type !== definition.type || JSON.stringify(attrs) !== JSON.stringify(definition.columns)) {
      throw new Error(`Existing ${definition.key} index conflicts with the required network schema.`);
    }
    if (existing.status !== "available") {
      await waitFor(async () => {
        current = await list(`${tablePath}/indexes?limit=100`, "indexes");
        return current.find(item => item.key === definition.key && item.status === "available") || null;
      }, `index ${definition.key}`);
    }
    continue;
  }
  await request(`${tablePath}/indexes`, "POST", definition);
  await waitFor(async () => {
    current = await list(`${tablePath}/indexes?limit=100`, "indexes");
    return current.find(item => item.key === definition.key && item.status === "available") || null;
  }, `index ${definition.key}`);
  console.log(`Created index ${definition.key}.`);
}
const finalTable = await request(tablePath);
const finalColumns = await list(`${tablePath}/columns?limit=100`, "columns");
const finalIndexes = await list(`${tablePath}/indexes?limit=100`, "indexes");
const missingColumns = definitions.filter(definition => !finalColumns.some(column =>
  column.key === definition.key && column.type === definition.type &&
  Boolean(column.required) === definition.required &&
  (definition.size === undefined || column.size === definition.size) &&
  column.status === "available"
));
const missingIndexes = indexes.filter(definition => !finalIndexes.some(index =>
  index.key === definition.key && index.type === definition.type && index.status === "available"
));
if (missingColumns.length || missingIndexes.length) {
  throw new Error(`Network schema verification failed. Missing columns: ${missingColumns.map(x => x.key).join(", ") || "none"}; indexes: ${missingIndexes.map(x => x.key).join(", ") || "none"}.`);
}
if (finalTable.rowSecurity !== true || (finalTable.$permissions || []).length !== 0) {
  throw new Error("member_network must retain row security and empty client permissions.");
}
console.log("SUCCESS: member_network schema, indexes and private permissions verified.");
