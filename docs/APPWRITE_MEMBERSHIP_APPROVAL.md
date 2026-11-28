# Appwrite membership approval rollout

This approval gate is isolated to the Appwrite edition. It does not change the legacy Supabase/Bolt deployment.

## Worker secrets

Configure these as **Cloudflare Worker secrets** on `supertechai-independent-api` (never as frontend/Vite variables):

- `APPWRITE_API_KEY`: Appwrite server key with only the permissions needed for Users read and TablesDB row read/create/update in the configured database. Do not grant schema-management scopes to the runtime key.
- `APPWRITE_ADMIN_EMAILS`: comma-separated, verified Appwrite administrator email addresses. Add the owner's verified Appwrite email and any other explicitly authorized administrators. Alternatively use `APPWRITE_ADMIN_USER_IDS` with Appwrite user IDs.

The Worker already reads `APPWRITE_DATABASE_ID` and `MEMBER_PROFILES_TABLE_ID` from its non-secret configuration. The member_profiles table must have the columns `user_id`, `display_name`, `onboarding_status`, `created_at`, and `updated_at`; row security must be ON and table permissions must remain empty. The existing schema record says provisioning was partial, so verify those columns and security settings before enabling the key.

## Behavior

- A verified Appwrite user receives a server-created profile with `onboarding_status=pending` on first membership check.
- Only a configured administrator can list accounts or change status.
- Approval requires the member's email to be verified.
- The Appwrite app remains blocked unless the server returns `approved`.
- Pending members see the approval screen; suspended members are denied.
- Admin changes are made through the independent Worker, not the browser SDK.
- Admin identity is never accepted from a browser-supplied role flag.

## Routes

- `GET /api/membership/status`
- `GET /api/admin/members`
- `PATCH /api/admin/members` with `{ "userId": "...", "status": "approved|pending|suspended" }`

## Important deployment note

This code is not active until the Worker is deployed with the secrets above. Do not enable a broad Appwrite API key or put any key in the frontend. Verify the Worker health endpoint and test with one ordinary member and one configured administrator before opening access to all members.
