import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workerPath = path.join(root, 'workers/independent-api/src/index.ts');
const configPath = path.join(root, 'workers/independent-api/wrangler.toml');
const worker = fs.readFileSync(workerPath, 'utf8');
const config = fs.readFileSync(configPath, 'utf8');
const failures = [];

for (const [label, condition] of [
  ['Appwrite JWT validation', worker.includes('X-Appwrite-JWT')],
  ['server API key is read from secret binding', worker.includes('APPWRITE_API_KEY')],
  ['profile row ID is derived from verified account', worker.includes('const rowId = account.$id')],
  ['profile ownership is checked', worker.includes('row.user_id !== account.$id')],
  ['row read permission is member-scoped', worker.includes('read("user:')],
  ['row update permission is member-scoped', worker.includes('update("user:')],
  ['only display name is accepted from profile payload', worker.includes('typeof body.displayName !== "string"')],
  ['unknown routes are rejected', worker.includes('error: "not_found"')],
  ['cTrader OAuth start requires a verified Appwrite account', worker.includes('startCTraderOAuth(env as BrokerEnv, account')],
  ['cTrader OAuth state is hashed', worker.includes('state_hash: await sha256(state)')],
  ['cTrader OAuth state expires', worker.includes('Date.now() + 10 * 60_000')],
  ['cTrader tokens are AES-GCM encrypted before storage', worker.includes('AES-GCM') && worker.includes('encrypted_access_token: access')],
  ['cTrader OAuth callback consumes state before token exchange', worker.indexOf('appwriteRow(env, CTRADER_OAUTH_STATES_TABLE_ID') < worker.indexOf('https://openapi.ctrader.com/apps/token')],
  ['broker execution remains disabled by capability response', worker.includes('executionEnabled: false')],
  ['broker POST routes are allowed by CORS', worker.includes('GET, POST, PATCH, OPTIONS')],
  ['allowed origin is configured', config.includes('ALLOWED_ORIGIN = "https://supertechai.pages.dev"')],
  ['API key is not hard-coded in Wrangler vars', !/^APPWRITE_API_KEY\\s*=/m.test(config)],
  ['legacy Worker is not targeted', config.includes('name = "supertechai-independent-api"') && !config.includes('name = "supertechai-api"')],
]) {
  if (!condition) failures.push(label);
}

if (failures.length) {
  console.error('Independent Worker contract check failed:');
  failures.forEach((failure) => console.error('- ' + failure));
  process.exit(1);
}

console.log('Independent Worker contract check passed.');
