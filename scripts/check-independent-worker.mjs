import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workerPath = path.join(root, 'workers/independent-api/src/index.ts');
const configPath = path.join(root, 'workers/independent-api/wrangler.toml');
const worker = fs.readFileSync(workerPath, 'utf8');
const config = fs.readFileSync(configPath, 'utf8');
const referrals = fs.readFileSync(path.join(root, 'workers/independent-api/src/referrals.ts'), 'utf8');
const memberGate = fs.readFileSync(path.join(root, 'src/components/MemberNetworkGate.tsx'), 'utf8');
const membership = fs.readFileSync(path.join(root, 'workers/independent-api/src/membership.ts'), 'utf8');
const preferences = fs.readFileSync(path.join(root, 'workers/independent-api/src/preferences.ts'), 'utf8');
const adminPanel = fs.readFileSync(path.join(root, 'src/components/AdminPanel.tsx'), 'utf8');
const independentTerminal = fs.readFileSync(path.join(root, 'src/components/IndependentTradingTerminal.tsx'), 'utf8');
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
  ['cTrader OAuth start requires a verified Appwrite account', worker.includes('startCTraderOAuth(env as BrokerEnv, account')],
  ['cTrader OAuth state is hashed', worker.includes('state_hash: await sha256(state)')],
  ['cTrader OAuth state expires', worker.includes('Date.now() + 10 * 60_000')],
  ['cTrader OAuth state rows are Worker-only', !worker.slice(worker.indexOf('async function startCTraderOAuth'), worker.indexOf('async function handleCTraderCallback')).includes('permissions:')],
  ['encrypted cTrader grants are Worker-only', !worker.slice(worker.indexOf('async function handleCTraderCallback'), worker.indexOf('export default')).includes('grantPermissions') && !worker.slice(worker.indexOf('async function handleCTraderCallback'), worker.indexOf('export default')).includes('read(\"user:') && !worker.slice(worker.indexOf('async function handleCTraderCallback'), worker.indexOf('export default')).includes('update(\"user:')],
  ['cTrader tokens are AES-GCM encrypted before storage', worker.includes('AES-GCM') && worker.includes('encrypted_access_token: access')],
  ['cTrader callback returns members to the app without exposing tokens', worker.includes('destination.searchParams.set("ctrader", "connected")') && worker.includes('Response.redirect(destination.toString(), 302)')],
  ['cTrader OAuth callback consumes state before token exchange', worker.indexOf('appwriteRow(env, CTRADER_OAUTH_STATES_TABLE_ID') < worker.indexOf('https://openapi.ctrader.com/apps/token')],
  ['broker execution remains disabled by capability response', worker.includes('executionEnabled: false')],
  ['broker POST routes are allowed by CORS', worker.includes('GET, POST, PATCH, OPTIONS')],
  ['cTrader status endpoint returns no token material', worker.includes('/api/brokers/ctrader/status') && worker.includes('tokenExpiresAt: grant.token_expires_at')],
  ['cTrader token refresh decrypts the stored refresh token', worker.includes('decryptBrokerToken(grant.encrypted_refresh_token')],
  ['cTrader refresh rotates and re-encrypts tokens', worker.includes('ctrader_token_refresh_failed') && worker.includes('encryptBrokerToken(token.accessToken')],
  ['cTrader refresh clears legacy client row permissions', worker.includes('permissions: [],')],
  ['cTrader disconnect deletes only the member grant', worker.includes('/api/brokers/ctrader/disconnect') && worker.includes('method: \"DELETE\"')],
  ['cTrader disconnect does not falsely claim provider revocation', worker.includes('providerTokenRevoked: false')],
  ['allowed origin is configured', config.includes('ALLOWED_ORIGIN = "https://main.supertechai.pages.dev"')],
  ['API key is not hard-coded in Wrangler vars', !/^APPWRITE_API_KEY\\s*=/m.test(config)],
  ['legacy Worker is not targeted', config.includes('name = "supertechai-independent-api"') && !config.includes('name = "supertechai-api"')],

  ['Appwrite member network table is configured', config.includes('MEMBER_NETWORK_TABLE_ID = "member_network"')],
  ['member network API requires verified Appwrite identity', worker.includes('handleReferralRequest(request, env, account)')],
  ['referral codes are generated with cryptographic randomness', referrals.includes('crypto.getRandomValues(new Uint8Array(18))')],
  ['referral activation rejects invalid codes', referrals.includes('valid_upline_required') && referrals.includes('invalid_upline')],
  ['team attribution is inherited from the sponsor', referrals.includes('team_owner_id: sponsor.team_owner_id')],
  ['owner teams can only be created through Genesis authorization', referrals.includes('x-genesis-token') && referrals.includes('GENESIS_ADMIN_TOKEN')],
  ['owner onboarding checks Appwrite email verification', referrals.includes('user.emailVerification')],
  ['unassigned approved members are held at the app gate', memberGate.includes('getMemberReferralProfile') && memberGate.includes('setTeamAssigned(profile.assigned)') && memberGate.includes('teamAssigned === false')],
  ['referral links use opaque codes rather than Appwrite user IDs', referrals.includes('referral_code: code()') && !referrals.includes('referral_code: account.$id')],
  ['new member membership defaults to pending', membership.includes('status: "pending"') && membership.includes('ensureMembership')],
  ['all non-approved membership statuses are blocked before access', memberGate.includes('getMembershipStatus') && memberGate.includes("membership.status !== 'approved'")],
  ['membership admin actions require the Genesis account', membership.includes('account.$id === env.GENESIS_ACCOUNT_ID') && membership.includes('company_admin_required')],
  ['membership approval supports free and both paid tiers', membership.includes('standard_300') && membership.includes('automation_500') && membership.includes('planCode')],
  ['membership records remain server-owned', membership.includes('permissions: []')],
  ['admin UI uses independent membership endpoints', adminPanel.includes('listAdminMembers') && adminPanel.includes('reviewMembership')],
  ['broker automation APIs require approved Premium membership', worker.includes('hasAutomationEntitlement(env, account)') && membership.includes('row.plan_code === "automation_500"')],
  ['alert preference route requires authenticated Appwrite identity', worker.includes('handleAlertPreferences(request, env, account)')],
  ['alert preferences are stored in the private Appwrite table', preferences.includes('permissions: []') && preferences.includes('ALERT_PREFERENCES_TABLE_ID')],
  ['alert preference rows are scoped to the authenticated account', preferences.includes('row.user_id !== account.$id') && preferences.includes('user_id: account.$id')],
  ['alert preference input is size-limited and validated', preferences.includes('categoriesJson.length > 12000') && preferences.includes('assetsJson.length > 1024')],
  ['alert preferences support read and update only', preferences.includes('["GET", "PATCH"]')],
  ['alert preferences table is configured in Worker vars', config.includes('ALERT_PREFERENCES_TABLE_ID = "alert_preferences"')],
  ['independent terminal hydrates alert preferences from Appwrite', independentTerminal.includes('getIndependentAlertPreferences()')],
  ['independent terminal persists alert preference changes to Appwrite', independentTerminal.includes('updateIndependentAlertPreferences({') && independentTerminal.includes("supertech-alert-controls-changed")],
]) {
  if (!condition) failures.push(label);
}

if (failures.length) {
  console.error('Independent Worker contract check failed:');
  failures.forEach((failure) => console.error('- ' + failure));
  process.exit(1);
}

console.log('Independent Worker contract check passed.');
