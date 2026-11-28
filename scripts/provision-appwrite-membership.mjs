#!/usr/bin/env node
/**
 * Idempotently provisions the private membership_requests table for the
 * independent Appwrite edition. Never deletes or rewrites member data.
 */
const endpoint = (process.env.APPWRITE_ENDPOINT || "https://fra.cloud.appwrite.io/v1").replace(/\/$/, "");
const projectId = process.env.APPWRITE_PROJECT_ID || "6b06de46003dde834eb6";
const databaseId = process.env.APPWRITE_DATABASE_ID || "6b06e4d900325c304d98";
const tableId = process.env.MEMBERSHIP_TABLE_ID || "membership_requests";
const apiKey = process.env.APPWRITE_API_KEY;

if (!apiKey) throw new Error("Missing APPWRITE_API_KEY secret.");
if (!projectId || !databaseId) throw new Error("Missing Appwrite project/database configuration.");

const root = `${endpoint}/tablesdb/${encodeURIComponent(databaseId)}/tables`;
const headers = {
  "X-Appwrite-Project": projectId,
  "X-Appwrite-Key": apiKey,
  "Content-Type": "application/json",
  "X-Appwrite-Response-Format": "1.9.5",
};

async function request(path, method = "GET", body) {
  const response = await fetch(`${root}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { /* retain status-only error */ }
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
  throw new Error(`Timed out waiting for Appwrite ${label} to become ready.`);
}

let table;
try {
  table = await request(`/${encodeURIComponent(tableId)}`);
  console.log("Membership table already exists.");
} catch (error) {
  if (error.status !== 404) throw error;
  try {
    table = await request("", "POST", {
      tableId,
      name: "Membership Requests",
      permissions: [],
      rowSecurity: false,
      enabled: true,
      columns: [],
      indexes: [],
    });
    console.log("Created membership_requests table.");
  } catch (createError) {
    if (createError.status !== 409) throw createError;
    table = await request(`/${encodeURIComponent(tableId)}`);
  }
}

// Ensure the table remains private to server-side API-key access.
if (Array.isArray(table.$permissions) && table.$permissions.length > 0) {
  await request(`/${encodeURIComponent(tableId)}`, "PUT", {
    name: table.name || "Membership Requests",
    permissions: [],
    rowSecurity: false,
    enabled: true,
  });
  console.log("Removed client-facing table permissions.");
}

const tablePath = `/${encodeURIComponent(tableId)}`;
const definitions = [
  { key: "user_id", type: "varchar", size: 36, required: true },
  { key: "email", type: "varchar", size: 320, required: true },
  { key: "status", type: "varchar", size: 16, required: true },
  { key: "plan_code", type: "varchar", size: 24, required: true },
  { key: "created_at", type: "datetime", required: true },
  { key: "updated_at", type: "datetime", required: true },
  { key: "reviewed_at", type: "datetime", required: false },
  { key: "reviewed_by", type: "varchar", size: 36, required: false },
  { key: "review_note", type: "varchar", size: 500, required: false },
];

for (const definition of definitions) {
  let columns = await list(`${tablePath}/columns?limit=100`, "columns");
  const existing = columns.find(column => column.key === definition.key);
  if (existing) {
    const valid = existing.type === definition.type &&
      Boolean(existing.required) === definition.required &&
      (definition.size === undefined || existing.size === definition.size);
    if (!valid) throw new Error(`Existing column ${definition.key} does not match the required schema; refusing to alter existing data.`);
    continue;
  }
  const body = { key: definition.key, required: definition.required, array: false };
  if (definition.size !== undefined) body.size = definition.size;
  await request(`${tablePath}/columns/${definition.type}`, "POST", body);
  await waitFor(async () => {
    columns = await list(`${tablePath}/columns?limit=100`, "columns");
    const column = columns.find(item => item.key === definition.key);
    return column && column.status === "available" ? column : null;
  }, `column ${definition.key}`);
  console.log(`Created column ${definition.key}.`);
}

const indexes = [
  { key: "user_id_unique", type: "unique", columns: ["user_id"] },
  { key: "status_key", type: "key", columns: ["status"] },
  { key: "created_at_key", type: "key", columns: ["created_at"] },
];
for (const definition of indexes) {
  let current = await list(`${tablePath}/indexes?limit=100`, "indexes");
  const existing = current.find(index => index.key === definition.key);
  if (existing) {
    const same = existing.type === definition.type &&
      JSON.stringify(existing.attributes || existing.columns || []) === JSON.stringify(definition.columns);
    if (!same) throw new Error(`Existing index ${definition.key} does not match the required schema.`);
    if (existing.status !== "available") {
      await waitFor(async () => {
        current = await list(`${tablePath}/indexes?limit=100`, "indexes");
        const index = current.find(item => item.key === definition.key);
        return index?.status === "available" ? index : null;
      }, `index ${definition.key}`);
    }
    continue;
  }
  await request(`${tablePath}/indexes`, "POST", definition);
  await waitFor(async () => {
    current = await list(`${tablePath}/indexes?limit=100`, "indexes");
    const index = current.find(item => item.key === definition.key);
    return index?.status === "available" ? index : null;
  }, `index ${definition.key}`);
  console.log(`Created index ${definition.key}.`);
}

// Final read-back is the gate that must pass before the Worker is deployed.
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
  throw new Error(`Schema verification failed. Missing columns: ${missingColumns.map(x => x.key).join(", ") || "none"}; indexes: ${missingIndexes.map(x => x.key).join(", ") || "none"}.`);
}
if ((finalTable.$permissions || []).length !== 0) {
  throw new Error("Membership table is not private; refusing deployment.");
}
console.log("SUCCESS: membership_requests schema and private permissions verified.");
