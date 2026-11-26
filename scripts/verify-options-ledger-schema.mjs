import fs from "node:fs";
import assert from "node:assert/strict";

const appwrite = JSON.parse(fs.readFileSync("appwrite/schema/options-trader.tables.json", "utf8"));
const sql = fs.readFileSync("supabase/migrations/20261126150000_add_options_trader_ledger.sql", "utf8");
const required = ["options_trader_settings", "options_proposal_snapshots", "options_execution_ledger", "options_execution_events"];

assert.equal(appwrite.edition, "appwrite");
assert.deepEqual(appwrite.security.clientPermissions, []);
for (const name of required) {
  const table = appwrite.tables.find((item) => item.name === name);
  assert.ok(table, `Appwrite table missing: ${name}`);
  assert.equal(table.rowSecurity, true, `${name} must enable row security`);
  assert.deepEqual(table.clientPermissions, [], `${name} must not grant client permissions`);
  assert.ok(Array.isArray(table.columns) && table.columns.length > 0, `${name} needs columns`);
}
for (const marker of [
  "enable row level security",
  "revoke all",
  "options_proposal_snapshots",
  "options_execution_ledger",
  "options_execution_events",
  "unique"
]) assert.ok(sql.toLowerCase().includes(marker), `Supabase migration missing security/schema marker: ${marker}`);
assert.ok(sql.includes("grant select, insert, update on public.options_execution_ledger to service_role"));
console.log("Options Trader schema contract passed for Supabase and Appwrite. No backend was provisioned or modified.");
