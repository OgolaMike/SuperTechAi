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
  ['AI routes authenticate Appwrite members', worker.includes('url.pathname.startsWith("/api/ai/")') && worker.includes('authenticate(request, env)')],
  ['AI profile and history use server-only Appwrite tables', worker.includes('AI_PROFILES_TABLE_ID') && worker.includes('AI_CHAT_HISTORY_TABLE_ID') && worker.includes('permissions: []')],
  ['AI history is member-scoped', worker.includes('column: "user_id", values: [account.$id]') && worker.includes('row.user_id === account.$id')],
  ['AI memory requires explicit opt-in', worker.includes('profile?.memory_opt_in === true') && worker.includes('memoryOptIn')],
  ['AI memory opt-out clears saved history', worker.includes('if (!body.memoryOptIn && configured.AI_CHAT_HISTORY_TABLE_ID)')],
  ['AI model key is read from Worker secret binding', worker.includes('OPENAI_API_KEY') && !/^OPENAI_API_KEY\\s*=/m.test(config)],
  ['AI Companion uses configured model with safe default', worker.includes('PERSONAL_AI_MODEL || "gpt-4.1-mini"')],
  ['AI routes never claim broker execution', worker.includes('It does not place trades') && worker.includes('Never claim to place trades')],
  ['strategy outcome history requires Appwrite server-side table configuration', worker.includes('STRATEGY_OUTCOME_EVENTS_TABLE_ID') && worker.includes('strategy_outcome_storage_not_configured')],
  ['strategy outcome history is scoped to the verified member', worker.includes('column: "user_id", values: [account.$id]') && worker.includes('row.user_id === account.$id')],
  ['strategy outcome event IDs are deterministic and member-specific', worker.includes('sha256(account.$id + "|" + eventKey)')],
  ['strategy outcome lifecycle events are append-only', worker.includes('strategy_outcome_idempotency_check_failed') && !worker.slice(worker.indexOf('url.pathname === "/api/strategy-outcomes"'), worker.indexOf('url.pathname === "/api/signals"')).includes('method: "PATCH"')],
  ['strategy outcome batches and payloads are bounded', worker.includes('body.events.length > 50') && worker.includes('payloadJson.length > 8_000')],
  ['strategy outcome rows are Worker-only', worker.includes('status: item.status,') && worker.includes('permissions: []')],
  ['signal history is scoped to the authenticated member', worker.includes('column: "user_id", values: [account.$id]')],
  ['signal history uses deterministic member-specific row IDs', worker.includes('sha256(`${account.$id}|${record.signal_key}`)')],
  ['signal history batches are bounded', worker.includes('body.records.length > 50') && worker.includes('contentLength > 64_000')],
  ['signal records enforce the ten official timeframes', worker.includes('M30: 1800, H1: 3600, H2: 7200, H3: 10800, H4: 14400, H6: 21600, H8: 28800, H12: 43200, D1: 86400, W1: 604800')],
  ['signal records remain Worker-only', worker.includes('permissions: []')],
  ['alert preferences are scoped to the authenticated member', worker.includes('ALERT_PREFERENCES_TABLE_ID') && worker.includes('row.user_id !== account.$id')],
  ['missing alert preference rows preserve local choices', worker.includes('exists: false') && worker.includes('exists: true')],
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
  ['Binance Spot connection requires verified Appwrite identity', worker.includes('/api/brokers/binance-spot/connect') && worker.includes('authenticate(request, env)')],
  ['Binance Spot API credentials are verified with signed account request', worker.includes('binanceSpotAccount(apiKey, apiSecret)') && worker.includes('X-MBX-APIKEY')],
  ['Binance Spot withdrawal permission must remain disabled', worker.includes('data.canWithdraw !== false')],
  ['Binance Spot credentials are encrypted before Appwrite storage', worker.includes('encrypted_api_key: encryptedKey') && worker.includes('encrypted_api_secret: encryptedSecret') && worker.includes('encryptBrokerToken(apiKey')],
  ['Binance Spot credential rows are Worker-only', worker.includes('api_key_last4: apiKey.slice(-4)') && worker.includes('permissions: []')],
  ['Binance Spot status never returns credential ciphertext', worker.includes('/api/brokers/binance-spot/status') && worker.includes('apiKeyLast4: row.api_key_last4')],
  ['Binance Spot disconnect deletes only the authenticated member row', worker.includes('/api/brokers/binance-spot/disconnect') && worker.includes('binanceSpotRow(configured, account.$id, "DELETE")')],
  ['Binance Spot order execution remains disabled', worker.includes('binance_spot: Boolean(configured.BINANCE_SPOT_CREDENTIALS_TABLE_ID') && worker.includes('executionEnabled: false')],
  ['Binance Futures connection requires authenticated member identity', worker.includes('/api/brokers/binance-futures/connect') && worker.includes('authenticate(request, env)')],
  ['Binance Futures account verification uses signed USD-M endpoint', worker.includes('https://fapi.binance.com/fapi/v3/account?') && worker.includes('binanceFuturesAccount(apiKey, apiSecret)')],
  ['Binance Futures connection requires withdrawals disabled', worker.includes('data.canWithdraw !== false')],
  ['Binance Futures credentials are encrypted before Appwrite storage', worker.includes('provider: "binance_futures"') && worker.includes('encrypted_api_secret: encryptedSecret')],
  ['Binance Futures status and disconnect are member-scoped', worker.includes('/api/brokers/binance-futures/status') && worker.includes('/api/brokers/binance-futures/disconnect') && worker.includes('binance_futures_ownership_mismatch')],
  ['Binance Futures order execution remains disabled', worker.includes('binance_futures: Boolean(configured.BINANCE_FUTURES_CREDENTIALS_TABLE_ID') && worker.includes('executionEnabled: false')],
  ['broker execution remains disabled by capability response', worker.includes('executionEnabled: false')],
  ['broker and AI methods are allowed by CORS', worker.includes('GET, POST, PUT, PATCH, DELETE, OPTIONS')],
  ['CORS supports an explicit allowlist of preview and production origins', worker.includes('allowedOrigin.split(",")')],
  ['cTrader status endpoint returns no token material', worker.includes('/api/brokers/ctrader/status') && worker.includes('tokenExpiresAt: grant.token_expires_at')],
  ['cTrader discovery uses outbound JSON WebSocket on port 5036', worker.includes('new WebSocket(`wss://${host}:5036`)')],
  ['cTrader discovery follows official application and account-list message IDs', worker.includes('sendCTraderJsonMessage(socket, 2100') && worker.includes('sendCTraderJsonMessage(socket, 2149')],
  ['cTrader account selection verifies account authorization before storing selection', worker.includes('sendCTraderJsonMessage(socket, 2102') && worker.includes('selected_account_id: accountId')],
  ['cTrader account discovery remains non-executing', worker.includes('tradingEnabled: false') && !worker.includes('/api/brokers/ctrader/place-order')],
  ['cTrader token refresh decrypts the stored refresh token', worker.includes('decryptBrokerToken(grant.encrypted_refresh_token')],
  ['cTrader refresh rotates and re-encrypts tokens', worker.includes('ctrader_token_refresh_failed') && worker.includes('encryptBrokerToken(token.accessToken')],
  ['cTrader refresh clears legacy client row permissions', worker.includes('permissions: [],')],
  ['cTrader disconnect deletes only the member grant', worker.includes('/api/brokers/ctrader/disconnect') && worker.includes('method: \"DELETE\"')],
  ['cTrader disconnect does not falsely claim provider revocation', worker.includes('providerTokenRevoked: false')],
  ['Deriv OAuth uses Authorization Code with PKCE', worker.includes('code_challenge_method: "S256"') && worker.includes('https://auth.deriv.com/oauth2/token')],
  ['Deriv OAuth state is hashed and expires', worker.includes('state_hash: await sha256(state)') && worker.includes('Date.now() + 10 * 60_000')],
  ['Deriv PKCE verifier is encrypted before Appwrite storage', worker.includes('encrypted_code_verifier: await encryptBrokerToken(verifier') && worker.includes('decryptBrokerToken(row.encrypted_code_verifier')],
  ['Deriv OAuth callback validates state before exchanging the code', worker.indexOf('const row = found.rows?.[0]') < worker.indexOf('https://auth.deriv.com/oauth2/token')],
  ['Deriv access token is encrypted before storage', worker.includes('encrypted_access_token: encrypted')],
  ['Deriv account selection is restricted to the authenticated member account list', worker.includes('deriv_account_not_authorized') && worker.includes('selected_account_id: accountId')],
  ['Deriv disconnect deletes only the authenticated member grant', worker.includes('derivRow(configured, configured.DERIV_GRANTS_TABLE_ID, grantId, "DELETE")')],
  ['Deriv account connection does not enable contract execution', worker.includes('deriv_options: Boolean(configured.DERIV_CLIENT_ID') && worker.includes('executionEnabled: false')],
  ['production and AI preview origins are explicitly allowed', config.includes('ALLOWED_ORIGIN = "https://main.supertechai.pages.dev,https://feat-appwrite-ai-companion.supertechai.pages.dev"')],
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
