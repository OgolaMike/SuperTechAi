/**
 * SuperTech AI — idempotent Deriv OAuth Appwrite provisioner.
 *
 * Creates only deriv_oauth_states and deriv_account_grants in the configured
 * TablesDB database. Existing tables are preserved; unsafe table permissions
 * cause a hard stop. Never deletes data or changes existing columns.
 *
 * Run from the repository root:
 *   APPWRITE_API_KEY="..." node scripts/provision-deriv-oauth-tables.mjs
 *
 * The API key must be server-only and scoped to database/table/column/index
 * management for this database. Never commit it or expose it to the browser.
 */

const endpoint = (process.env.APPWRITE_ENDPOINT || "https://fra.cloud.appwrite.io/v1").replace(/\/$/, "");
const projectId = process.env.APPWRITE_PROJECT_ID || "6b06de46003dde834eb6";
const databaseId = process.env.APPWRITE_DATABASE_ID || "6b06e4d900325c304d98";
const apiKey = process.env.APPWRITE_API_KEY;

if (!apiKey) {
  console.error("Missing APPWRITE_API_KEY. Set it in your local shell; do not paste it into source code or chat.");
  process.exit(1);
}

const headers = {
  "Content-Type": "application/json",
  "X-Appwrite-Project": projectId,
  "X-Appwrite-Key": apiKey,
};
const root = `/tablesdb/${databaseId}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(path, method = "GET", body) {
  const response = await fetch(`${endpoint}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { message: raw }; }
  if (!response.ok) {
    const error = new Error(`${method} ${path} failed (${response.status}): ${data.message || raw}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function list(path, property) {
  const result = await request(path);
  return Array.isArray(result[property]) ? result[property] : [];
}

const specs = [
  {
    id: "deriv_oauth_states",
    name: "Deriv OAuth States",
    columns: [
      { key: "state_hash", type: "varchar", size: 64, required: true },
      { key: "user_id", type: "varchar", size: 36, required: true },
      { key: "encrypted_code_verifier", type: "varchar", size: 4096, required: true },
      { key: "redirect_path", type: "varchar", size: 512, required: true },
      { key: "expires_at", type: "varchar", size: 40, required: true },
    ],
    indexes: [
      { key: "deriv_oauth_state_hash_unique", type: "unique", columns: ["state_hash"] },
    ],
  },
  {
    id: "deriv_account_grants",
    name: "Deriv Account Grants",
    columns: [
      { key: "user_id", type: "varchar", size: 36, required: true },
      { key: "encrypted_access_token", type: "varchar", size: 4096, required: true },
      { key: "token_expires_at", type: "varchar", size: 40, required: true },
      { key: "accounts_json", type: "mediumtext", required: false },
      { key: "selected_account_id", type: "varchar", size: 64, required: false },
      { key: "status", type: "varchar", size: 32, required: true },
    ],
    indexes: [
      { key: "deriv_account_user_unique", type: "unique", columns: ["user_id"] },
    ],
  },
];

async function ensureTable(spec) {
  const tables = await list(`${root}/tables?limit=100`, "tables");
  if (!tables.some((table) => table.$id === spec.id)) {
    try {
      await request(`${root}/tables`, "POST", {
        tableId: spec.id,
        name: spec.name,
        permissions: [],
        rowSecurity: true,
      });
      console.log(`Created table: ${spec.id}`);
    } catch (error) {
      if (error.status !== 409) throw error;
      console.log(`Table already exists: ${spec.id}`);
    }
  } else {
    console.log(`Preserving existing table: ${spec.id}`);
  }

  const table = await request(`${root}/tables/${spec.id}`);
  if (table.rowSecurity !== true || (table.permissions || []).length !== 0) {
    throw new Error(`SECURITY CHECK FAILED for ${spec.id}. Enable row security and remove all table-level client permissions in Appwrite, then rerun.`);
  }

  let columns = await list(`${root}/tables/${spec.id}/columns?limit=100`, "columns");
  for (const column of spec.columns) {
    const existing = columns.find((item) => item.key === column.key);
    if (existing) {
      if (existing.type !== column.type) {
        throw new Error(`Column type mismatch: ${spec.id}.${column.key} is ${existing.type}, expected ${column.type}. No changes made to that column.`);
      }
      continue;
    }
    const { key, type, size, required } = column;
    await request(`${root}/tables/${spec.id}/columns/${type}`, "POST", {
      columnId: key,
      key,
      required,
      ...(size ? { size } : {}),
    });
    console.log(`  Added column: ${key}`);
  }

  for (let attempt = 0; attempt < 45; attempt++) {
    columns = await list(`${root}/tables/${spec.id}/columns?limit=100`, "columns");
    const ready = spec.columns.every((expected) => {
      const actual = columns.find((item) => item.key === expected.key);
      return actual && actual.status === "available";
    });
    if (ready) break;
    if (attempt === 44) throw new Error(`Columns for ${spec.id} are still processing. Wait for Appwrite, then rerun.`);
    await sleep(2000);
  }

  let indexes = await list(`${root}/tables/${spec.id}/indexes?limit=100`, "indexes");
  for (const index of spec.indexes) {
    if (indexes.some((item) => item.key === index.key)) continue;
    await request(`${root}/tables/${spec.id}/indexes`, "POST", {
      indexId: index.key,
      key: index.key,
      type: index.type,
      columns: index.columns,
    });
    console.log(`  Added ${index.type} index: ${index.key}`);
  }

  for (let attempt = 0; attempt < 45; attempt++) {
    indexes = await list(`${root}/tables/${spec.id}/indexes?limit=100`, "indexes");
    const ready = spec.indexes.every((expected) => {
      const actual = indexes.find((item) => item.key === expected.key);
      return actual && actual.status === "available";
    });
    if (ready) break;
    if (attempt === 44) throw new Error(`Indexes for ${spec.id} are still processing. Wait for Appwrite, then rerun.`);
    await sleep(2000);
  }

  console.log(`Verified: ${spec.id} (row security ON; no client table permissions)`);
}

try {
  await request(`/tablesdb/${databaseId}`);
  for (const spec of specs) await ensureTable(spec);
  console.log("\nSUCCESS — Deriv OAuth tables are ready.");
  console.log("Set these Cloudflare Worker production variables:");
  console.log("DERIV_OAUTH_STATES_TABLE_ID=deriv_oauth_states");
  console.log("DERIV_GRANTS_TABLE_ID=deriv_account_grants");
} catch (error) {
  console.error("\nProvisioning stopped safely:", error.message);
  process.exit(1);
}
