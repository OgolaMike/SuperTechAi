# Appwrite business and financial ledger foundation

This document is for the independent Appwrite edition only. It does not alter the legacy Supabase/Bolt application.

## Non-negotiable money controls

- USDT TRC20 is the only supported deposit rail in this first implementation.
- A submitted transaction hash is a claim, not proof of payment.
- A deposit is accepted only after the Worker independently verifies the USDT TRC20 transfer on Tron: successful/confirmed transaction, canonical USDT contract, exact company receiving address, exact expected amount, and a transfer not previously credited.
- A deposit, commission, or withdrawal must have a stable idempotency key. Replayed requests must return the original result and must never create a second credit.
- All money values are integer USDT micro-units (6 decimal places); never use floating point for ledger arithmetic.
- No browser may write financial tables. All writes go through the Worker with server-only Appwrite credentials.
- Never store private keys or wallet seed phrases. The company receiving wallet is public; withdrawal signing must be handled by a separate hardened signer or multisig process, not this Worker.
- Financial records are append-only. Corrections use compensating entries with references to the original entry; do not edit or delete posted ledger entries.

## Tables to create

Create the following TablesDB tables in database `6b06e4d900325c304d98`. Keep table permissions empty. Grant access only through the Worker server API key.

### 1. `membership_orders`

One row per member purchase attempt. Row ID is a generated 32-character hex ID.

| Column | Type | Required | Purpose |
|---|---|---:|---|
| user_id | string(36) | yes | Appwrite account owner |
| plan_code | string(16) | yes | `standard_300` or `automation_500` |
| expected_usdt_micros | integer | yes | 300000000 or 500000000 |
| receiving_address | string(64) | yes | Company TRON address snapshot |
| status | string(24) | yes | pending, verifying, paid, expired, rejected |
| transaction_id | string(128) | no | Submitted TRON transaction hash |
| expires_at | datetime | yes | Order expiry |
| created_at | datetime | yes | Creation time |
| paid_at | datetime | no | Verification time |

Indexes: user_id, status, transaction_id (unique when populated if supported), expires_at.

### 2. `payment_receipts`

One row per on-chain transaction. Row ID is the lowercase transaction hash, normalized and validated to a 64-character hex string.

| Column | Type | Required | Purpose |
|---|---|---:|---|
| transaction_id | string(64) | yes | Unique chain transaction |
| user_id | string(36) | yes | Member receiving membership |
| order_id | string(32) | yes | Matching order |
| from_address | string(64) | yes | Sender |
| to_address | string(64) | yes | Company receiver |
| token_contract | string(64) | yes | Canonical USDT contract |
| amount_usdt_micros | integer | yes | Exact on-chain amount |
| block_number | integer | yes | Confirmed block |
| block_timestamp | datetime | yes | Chain timestamp |
| verification_status | string(16) | yes | verified or rejected |
| verified_at | datetime | yes | Worker verification time |

Indexes: transaction_id (unique), user_id, order_id.

### 3. `financial_ledger`

Immutable double-entry journal. Every business event posts balanced debit and credit rows sharing one journal_id. Row ID is a deterministic hash of journal_id + account_code + line_number.

| Column | Type | Required | Purpose |
|---|---|---:|---|
| journal_id | string(64) | yes | Idempotent journal reference |
| line_number | integer | yes | 1, 2, ... |
| account_code | string(64) | yes | e.g. member_cash, company_revenue, commission_payable |
| owner_user_id | string(36) | no | Member/owner account when applicable |
| direction | string(6) | yes | debit or credit |
| amount_usdt_micros | integer | yes | Positive integer |
| source_type | string(32) | yes | deposit, direct, infinity, unilevel, just4you, withdrawal, reversal |
| source_id | string(128) | yes | Source record/transaction |
| created_at | datetime | yes | Posting time |
| metadata_json | string(4000) | no | Auditable calculation details |

Indexes: journal_id, owner_user_id, source_type + source_id, account_code.

### 4. `commission_events`

Immutable calculation record for every eligible commission allocation.

| Column | Type | Required | Purpose |
|---|---|---:|---|
| event_key | string(128) | yes | Unique idempotency key |
| source_order_id | string(32) | yes | Paid membership order |
| beneficiary_user_id | string(36) | yes | Payee |
| beneficiary_team_owner_id | string(36) | yes | Team attribution snapshot |
| commission_type | string(16) | yes | direct, infinity, unilevel, just4you |
| level | integer | no | Unilevel level 1-5 |
| rate_basis_points | integer | yes | Rate in basis points |
| amount_usdt_micros | integer | yes | Calculated amount |
| qualification_snapshot | string(4000) | yes | Qualification evidence at event time |
| status | string(16) | yes | pending, payable, reversed, paid |
| created_at | datetime | yes | Event time |

Indexes: event_key (unique), beneficiary_user_id, source_order_id, status.

### 5. `withdrawal_requests`

| Column | Type | Required | Purpose |
|---|---|---:|---|
| user_id | string(36) | yes | Requesting member |
| amount_usdt_micros | integer | yes | Gross requested amount |
| fee_usdt_micros | integer | yes | 15% fee |
| net_usdt_micros | integer | yes | Amount to send |
| destination_tron_address | string(64) | yes | Validated TRON address |
| status | string(24) | yes | requested, approved, processing, paid, rejected |
| review_note | string(1000) | no | Company audit note |
| payout_transaction_id | string(64) | no | Chain payout hash |
| created_at | datetime | yes | Request time |
| reviewed_at | datetime | no | Review time |
| paid_at | datetime | no | Payout time |

