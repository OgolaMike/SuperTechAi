/**
 * SuperTech AI — safe Appwrite signal-table provisioner
 *
 * Creates ONLY signal_records and super_signal_records.
 * Never deletes or alters existing tables, rows, or member data.
 *
 * Run:
 *   APPWRITE_API_KEY="..." node scripts/provision-signal-tables.mjs
 *
 * API key needs database/table/column/index read+write scopes.
 * Keep the key private; do not commit it or put it in frontend variables.
 */

const endpoint = (process.env.APPWRITE_ENDPOINT || "https://fra.cloud.appwrite.io/v1").replace(/\/$/, "");
const projectId = process.env.APPWRITE_PROJECT_ID || "6b06de46003dde834eb6";
const databaseId = process.env.APPWRITE_DATABASE_ID || "6b06e4d900325c304d98";
const apiKey = process.env.APPWRITE_API_KEY;

if (!apiKey) {
  console.error("Missing APPWRITE_API_KEY. Supply it as an environment variable; never paste it into source code.");
  process.exit(1);
}

const headers = {
  "Content-Type": "application/json",
  "X-Appwrite-Project": projectId,
  "X-Appwrite-Key": apiKey,
};

async function request(path, method = "GET", body) {
  const response = await fetch(`${endpoint}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok) {
    const error = new Error(`${method} ${path} → ${response.status}: ${data.message || text}`);
    error.code = response.status;
    throw error;
  }
  return data;
}

const root = `/tablesdb/${databaseId}`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function listAll(path) {
  const result = await request(path);
  return result.tables || result.columns || result.indexes || [];
}

async function ensureTable(spec) {
  let table;
  const tables = await listAll(`${root}/tables?limit=100`);
  table = tables.find(item => item.$id === spec.id);
  if (!table) {
    try {
      table = await request(`${root}/tables`, "POST", {
        tableId: spec.id,
        name: spec.name,
        permissions: [],
        rowSecurity: true,
      });
      console.log(`Created table ${spec.id}`);
    } catch (error) {
      if (error.code !== 409) throw error;
      table = await request(`${root}/tables/${spec.id}`);
    }
  } else {
    console.log(`Table ${spec.id} already exists; preserving it.`);
  }

  // Refuse to proceed if the table is not locked down.
  const fresh = await request(`${root}/tables/${spec.id}`);
  if (fresh.rowSecurity !== true || (fresh.permissions || []).length !== 0) {
    throw new Error(`SECURITY CHECK FAILED for ${spec.id}: enable row security and remove all client permissions manually before continuing.`);
  }

  let columns = await listAll(`${root}/tables/${spec.id}/columns?limit=100`);
  for (const column of spec.columns) {
    if (columns.some(existing => existing.key === column.key)) continue;
    const { key, type, size, required } = column;
    const body = { key, required, ...(size ? { size } : {}) };
    try {
      await request(`${root}/tables/${spec.id}/columns/${type}`, "POST", {
        ...body,
        columnId: key,
      });
      console.log(`  Added column ${key}`);
    } catch (error) {
      if (error.code !== 409) throw error;
    }
  }

  // Wait for asynchronous column creation to finish before adding indexes.
  for (let attempt = 0; attempt < 30; attempt++) {
    columns = await listAll(`${root}/tables/${spec.id}/columns?limit=100`);
    const ready = spec.columns.every(expected => {
      const actual = columns.find(item => item.key === expected.key);
      return actual && actual.status === "available";
    });
    if (ready) break;
    if (attempt === 29) throw new Error(`Columns for ${spec.id} are not all Available yet. Re-run this script after Appwrite finishes processing.`);
    await sleep(2000);
  }

  let indexes = await listAll(`${root}/tables/${spec.id}/indexes?limit=100`);
  for (const index of spec.indexes) {
    if (indexes.some(existing => existing.key === index.key)) continue;
    try {
      await request(`${root}/tables/${spec.id}/indexes`, "POST", {
        indexId: index.key,
        key: index.key,
        type: index.type,
        columns: index.columns,
      });
      console.log(`  Added index ${index.key}`);
    } catch (error) {
      if (error.code !== 409) throw error;
    }
  }
  console.log(`Verified ${spec.id}: row security ON, no client permissions.`);
}

const tables = [
  {
    id: "signal_records",
    name: "Signal Records",
    columns: [
      ["user_id","varchar",36,true],["signal_key","varchar",160,true],
      ["symbol","varchar",64,true],["asset_name","varchar",120,true],
      ["timeframe","varchar",4,true],["granularity","integer",null,true],
      ["digits","integer",null,true],["direction","varchar",4,true],
      ["signal_epoch","integer",null,true],["entry","double",null,true],
      ["stop_loss","double",null,true],["tp1","double",null,true],
      ["tp2","double",null,true],["tp3","double",null,true],
      ["band_mean","double",null,true],["band_deviation","double",null,true],
      ["tp1_hit_epoch","integer",null,false],["tp2_hit_epoch","integer",null,false],
      ["tp3_hit_epoch","integer",null,false],["sl_hit_epoch","integer",null,false],
      ["status","varchar",16,true],["closed","boolean",null,true],
      ["created_at","varchar",40,true],["updated_at","varchar",40,true],
    ].map(([key,type,size,required]) => ({key,type,size,required})),
    indexes: [
      {key:"signal_records_member_key_unique",type:"unique",columns:["user_id","signal_key"]},
      {key:"signal_records_member_epoch",type:"key",columns:["user_id","signal_epoch"]},
    ],
  },
  {
    id: "super_signal_records",
    name: "Super Signal Records",
    columns: [
      ["user_id","varchar",36,true],["signal_key","varchar",160,true],
      ["signal_epoch","integer",null,true],["payload_json","varchar",24000,true],
      ["created_at","varchar",40,true],["updated_at","varchar",40,true],
    ].map(([key,type,size,required]) => ({key,type,size,required})),
    indexes: [
      {key:"super_signal_member_key_unique",type:"unique",columns:["user_id","signal_key"]},
      {key:"super_signal_member_epoch",type:"key",columns:["user_id","signal_epoch"]},
    ],
  },
];

try {
  for (const spec of tables) await ensureTable(spec);
  console.log("\nSUCCESS: both signal tables are provisioned.");
  console.log("Set these Cloudflare Worker variables:");
  console.log("SIGNAL_RECORDS_TABLE_ID=signal_records");
  console.log("SUPER_SIGNAL_RECORDS_TABLE_ID=super_signal_records");
} catch (error) {
  console.error("\nProvisioning stopped safely:", error.message);
  process.exit(1);
}
