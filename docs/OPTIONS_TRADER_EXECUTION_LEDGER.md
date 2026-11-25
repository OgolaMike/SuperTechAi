# Options Trader durable execution ledger

This is the persistence contract for the independent Supabase and Appwrite editions. It is deliberately backend-neutral; each edition owns its own records, keys, functions and access rules.

## Records

### Automation configuration
One server-owned record per member and edition:
- member ID, selected authorised Deriv account ID and account mode
- contract kind (Touch / No Touch / Both), stake and maximum stake policy
- Activate/Deactivate state
- explicit real-account consent timestamp (null until the member authorises real trading)
- updated timestamp and configuration version

The browser may request a change, but the backend validates the authenticated member and writes the authoritative configuration. Never trust a client-supplied account ID, account mode, stake cap or automation flag during purchase.

### Proposal snapshot
Persist each broker quote before it can be considered for execution:
- member, account and account mode
- Deriv proposal ID, symbol, contract type, currency, stake, ask price, payout, spot, relative barrier and expiry
- original broker response (sanitised; never include OAuth credentials)
- exact source signal snapshot: signal ID, direction, analysis timeframe, contributing independent strategy IDs, confluence score and completed M30 Bollinger values
- created/expiry timestamps and consumed timestamp

A quote is not an order. A proposal is eligible only while fresh and unexpired and when it still matches the current server-owned settings and signal policy.

### Execution reservation
Create this record transactionally before calling Deriv buy:
- unique idempotency key: member + account + signal + contract kind
- unique proposal reference (a proposal can only be consumed once)
- state, attempt timestamps, broker contract ID, buy price and broker status
- reconciliation timestamp and settlement fields

Enforce database UNIQUE constraints on the idempotency key and proposal reference. If reservation conflicts, do not call Deriv. Do not release a reservation just because a request timed out.

### Event journal
Append-only event rows for every transition and broker response. Include execution ID, prior/new state, event type, timestamp and sanitised broker payload. Never store access tokens or secrets in event payloads.

## State and retry rules

`RESERVED -> BUY_SENT -> OPEN -> WON | LOST | SOLD`

- A failed pre-buy validation can move to `REJECTED`.
- Any timeout or lost response after sending buy becomes `UNKNOWN`.
- `UNKNOWN` must be reconciled against Deriv portfolio/statement/open-contract data before any retry.
- Never repeat a buy based only on a browser retry, a missing response, or a websocket reconnect.
- Terminal states are immutable. Corrections require a separately audited reconciliation event, not silent edits.
- Open contracts continue to be monitored even after a member disconnects OAuth where the backend can still query the broker; otherwise retain a visible reconciliation-needed state.

## Purchase transaction boundary

The server must, in order:
1. Authenticate the member and load server-owned configuration.
2. Confirm automation is activated.
3. Confirm the selected account is still OAuth-authorised, active and matches Demo/Real mode.
4. For Real, require an explicit member consent timestamp and real account verification.
5. Load the persisted proposal and source signal; verify ownership, freshness, expiry, symbol, contract type, barrier, stake cap and account balance.
6. Recompute/validate the barrier from the persisted completed M30 strategy snapshot; never accept browser-calculated barrier as authority.
7. Insert the unique reservation and event atomically.
8. Send the buy request once using the stored proposal ID and exact authorised account.
9. Persist the broker contract ID and transition to OPEN. If the response is ambiguous, persist UNKNOWN and reconcile before any retry.

## Backend-specific storage mapping

### Supabase edition
Use private, service-role-only tables for OAuth grant and execution secrets. For member-readable trade history, expose only a safe view or narrowly scoped RLS SELECT policies that bind rows to `auth.uid()`. Keep write access server-only. Enable RLS on every exposed table. Do not expose raw broker payloads if they can contain sensitive account information.

Suggested logical tables:
- `options_trader_settings`
- `options_proposal_snapshots`
- `options_execution_ledger`
- `options_execution_events`

Use foreign keys, check constraints, unique idempotency/proposal constraints and indexes on member/status, broker contract ID and expiry. Migration must be generated through the Supabase CLI workflow and applied only to an isolated test project/branch until explicitly approved.

### Appwrite edition
Create equivalent collections in the separate Appwrite project:
- `options_trader_settings`
- `options_proposal_snapshots`
- `options_execution_ledger`
- `options_execution_events`

Use server-side Appwrite Functions with an API key held only in function secrets. Deny direct client create/update/delete on ledger collections; allow only member-scoped reads of safe history. Add unique indexes for idempotency key and proposal reference, and indexes for member/status, contract ID and expiry. If the Appwrite database cannot enforce a required unique constraint transactionally, implement a server-side atomic reservation using a transaction/unique document ID and fail closed on conflict.

The Appwrite edition must not call Supabase functions, read Supabase tokens or share a database. Use its own Deriv OAuth client, encryption key and account grant collection.

## Release gates

- Schema/indexes and access controls reviewed in both projects.
- Duplicate reservation race test passes.
- Proposal expiry, wrong-account, wrong-mode, stake-cap and inactive-automation tests pass.
- Simulated timeout results in UNKNOWN and cannot issue a second buy before reconciliation.
- Demo buy -> open -> settlement -> history end-to-end test passes.
- Only then consider enabling Demo automation. Real mode remains separately gated by explicit consent and owner release approval.
