# Options Trader persistence and reservation contract

This contract applies independently to the Supabase and Appwrite editions. It is a release gate, not evidence that either backend is already configured.

## Non-negotiable invariants

1. The backend that requested a Deriv quote stores the complete proposal snapshot before returning it as eligible for later execution.
2. The server derives the member ID from the authenticated invocation. Never accept a member ID as authority from the request body.
3. A proposal is bound to one member, Deriv account, account mode, symbol, contract kind, stake, currency, barrier, duration and expiry.
4. One proposal may be reserved at most once. One signal + account + contract kind may be reserved at most once for its idempotency key.
5. The uniqueness checks and reservation insert happen in one database transaction or an equivalent atomic conditional write. A read-then-insert sequence is not sufficient.
6. A successful reservation and its first event are committed together before any network call to Deriv's buy endpoint.
7. A timeout after a buy request is UNKNOWN, never an automatic retry. Reconciliation must query Deriv using the original request/contract identity before any further action.
8. Event history is append-only. State changes must be validated against the transition graph and recorded with the state update.
9. The browser is a presentation layer only. It cannot create trusted proposal snapshots, reserve executions, change broker states, or settle trades.
10. If a backend cannot prove atomicity, it returns a safe unavailable error and does not call Deriv.

## Required server operations

### Save proposal snapshot

Input: authenticated member context, verified Deriv account context, quote response received directly from Deriv, stake and the server-generated signal snapshot.

Server checks:
- grant belongs to the authenticated member and is not expired;
- selected Deriv account is active and its account type matches the requested demo/real mode;
- quote response contains a valid proposal ID, symbol, supported contract type, positive finite ask price/payout/spot, expected barrier and 30-minute duration;
- quote expiry is in the future and stake is within server-configured limits.

Persist the normalized snapshot and broker response. Use a unique (account_id, proposal_id) constraint. Return only a safe client representation and the opaque snapshot ID.

### Reserve execution

This operation remains unavailable until the release gates below pass.

Within one atomic transaction:
1. Lock or conditionally consume the proposal snapshot for the authenticated member.
2. Re-check member, account, account mode, expiry, stake, contract type and signal binding against server-owned settings and the current Deriv account.
3. Insert the execution row with status RESERVED and its stable idempotency key. Enforce unique proposal reference and unique idempotency key in the database.
4. Insert the matching RESERVED event.
5. Commit.

If either uniqueness constraint conflicts, return the existing execution safely as a duplicate; do not send another buy request. If any other part fails, roll back the whole transaction.

Only after commit may the server move the record to BUY_SENT and make one broker request. Persist the request attempt before sending. A process crash or ambiguous network result must be reconciled, not retried blindly.

### Reconcile and settle

- Query Deriv for executions in BUY_SENT, UNKNOWN or OPEN using broker-supported identifiers.
- A found contract updates the record and appends an event in one transaction.
- A confirmed rejection becomes REJECTED.
- An open contract remains OPEN.
- A broker-confirmed settlement becomes WON, LOST or SOLD, with payout/P&L and settlement timestamp.
- A missing/ambiguous broker response remains UNKNOWN; absence from one response is not proof that no purchase occurred.
- Terminal states cannot be reopened or overwritten.

## Supabase implementation requirements

- Use a reviewed migration created with the Supabase CLI in an isolated test project/branch. The SQL blueprint in docs/sql/options_trader_ledger.sql is not an applied migration.
- Implement reservation as a PostgreSQL function/RPC with a transaction, row lock or conditional update of the proposal, unique constraints for proposal and idempotency key, and event insertion in the same transaction.
- Execute the RPC only from a server-side Edge Function using the service role. Never expose service-role credentials to the browser.
- Return a typed duplicate result on unique conflicts. Do not treat unrelated database errors as duplicates.
- Add integration tests against a disposable database, including concurrent calls racing for the same proposal and same idempotency key.

## Appwrite implementation requirements

- Create the tables and indexes in the Appwrite edition's own database. Keep permissions server-only for grants, proposal snapshots, execution rows and events.
- Use an Appwrite-supported transaction or atomic conditional write that guarantees both proposal consumption and idempotency uniqueness. Confirm the exact API behavior against the deployed TablesDB version before implementation.
- If the transaction API cannot atomically enforce both unique constraints, keep execution disabled. Do not substitute sequential getRow then createRow checks.
- Add integration tests that issue concurrent reservation calls and prove only one can succeed.
- Never read or write Supabase as a fallback.

## Release gates

The purchase endpoint and automation must remain disabled until all are evidenced independently for each edition:

- [ ] reviewed schema, indexes, permissions and migration/deployment record;
- [ ] durable proposal snapshot persistence and expiry enforcement;
- [ ] atomic reservation and concurrent duplicate-race tests;
- [ ] append-only event journal and legal transition enforcement;
- [ ] timeout-to-UNKNOWN recovery with broker reconciliation;
- [ ] Demo OAuth, quote, buy, open-contract monitoring and settlement end-to-end tests;
- [ ] member history reads scoped to the authenticated member;
- [ ] monitoring, alerting and safe recovery for stuck executions.

Real execution additionally requires explicit member consent and owner approval. The existing Activate/Deactivate control remains the sole automation switch. No second emergency-stop control is introduced.

## Current status

The current feature branch contains shared ledger types, lifecycle contract tests, Supabase function scaffolding, an unapplied SQL blueprint and an Appwrite settings scaffold. It does not yet contain a deployed ledger, an atomic reservation implementation, end-to-end broker tests or an enabled purchase endpoint. Production Supabase remains unchanged.
