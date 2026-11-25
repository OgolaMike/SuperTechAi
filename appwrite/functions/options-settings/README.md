# Appwrite Options Settings Function

Function ID suggestion: `options-settings`  
Runtime: Node.js 22 or the current supported Node LTS runtime in the Appwrite Console.

## Required TablesDB setup

Create an Appwrite database and these tables before deploying:

- OAuth grants table: row ID is the Appwrite member ID. Required columns: `encrypted_access_token`, `token_expires_at`, `connection_status`.
- Settings table: row ID is the Appwrite member ID. Required columns: `user_id`, `account_id`, `account_mode`, `contract_kind`, `stake`, `automation_enabled`, `real_trading_consent_at`, `updated_at`.

Grant no direct client write permission to either table. The function uses its ephemeral Appwrite function key for server-side access and trusts only Appwrite-injected user identity headers.

## Function variables

- `APPWRITE_DATABASE_ID`
- `DERIV_OAUTH_GRANTS_TABLE_ID`
- `OPTIONS_SETTINGS_TABLE_ID`
- `DERIV_TOKEN_ENCRYPTION_KEY` (base64-encoded 32-byte AES-GCM key)
- `OPTIONS_MAX_STAKE`

Appwrite injects `APPWRITE_FUNCTION_PROJECT_ID`, `APPWRITE_FUNCTION_API_ENDPOINT`, and the per-execution key header. Configure the function with the minimum required TablesDB read/write scopes. Never place the function key in browser variables.

## Request

Authenticated invocation only. JSON body:

- `{ "action": "get" }`
- `{ "action": "save", "accountId": "...", "accountMode": "demo", "contractKind": "BOTH", "stake": 1, "automationEnabled": false }`

The function rechecks the selected account against Deriv before saving. It always persists automation as disabled. This function does not create quotes, reserve executions or buy contracts.

## Status

Source scaffold only. The Appwrite OAuth grant table and OAuth functions must be created in this independent project before this function can work. Do not deploy until the Appwrite TablesDB schema, scopes and environment variables have been reviewed.