Indexes: user_id, status, payout_transaction_id (unique when populated).

## Commission rules to encode server-side

The published split of a qualifying membership sale is:
- Direct referral: 30%
- Infinity: 20%
- Unilevel: 10% total, five levels at 2% each
- Just 4 You: 5%
- Company: 35%

The rates total 100%. Do not silently redistribute an unearned or unqualified commission to another person. The unearned amount remains company revenue unless a formally approved plan rule says otherwise.

Qualification logic must use a point-in-time snapshot of the sponsor tree and member qualification state. Direct and Infinity are real-time only after the deposit is verified; Just 4 You is computed on its defined weekly cycle; Unilevel is accrued monthly and requires company approval before payout. Infinity qualification starts from the third direct and follows the agreed 2-by-2 placement rule; the first two directs belong to the upline's Infinity placement. The exact matching/placement algorithm must be unit-tested against company-approved examples before any money is posted.

## Membership plan rules

- Standard plan: 300 USDT; automation unavailable.
- Automation plan: 500 USDT; automation entitlement enabled only after verified payment.
- An account's plan and entitlement must be derived from the verified order/receipt, never from a client-submitted plan flag.
- Upgrades must be represented as a new order and a separate ledger event; never overwrite historical payment data.

## Withdrawal controls

- Available balance is derived from posted ledger entries, not a mutable balance field.
- Enforce the 15% fee in integer arithmetic and store gross, fee and net amounts.
- Reject requests exceeding the available payable balance.
- A request is not paid until the company payout process records a verified TRON transaction hash.
- Require company review and dual control for payouts. The Worker must not hold a wallet private key.

## Required test cases before launch

1. Valid confirmed USDT transfer to the configured company address and exact order amount.
2. Wrong token contract, wrong destination, wrong amount, failed transaction, unconfirmed transfer and expired order are rejected.
3. Replaying the same transaction hash cannot credit a second account or order.
4. Two concurrent verification requests for the same transaction cannot post duplicate journals.
5. Journal debits equal credits for every journal.
6. Commission percentages sum to exactly 10000 basis points; all allocations sum to the paid amount.
7. Members cannot read or write another member's ledger or withdrawals.
8. A standard 300 USDT member never receives automation entitlement.
9. Withdrawal balance, 15% fee and net payout are correct for boundary values.
10. Reversals are compensating journals and preserve the original audit history.

## Configuration still required

Before implementing or enabling the on-chain verifier, configure these server-only Worker secrets/variables:
- `COMPANY_USDT_TRC20_ADDRESS`: official company receiving address, confirmed by the company.
- `TRONGRID_API_KEY`: provider API key for reliable TRON transaction lookups.
- `USDT_TRC20_CONTRACT`: canonical mainnet USDT TRC20 contract address, validated against the network.
- IDs for the five financial TablesDB tables above.

Do not accept deposits until the company address is independently confirmed and the verification tests pass. Do not deploy an unverified manual approval shortcut as a substitute for chain verification.


## Company business dashboard and weekly Just 4 You draw

The Appwrite company dashboard reads approved membership submissions, commission records and company-share ledger entries from the independent Worker. It displays sales by plan, the 35% company allocation, direct and Unilevel accruals, the Infinity reserve, the Just 4 You reserve, paid/pending amounts and payment-review counts. The dashboard is Genesis-only; members cannot query company-wide financial data.

Create one additional TablesDB table, `just4you_draws`, with permissions empty:

| Column | Type | Required | Purpose |
|---|---|---:|---|
| week_key | string(8) | yes | Nairobi-local Monday date, YYYYMMDD; one draw per week |
| week_start | string(10) | yes | Local week start date |
| week_end | string(10) | yes | Exclusive local week end date |
| qualifying_sales | double | yes | Approved membership sales for the week |
| prize_amount | double | yes | 5% of qualifying sales, rounded to cents |
| eligible_members | integer | yes | Number of eligible members at draw time |
| winner_user_id | string(36) | yes | Randomly selected member |
| winner_name | string(256) | yes | Display name snapshot |
| drawn_at | datetime | yes | Draw timestamp |
| drawn_by | string(36) | yes | Genesis company account |
| status | string(16) | yes | awarded |

Use a deterministic row ID derived from the week key to prevent a second draw in the same week. Selection uses the Worker's cryptographic random generator with rejection sampling to avoid modulo bias. Eligible accounts must be active Appwrite users, have verified email, and have an approved paid membership record. The full 5% pool is awarded to one randomly selected eligible member. The draw creates an immutable commission record and pending ledger credit; it does not mark the reward paid. Company payout review remains separate.

The draw endpoint is company-only and idempotent. If the draw record is written but the award write is interrupted, a retry resumes the same winner and prize rather than drawing again.

**Important current limitation:** the existing membership approval endpoint records company approval of a submitted transaction reference; it does not yet independently verify a TRC20 transfer on-chain. Until the on-chain verifier and its company wallet configuration are completed, dashboard sales are labelled *approved membership payments*, not independently chain-verified receipts. Do not treat this reporting view as proof of blockchain settlement or as authorization to pay withdrawals.
