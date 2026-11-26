# Appwrite Options Trader TablesDB blueprint

Status: design only. No database or table has been created by this document.

Create these tables inside the Appwrite edition's dedicated database. All rows containing broker grants, quote snapshots, execution state or events must have server-only permissions. The function must scope every read by the authenticated member ID; a server API key does not remove the need for application-level ownership checks.

## Table: deriv_oauth_grants

Row ID: authenticated member ID.

| Attribute | Type | Required | Notes |
|---|---|---:|---|
| member_id | string | yes | Must equal row ID |
| encrypted_access_token | string | yes | AES-GCM ciphertext only |
| token_expires_at | datetime | yes | Reject expired grants |
| connection_status | string | yes | connected / disconnected |
| safe_account_metadata | object | no | No access token or secrets |
| updated_at | datetime | yes | Server timestamp |

Indexes: unique member_id.

## Table: options_trader_settings

Row ID: authenticated member ID.

| Attribute | Type | Required | Notes |
|---|---|---:|---|
| member_id | string | yes | Must equal row ID |
| account_id | string | yes | Verified against Deriv |
| account_mode | string | yes | demo / real |
| contract_kind | string | yes | ONETOUCH / NOTOUCH / BOTH |
| stake | double | yes | Server minimum 0.35 and server maximum |
| automation_enabled | boolean | yes | Must remain false until release gates pass |
| real_trading_consent_at | datetime | no | Explicit member consent timestamp |
| updated_at | datetime | yes | Server timestamp |

Indexes: unique member_id.

## Table: options_proposal_snapshots

Use a generated row ID. Do not use a browser-supplied row ID.

| Attribute | Type | Required | Notes |
|---|---|---:|---|
| member_id | string | yes | Authenticated owner |
| account_id | string | yes | Verified Deriv account |
| account_mode | string | yes | demo / real |
| proposal_id | string | yes | Broker proposal identifier |
| symbol | string | yes | Verified symbol |
| contract_type | string | yes | ONETOUCH / NOTOUCH |
| currency | string | yes | Broker currency |
| stake | double | yes | Server validated |
| ask_price | double | yes | Positive finite quote |
| payout | double | yes | Positive finite quote |
| spot | double | yes | Positive finite quote |
| barrier | string | yes | Server verified barrier |
| duration_minutes | integer | yes | Exactly 30 |
| signal_snapshot | object | yes | Server-created signal context |
| broker_snapshot | object | yes | Sanitized broker response |
| created_at | datetime | yes | Server timestamp |
| expires_at | datetime | yes | Must be in future when reserved |
| consumed_at | datetime | no | Set only by atomic reservation |

Indexes: unique account_id + proposal_id; member_id + expires_at; member_id + signal identifier.

## Table: options_execution_ledger

Use a generated row ID.

| Attribute | Type | Required | Notes |
|---|---|---:|---|
| member_id | string | yes | Authenticated owner |
| proposal_record_id | string | yes | Proposal snapshot row ID |
| idempotency_key | string | yes | Stable server-generated key |
| status | string | yes | RESERVED / BUY_SENT / UNKNOWN / OPEN / WON / LOST / SOLD / REJECTED |
| broker_contract_id | string | no | Unique when present |
| buy_price | double | no | Broker confirmed |
| payout | double | no | Broker confirmed |
| profit_loss | double | no | Broker confirmed |
| broker_status | string | no | Sanitized status |
| last_reconciled_at | datetime | no | Server timestamp |
| created_at | datetime | yes | Server timestamp |
| updated_at | datetime | yes | Server timestamp |
| settled_at | datetime | no | Set only on confirmed settlement |

Indexes: unique idempotency_key; unique proposal_record_id; unique broker_contract_id where supported; member_id + status + created_at.

## Table: options_execution_events

Use a generated row ID. Never expose update/delete permissions.

| Attribute | Type | Required | Notes |
|---|---|---:|---|
| execution_id | string | yes | Execution ledger row |
| member_id | string | yes | Owner scope |
| from_status | string | no | Null for initial reservation |
| to_status | string | yes | Validated transition |
| event_type | string | yes | Server-defined event name |
| broker_message | object | no | Sanitized; never store credentials |
| created_at | datetime | yes | Server timestamp |

Indexes: execution_id + created_at; member_id + created_at.

## Atomic reservation proof required before enabling execution

The schema above is not enough by itself. The implementation must use a documented Appwrite TablesDB transaction or another supported atomic primitive to:
- conditionally mark the proposal consumed only if it is still unconsumed and unexpired;
- create the execution row while enforcing unique proposal_record_id and idempotency_key;
- create the initial RESERVED event;
- commit all three operations together.

The exact transaction API, index behavior and concurrency semantics must be verified against the Appwrite deployment/version. Add integration tests that race concurrent requests. If any part cannot be guaranteed atomically, return an unavailable error and do not call Deriv.

Do not implement reservation as a sequence of ordinary GET and POST requests. That pattern has a race window and is unsafe for financial execution.

## Permissions

- Members may not read or write OAuth grants, proposal snapshots, execution ledger rows or event rows directly from the client.
- Only the relevant server function may read/write its tables using a least-privilege function key.
- The function must still check that each row belongs to the invoking member.
- Settings may be read through an authenticated server function; never expose the function API key to the client.
- Event rows are insert-only. No update/delete path is allowed.
