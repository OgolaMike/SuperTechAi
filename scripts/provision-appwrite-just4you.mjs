#!/usr/bin/env node
/**
 * Idempotently provisions the private Appwrite Just 4 You draw table.
 * Existing rows are never deleted or rewritten.
 */
const endpoint = (process.env.APPWRITE_ENDPOINT || "https://fra.cloud.appwrite.io/v1").replace(/\/$/, "");
const projectId = process.env.APPWRITE_PROJECT_ID || "6b06de46003dde834eb6";
const databaseId = process.env.APPWRITE_DATABASE_ID || "6b06e4d900325c304d98";
const tableId = process.env.JUST4YOU_DRAWS_TABLE_ID || "just4you_draws";
const apiKey = process.env.APPWRITE_API_KEY;
if (!apiKey) throw new Error("Missing APPWRITE_API_KEY.");
const root = endpoint + "/tablesdb/" + encodeURIComponent(databaseId) + "/tables";
const headers = { "X-Appwrite-Project": projectId, "X-Appwrite-Key": apiKey, "Content-Type": "application/json", "X-Appwrite-Response-Format": "1.9.5" };

async function request(path, method = "GET", body) {
  const response = await fetch(root + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { /* status is enough */ }
  if (!response.ok) {
    const error = new Error("Appwrite " + method + " " + path + " failed (" + response.status + "): " + (data.message || data.type || "request_failed"));
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
    const value = await check();
    if (value) return value;
    await wait(2000);
  }
  throw new Error("Timed out waiting for " + label + ".");
}

let current;
try { current = await request("/" + encodeURIComponent(tableId)); }
catch (error) {
  if (error.status !== 404) throw error;
  try {
    current = await request("", "POST", { tableId, name: "Just 4 You Weekly Draws", permissions: [], rowSecurity: false, enabled: true, columns: [], indexes: [] });
  } catch (createError) {
    if (createError.status !== 409) throw createError;
    current = await request("/" + encodeURIComponent(tableId));
  }
}
if ((current.$permissions || []).length) {
  await request("/" + encodeURIComponent(tableId), "PUT", { name: current.name || "Just 4 You Weekly Draws", permissions: [], rowSecurity: false, enabled: true });
}

const tablePath = "/" + encodeURIComponent(tableId);
const definitions = [
  { key: "week_key", type: "varchar", size: 8, required: true },
  { key: "week_start", type: "varchar", size: 10, required: true },
  { key: "week_end", type: "varchar", size: 10, required: true },
  { key: "qualifying_sales", type: "float", required: true },
  { key: "prize_amount", type: "float", required: true },
  { key: "eligible_members", type: "integer", required: true },
  { key: "winner_user_id", type: "varchar", size: 36, required: true },
  { key: "winner_name", type: "varchar", size: 256, required: true },
  { key: "drawn_at", type: "datetime", required: true },
  { key: "drawn_by", type: "varchar", size: 36, required: true },
  { key: "status", type: "varchar", size: 16, required: true },
];
for (const definition of definitions) {
  let columns = await list(tablePath + "/columns?limit=100", "columns");
  const existing = columns.find(column => column.key === definition.key);
  if (existing) {
    if (existing.type !== definition.type || Boolean(existing.required) !== definition.required || (definition.size && existing.size !== definition.size)) {
      throw new Error("Existing " + definition.key + " column does not match; refusing to modify it.");
    }
    continue;
  }
  const body = { key: definition.key, required: definition.required, array: false };
  if (definition.size) body.size = definition.size;
  await request(tablePath + "/columns/" + definition.type, "POST", body);
  await waitFor(async () => {
    columns = await list(tablePath + "/columns?limit=100", "columns");
    const column = columns.find(item => item.key === definition.key);
    return column && column.status === "available" ? column : null;
  }, "column " + definition.key);
}
const indexes = [
  { key: "week_key_unique", type: "unique", columns: ["week_key"] },
  { key: "drawn_at_key", type: "key", columns: ["drawn_at"] },
];
for (const definition of indexes) {
  let currentIndexes = await list(tablePath + "/indexes?limit=100", "indexes");
  const existing = currentIndexes.find(index => index.key === definition.key);
  if (existing) {
    if (existing.type !== definition.type || JSON.stringify(existing.attributes || existing.columns || []) !== JSON.stringify(definition.columns)) {
      throw new Error("Existing index " + definition.key + " does not match.");
    }
    if (existing.status !== "available") await waitFor(async () => {
      currentIndexes = await list(tablePath + "/indexes?limit=100", "indexes");
      return currentIndexes.find(index => index.key === definition.key && index.status === "available");
    }, "index " + definition.key);
    continue;
  }
  await request(tablePath + "/indexes", "POST", definition);
  await waitFor(async () => {
    currentIndexes = await list(tablePath + "/indexes?limit=100", "indexes");
    return currentIndexes.find(index => index.key === definition.key && index.status === "available");
  }, "index " + definition.key);
}
const finalTable = await request(tablePath);
const finalColumns = await list(tablePath + "/columns?limit=100", "columns");
const finalIndexes = await list(tablePath + "/indexes?limit=100", "indexes");
const missingColumns = definitions.filter(def => !finalColumns.some(col => col.key === def.key && (col.type === "double" && def.type === "float" ? "float" : col.type) === def.type && col.status === "available"));
const missingIndexes = indexes.filter(def => !finalIndexes.some(index => index.key === def.key && index.type === def.type && index.status === "available"));
if (missingColumns.length || missingIndexes.length || (finalTable.$permissions || []).length) {
  throw new Error("Just 4 You schema verification failed. Missing columns: " + missingColumns.map(x => x.key).join(", ") + "; missing indexes: " + missingIndexes.map(x => x.key).join(", "));
}
console.log("SUCCESS: private just4you_draws table and unique weekly index verified.");
