# Appwrite membership approval setup

This is for the independent Appwrite edition only. It does not change the Supabase/Bolt production edition.

## Required Appwrite table

In database `6b06e4d900325c304d98`, create a TablesDB table with ID `membership_requests`. Keep table permissions empty; only the independent Worker server API key may access it.

Create these columns:

| Column | Type | Required |
|---|---|---|
| user_id | string (36) | yes |
| email | string (320) | yes |
| status | string (16) | yes |
| plan_code | string (24) | yes |
| created_at | datetime | yes |
| updated_at | datetime | yes |
| reviewed_at | datetime | no |
| reviewed_by | string (36) | no |
| review_note | string (500) | no |

Create a unique index on `user_id`, plus indexes on `status` and `created_at`.

## Company administrator

The existing Worker secret `GENESIS_ACCOUNT_ID` identifies the one company Genesis account authorized to approve/reject/suspend memberships. Keep it server-only. No ordinary member can invoke administrative actions, even if they manually call the API.

The table ID is configured as `MEMBERSHIP_TABLE_ID=membership_requests` in the Worker Wrangler variables.

## Member flow

1. A member registers and verifies their Appwrite email.
2. On first verified sign-in, the Worker creates a server-owned membership row with status `pending`.
3. The member sees an awaiting-approval screen. No trading terminal, signals, referrals or other member services load.
4. The Genesis company administrator opens **More → Owner tools → Members**.
5. The administrator approves the member as Free, $300 Standard or $500 Premium, or rejects/suspends the account.
6. After approval, the member proceeds to the existing upline/referral verification gate. Team assignment rules remain unchanged.

All registered accounts, including Free members, require explicit company approval. The Genesis account is the sole administrative exception.

## Plans and payment handling

- `free`: approved free membership.
- `standard_300`: approved $300 Standard membership; automation is not included.
- `automation_500`: approved $500 Premium membership; automation entitlement is included.

The approval panel explicitly reminds the company to confirm payment before selecting either paid plan. This change does **not** claim to verify USDT TRC20 deposits automatically. Until the separate on-chain verifier is implemented and tested, the company must verify payment independently before approving a paid plan.

## Security

- Membership rows use the Appwrite account ID as a deterministic row ID.
- The browser cannot create, update, approve or change plan records.
- Broker automation API routes independently check the approved `$500 Premium` entitlement in the Worker; hiding the automation navigation is not the only control.
- The Worker authenticates the Appwrite JWT and checks the Genesis account ID for all administrative reads/writes.
- Membership table permissions are empty; no client read/write grants are created.
- The app fails closed if membership status cannot be checked.
- Every review records the reviewing company account and timestamp.

## Deploy checklist

1. Create the table and indexes above.
2. Confirm `APPWRITE_API_KEY` and `GENESIS_ACCOUNT_ID` are configured as Worker secrets.
3. Deploy the independent Worker and Pages app from the membership-approval branch after CI passes.
4. Sign in as a test member and confirm the account appears as Pending in the company Members panel.
5. Confirm a non-Genesis account receives HTTP 403 from the admin membership endpoint.
6. Approve the test member as Free and verify they can continue only after also satisfying the upline gate.
7. Test $300 and $500 approval records; verify the plan is stored accurately.
8. Reject and suspend test accounts and verify their terminal remains blocked.

Do not merge or deploy this branch into the legacy Supabase/Bolt production app.
