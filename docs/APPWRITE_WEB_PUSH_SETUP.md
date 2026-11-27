# Appwrite Web Push setup

The independent Cloudflare Worker owns Web Push registration and delivery. It verifies each Appwrite JWT, stores endpoint/key material in a private Appwrite table, and sends RFC 8291 encrypted push messages with VAPID authentication. No Supabase endpoint or key is used.

## Required Appwrite table

Create the `push_subscriptions` table in database `supertech_ai_sandbox` (`6b06e4d900325c304d98`) using `appwrite/schema/push-subscriptions.table.json`.

- Enable row security.
- Grant **no client permissions** (no member read/write access).
- Add the listed columns and indexes.
- Keep this table accessible only through the Cloudflare Worker Appwrite API key.

After creation, set `PUSH_SUBSCRIPTIONS_TABLE_ID` in `workers/independent-api/wrangler.toml` to the table ID.

## Generate VAPID keys

Run locally from the repository root:

```bash
node scripts/generate-vapid-keys.mjs
```

Copy `VAPID_PUBLIC_KEY` into the Worker `[vars]` section. Set the private key as a Cloudflare Worker secret (never a Pages build variable):

```bash
npx wrangler secret put VAPID_PRIVATE_KEY --config workers/independent-api/wrangler.toml
```

Paste only the generated `VAPID_PRIVATE_KEY` when Wrangler prompts. Keep `VAPID_SUBJECT` as the verified HTTPS origin for the independent Appwrite site.

## Deploy and verify

1. Deploy the `supertechai-independent-api` Worker after the Appwrite table and VAPID values are configured.
2. Ensure `VITE_INDEPENDENT_API_URL` in the independent Pages project points to that Worker URL.
3. Deploy the Pages build containing `IndependentPushSettings` and the root-scoped `public/sw.js`.
4. Open SuperTech AI on Android, go to **Notifications**, and choose **Enable push notifications**.
5. Choose **Send test notification**. Confirm it appears in the Android notification tray with the app in the background and then with the app closed.

## Supported endpoints

- `GET /api/push/key` — authenticated VAPID public key.
- `GET /api/push/status` — current account's registered device count.
- `POST /api/push/subscribe` — register/update the current device.
- `POST /api/push/unsubscribe` — remove the current device.
- `POST /api/push/test` — send a test notification to the current account's registered devices.

The API only accepts HTTPS push endpoints from recognized browser push providers. Expired endpoints (404/410) are removed; transient provider failures are retained for retry.

**Release gate:** Do not call push notifications production-ready until the table is provisioned, the Worker secrets are set, both deployments are published, and the Android background/closed-app test passes. Signal, target/stop, referral, and business event producers must separately call the delivery service before those event types can generate notifications.
