# Independent Supabase and Appwrite editions

## Product decision

SuperTech AI is being prepared as two independent editions:

1. **Supabase edition** — uses its own Supabase Auth, PostgreSQL database, Edge Functions, OAuth grants and secrets.
2. **Appwrite edition** — uses its own Appwrite Auth, databases, Functions, OAuth grants and secrets.

Both editions must provide the same member experience and trading intelligence. They must not depend on one another at runtime.

## Isolation rules

- Each edition owns its own users, memberships, settings, OAuth grants, proposal snapshots, execution ledger, event history and secrets.
- A Deriv OAuth token created in one edition must never be readable or reusable in the other.
- Each edition uses a distinct Deriv OAuth client ID, redirect URI and encryption key.
- Never mirror live credentials or execution writes between the two backends.
- Shared frontend/domain code is allowed, but backend adapters and data stores remain separate.
- Do not silently fall back from one backend to the other when a request fails.
- Existing production Supabase workflows must remain unchanged while the Appwrite edition is built and verified.

## Appwrite project

- Endpoint: `https://fra.cloud.appwrite.io/v1`
- Project ID: `6b06de46003dde834eb6`
- Client module: `src/lib/appwrite.ts`
- Public browser configuration: `VITE_APPWRITE_ENDPOINT`, `VITE_APPWRITE_PROJECT_ID`

The browser module must never contain an Appwrite API key, Deriv access token, encryption key, or privileged database credential.

## Appwrite server functions

Create the following independently deployed Appwrite Functions:

| Function | Responsibility |
|---|---|
| `deriv-connect` | Authenticated member starts Deriv OAuth PKCE |
| `deriv-callback` | Validates one-time OAuth state and exchanges code |
| `deriv-status` | Returns safe account metadata after server-side token check |
| `deriv-disconnect` | Revokes/removes the member's grant |
| `deriv-options-proposal` | Validates account and obtains a 30-minute quote |
| `options-settings` | Reads/writes member's server-owned automation settings |
| `options-ledger` | Saves verified proposal snapshots, reserves idempotent executions and exposes safe history |
| `options-monitor` | Reconciles open contracts and settlement state |

Use Appwrite Function environment variables for secrets. Use the invoking member identity/JWT for authorization and a narrowly scoped server-side function key for privileged writes. Never trust a member ID supplied in the request body. Appwrite's injected `x-appwrite-user-id` and `x-appwrite-user-jwt` headers are the identity context; reject unauthenticated invocations.

Use a separate function API key scope for each function. The key must not be sent to the browser. Appwrite documents function variables and user JWT invocation in its [Function environment guide](https://appwrite.io/docs/products/functions/environment-variables) and [Function development guide](https://appwrite.io/docs/products/functions/develop).

## Appwrite collections / TablesDB

Create an isolated database and the following tables:

- `deriv_oauth_states`: hashed state, member ID, PKCE verifier, expiry, consumed timestamp.
- `deriv_oauth_grants`: member ID, encrypted access token, expiry, safe account metadata, connection status.
- `options_trader_settings`: member ID, selected account, demo/real mode, Touch/No Touch/Both, stake, activate/deactivate flag, real-consent timestamp.
- `options_proposal_snapshots`: member/account, broker proposal ID, symbol, contract type, quote price, payout, barrier, 30-minute duration, signal snapshot, expiry and consumed timestamp.
- `options_execution_ledger`: member, proposal reference, idempotency key, state, broker contract ID, price, payout, P/L and reconciliation timestamps.
- `options_execution_events`: append-only state transition and broker reconciliation journal.

Required indexes:
- unique member ID for OAuth grants and settings
- unique OAuth state hash
- unique account ID + proposal ID
- unique idempotency key
- unique proposal reference in the execution ledger
- unique broker contract ID when present
- member + status + created timestamp
- execution ID + event timestamp

Use server-only permissions for grants and execution writes. Member-facing history must expose only safe fields and must be scoped to the authenticated member. Never store access tokens in a client-readable collection.

**Atomic reservation requirement:** the backend must guarantee that one proposal and one signal/account/contract-kind combination can only be reserved once. If the chosen Appwrite TablesDB transaction/index mechanism cannot enforce both uniqueness checks atomically, the function must fail closed and must not call Deriv's buy endpoint. Do not substitute best-effort client-side checks.

## Trading safety

- The existing 30-minute contract duration and M30 Bollinger 2.5-deviation barrier remain the agreed defaults.
- A broker quote is not a trade.
- Proposal snapshots must be saved by the backend that requested the quote; browser-supplied quote IDs or barrier values are not trusted purchase authority.
- Real mode requires explicit member consent and a separately verified real account.
- A buy timeout is UNKNOWN and must be reconciled against Deriv before any retry.
- No purchase endpoint may be enabled until the persistent ledger, atomic reservation, monitoring and Demo settlement tests pass.
- Keep the existing Activate/Deactivate switch as the sole automation control. Do not add a second emergency-stop control.

## Current implementation status

- The Appwrite browser client is configured, but it is not an Options Trader backend.
- The Supabase OAuth and quote functions exist on the feature branch, but are not deployed or end-to-end verified.
- The shared execution ledger types and backend-neutral ledger contract are in the feature branch.
- The Supabase schema blueprint is in `docs/sql/options_trader_ledger.sql`; it has not been applied.
- Appwrite collections and Functions are not yet created or deployed.
- No contract purchase or automatic trading is enabled.
- Production Supabase has not been changed by this work.

## Release sequence

1. Create isolated test resources and configure each edition's secrets.
2. Create and review schema/indexes/permissions independently.
3. Test OAuth and quote workflows in each edition.
4. Test duplicate reservation races and UNKNOWN timeout recovery.
5. Complete Demo buy -> open -> settlement -> history tests.
6. Enable Demo automation only after all tests pass.
7. Require explicit member consent and owner approval before any Real execution.
