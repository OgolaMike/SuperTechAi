# Deriv OAuth: Appwrite and Cloudflare setup

This guide completes the infrastructure configuration for the Deriv OAuth routes already implemented in `workers/independent-api/src/index.ts`. It does not enable trade execution.

## Fixed application values

- Worker: `supertechai-independent-api`
- Deriv client ID: `354lArYQUnmF00jAhkCu3`
- Callback URL (must also be registered in the Deriv developer application): `https://supertechai-independent-api.mikedavid45.workers.dev/api/brokers/deriv/callback`
- Appwrite endpoint: `https://fra.cloud.appwrite.io/v1`
- Appwrite project: `6b06de46003dde834eb6`
- Appwrite database: `6b06e4d900325c304d98`

## Appwrite TablesDB

In database `supertech_ai_sandbox`, the repository now includes an idempotent provisioner. From the repository root, run:

```bash
APPWRITE_API_KEY="YOUR_TEMPORARY_PROVISIONING_KEY" node scripts/provision-deriv-oauth-tables.mjs
```

Set `APPWRITE_ENDPOINT`, `APPWRITE_PROJECT_ID`, and `APPWRITE_DATABASE_ID` in your shell only if you are targeting a different Appwrite project. The script defaults to this project's known values. It creates only the two Deriv tables below, preserves existing tables and rows, verifies row security and empty table-level permissions, and stops if an existing column has an unexpected type. It is safe to rerun.

Use a temporary provisioning API key with database/table/column/index read and write scopes. Do not use the key in the browser. After provisioning, revoke that temporary key if it is no longer needed. The Worker must use a separate, narrowly scoped runtime key for row operations; do not give the Worker schema-management scopes.

The script uses fixed table IDs, so configure these exact values in Cloudflare after it succeeds:
- `DERIV_OAUTH_STATES_TABLE_ID=deriv_oauth_states`
- `DERIV_GRANTS_TABLE_ID=deriv_account_grants`

If you prefer manual setup, the required schemas are below.

### Table: `deriv_oauth_states`

| Column | Type | Required |
|---|---|---|
| `state_hash` | string, 64 chars | yes |
| `user_id` | string, 36 chars | yes |
| `encrypted_code_verifier` | string, 4096 chars | yes |
| `redirect_path` | string, 512 chars | yes |
| `expires_at` | string, 40 chars | yes |

Create a unique index on `state_hash`.

### Table: `deriv_account_grants`

| Column | Type | Required |
|---|---|---|
| `user_id` | string, 36 chars | yes |
| `encrypted_access_token` | string, 4096 chars | yes |
| `token_expires_at` | string, 40 chars | yes |
| `accounts_json` | string, 30000 chars | no |
| `selected_account_id` | string, 64 chars | no |
| `status` | string, 32 chars | yes |

Create a unique index on `user_id`.

### Security settings for both tables

- Enable row security.
- Do not grant client users read, create, update, or delete permissions.
- Only the Worker server API key may access these rows.
- The Worker writes rows with empty row permissions; do not add public permissions.
- Do not put the Appwrite API key or broker encryption key in the frontend, Pages variables, source control, or chat.

## Cloudflare Worker configuration

The non-secret Deriv client ID and callback URL are already defined in `wrangler.toml`. After creating the tables, set these two additional Worker variables to the actual Appwrite table IDs:

- `DERIV_OAUTH_STATES_TABLE_ID`
- `DERIV_GRANTS_TABLE_ID`

Set the following as Worker secrets (not ordinary vars):

- `APPWRITE_API_KEY`: Appwrite server API key with only the TablesDB row read/write/delete permissions needed for the broker tables and member profile table.
- `BROKER_TOKEN_ENCRYPTION_KEY`: base64 encoding of exactly 32 cryptographically random bytes. Reuse the existing project-wide broker encryption key if one is already securely configured; do not rotate it casually because existing encrypted broker credentials depend on it.

The Worker already expects `DERIV_CLIENT_ID`, `DERIV_REDIRECT_URI`, both table IDs, `APPWRITE_API_KEY`, and `BROKER_TOKEN_ENCRYPTION_KEY` before it reports Deriv OAuth as available.

## Verification

1. Register the exact callback URL above in the Deriv application and allow the trade scope.
2. Confirm the two Appwrite tables, columns, unique indexes, and row-security settings.
3. Add the real table IDs as Cloudflare Worker variables and confirm the two Worker secrets exist.
4. Deploy the Worker.
5. Sign in to SuperTech AI and check `GET /api/brokers/capabilities`; `providers.deriv_options` should be `true`.
6. Test connect, callback, status, account selection, and disconnect with a test account.

OAuth connection only stores an encrypted authorization grant and lists/selects authorized accounts. Deriv Options proposal pricing, purchases, contract monitoring, and trade execution are not implemented here; execution remains disabled.
