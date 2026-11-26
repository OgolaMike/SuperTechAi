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
  ['new profile rows receive member-scoped read/update permissions', worker.slice(worker.indexOf('if (method === "GET")'), worker.indexOf('if (method === "PATCH")')).includes('permissions: [`read("user:')],
  ['only display name is accepted from profile payload', worker.includes('typeof body.displayName !== "string"')],
  ['unknown routes are rejected', worker.includes('error: "not_found"')],
  ['signal history is scoped to the authenticated member', worker.includes('attribute: "user_id", values: [account.$id]')],
  ['signal history uses deterministic member-specific row IDs', worker.includes('sha256(`${account.$id}|${record.signal_key}`)')],
  ['signal history batches are bounded', worker.includes('body.records.length > 50') && worker.includes('contentLength > 64_000')],
  ['signal records enforce the ten official timeframes', worker.includes('M30: 1800, H1: 3600, H2: 7200, H3: 10800, H4: 14400, H6: 21600, H8: 28800, H12: 43200, D1: 86400, W1: 604800')],
  ['signal records remain Worker-only', worker.includes('permissions: []')],
  ['alert preferences are scoped to the authenticated member', worker.includes('ALERT_PREFERENCES_TABLE_ID') && worker.includes('row.user_id !== account.$id')],
  ['alert preference writes accept only bounded modes and assets', worker.includes('entries.length > 100') && worker.includes('modes.includes(String(mode))')],
  ['alert preferences are Worker-only', worker.includes('default_asset_mode: String(settings.defaultAssetMode)') && worker.includes('permissions: []')],
  ['signal history writes whitelist accepted columns', worker.includes('const safeRecord = {') && !worker.slice(worker.indexOf('if (url.pathname === "/api/signals" && request.method === "POST")'), worker.indexOf('if (url.pathname === "/api/profile"')).includes('...record, user_id:')],
  ['cTrader OAuth start requires a verified Appwrite account', worker.includes('startCTraderOAuth(env as BrokerEnv, account')],
  ['cTrader OAuth state is hashed', worker.includes('state_hash: await sha256(state)')],
  ['cTrader OAuth state expires', worker.includes('Date.now() + 10 * 60_000')],
  ['cTrader OAuth state rows are Worker-only', !worker.slice(worker.indexOf('async function startCTraderOAuth'), worker.indexOf('async function handleCTraderCallback')).includes('permissions:')],
  ['encrypted cTrader grants are Worker-only', !worker.slice(worker.indexOf('async function handleCTraderCallback'), worker.indexOf('export default')).includes('grantPermissions') && !worker.slice(worker.indexOf('async function handleCTraderCallback'), worker.indexOf('export default')).includes('read(\"user:') && !worker.slice(worker.indexOf('async function handleCTraderCallback'), worker.indexOf('export default')).includes('update(\"user:')],
  ['new cTrader grants have no client permissions', worker.includes('rowId: grantId, data: grantData, permissions: []')],
  ['cTrader tokens are AES-GCM encrypted before storage', worker.includes('AES-GCM') && worker.includes('encrypted_access_token: access')],
  ['cTrader callback returns members to the app without exposing tokens', worker.includes('destination.searchParams.set("ctrader", "connected")') && worker.includes('Response.redirect(destination.toString(), 302)')],
  ['cTrader OAuth state is atomically deleted before token exchange', worker.includes('appwriteRow(env, CTRADER_OAUTH_STATES_TABLE_ID, row.$id, \"DELETE\")') && worker.indexOf('appwriteRow(env, CTRADER_OAUTH_STATES_TABLE_ID, row.$id, \"DELETE\")') < worker.indexOf('https://openapi.ctrader.com/apps/token')],
  ['broker execution remains disabled by capability response', worker.includes('executionEnabled: false')],
  ['broker POST routes are allowed by CORS', worker.includes('GET, POST, PUT, PATCH, OPTIONS')],
  ['cTrader status endpoint returns no token material', worker.includes('/api/brokers/ctrader/status') && worker.includes('tokenExpiresAt: grant.token_expires_at')],
  ['cTrader token refresh decrypts the stored refresh token', worker.includes('decryptBrokerToken(grant.encrypted_refresh_token')],
  ['cTrader refresh rotates and re-encrypts tokens', worker.includes('ctrader_token_refresh_failed') && worker.includes('encryptBrokerToken(token.accessToken')],
  ['cTrader refresh clears legacy client row permissions', worker.includes('permissions: [],')],
  ['cTrader disconnect deletes only the member grant', worker.includes('/api/brokers/ctrader/disconnect') && worker.includes('method: \"DELETE\"')],
  ['cTrader disconnect does not falsely claim provider revocation', worker.includes('providerTokenRevoked: false')],
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
