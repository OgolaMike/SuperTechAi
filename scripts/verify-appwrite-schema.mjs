import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "appwrite/schema/member-access.tables.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const endpoint = (process.env.APPWRITE_ENDPOINT || "").replace(/\/$/, "");
const projectId = process.env.APPWRITE_PROJECT_ID || "";
const apiKey = process.env.APPWRITE_API_KEY || "";
const databaseId = process.env.APPWRITE_DATABASE_ID || manifest.database?.id || "";
const failures = [];
const passed = [];

if (!endpoint || !projectId || !apiKey || !databaseId) {
  console.error("Missing APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY or APPWRITE_DATABASE_ID.");
  console.error("This verifier is read-only. Use a sandbox API key with database/table read scopes only.");
  process.exit(2);
}

const headers = {
  "X-Appwrite-Project": projectId,
  "X-Appwrite-Key": apiKey,
  "Content-Type": "application/json",
};

async function getJson(url, label) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    failures.push(label + ": HTTP " + response.status);
    return null;
  }
  try { return await response.json(); }
  catch {
    failures.push(label + ": invalid JSON response");
    return null;
  }
}

const base = endpoint + "/tablesdb/" + encodeURIComponent(databaseId);
const tableList = await getJson(base + "/tables?queries[]=limit(100)", "List tables");
if (!tableList) process.exit(1);
const listedTables = Array.isArray(tableList.tables) ? tableList.tables : [];
const byName = new Map(listedTables.map((table) => [table.name, table]));
const specs = [
  ...(manifest.existingTables || []),
  ...(manifest.proposedTables || []),
];

for (const spec of specs) {
  const envKey = spec.name.toUpperCase().replace(/[^A-Z0-9]+/g, "_") + "_TABLE_ID";
  const configuredId = process.env[envKey];
  const listed = byName.get(spec.name);
  const tableId = configuredId || spec.id || listed?.$id || listed?.id;
  if (!tableId) {
    failures.push(spec.name + ": table is missing");
    continue;
  }

  const table = await getJson(base + "/tables/" + encodeURIComponent(tableId), spec.name + " table");
  if (!table) continue;
  if (table.name !== spec.name) failures.push(spec.name + ": ID resolves to unexpected table " + String(table.name));
  if (table.rowSecurity !== true) failures.push(spec.name + ": row security is not enabled");
  if (Array.isArray(table.$permissions) && table.$permissions.length) {
    failures.push(spec.name + ": table has client permissions (" + table.$permissions.join(", ") + ")");
  } else if (Array.isArray(table.permissions) && table.permissions.length) {
    failures.push(spec.name + ": table has client permissions (" + table.permissions.join(", ") + ")");
  }

  const [columnResult, indexResult] = await Promise.all([
    getJson(base + "/tables/" + encodeURIComponent(tableId) + "/columns?queries[]=limit(100)", spec.name + " columns"),
    getJson(base + "/tables/" + encodeURIComponent(tableId) + "/indexes?queries[]=limit(100)", spec.name + " indexes"),
  ]);
  if (!columnResult || !indexResult) continue;
  const columns = Array.isArray(columnResult.columns) ? columnResult.columns : [];
  const indexes = Array.isArray(indexResult.indexes) ? indexResult.indexes : [];
  const expectedColumns = [...(spec.columns || []), ...(spec.pendingColumns || [])];
  const actualColumnKeys = new Set(columns.map((column) => column.key));
  for (const column of expectedColumns) {
    if (!actualColumnKeys.has(column.key)) failures.push(spec.name + ": missing column " + column.key);
  }
  const actualIndexKeys = new Set(indexes.map((index) => index.key));
  for (const index of spec.indexes || []) {
    if (!actualIndexKeys.has(index.key)) failures.push(spec.name + ": missing index " + index.key);
  }
  if (table.rowSecurity === true && !(table.$permissions || table.permissions || []).length) {
    passed.push(spec.name + ": table-level permissions are empty and row security is enabled");
  }
}

if (failures.length) {
  console.error("Appwrite schema verification FAILED (read-only; no changes made):");
  for (const failure of failures) console.error("- " + failure);
  console.error("Do not enable member data until every schema and access-control failure is resolved.");
  process.exit(1);
}

console.log("Appwrite schema verification passed for " + passed.length + " tables.");
for (const item of passed) console.log("- " + item);
