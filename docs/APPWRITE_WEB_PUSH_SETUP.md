# Appwrite Web Push — deployment checklist

This is the independent Appwrite deployment only. It does not change the legacy Supabase/Bolt app.

## What the code now supports

- The Appwrite member session requests browser notification permission on an explicit user click.
- The app registers `/sw.js` and creates a Web Push subscription using the VAPID public key.
- The subscription endpoint is stored in an Appwrite TablesDB row through the authenticated independent Worker.
- A signed, payload-free Web Push test can be sent to every active subscription owned by the signed-in member. The service worker displays a branded notification.
- The Alerts screen reports setup and delivery errors instead of silently pretending notifications are enabled.

This first pass validates device registration and provider delivery. It does not yet connect every trading/business event to background notification dispatch. Those events must be emitted by trusted server-side producers; browser-only signal calculations cannot notify a closed browser.

## Appwrite TablesDB setup

In database `supertech_ai_sandbox` (`6b06e4d900325c304d98`), create a table named `push_subscriptions`. Use a new table ID and add:

| Column | Type | Required |
|---|---|---:|
| `user_id` | varchar, 36 | yes |
| `endpoint` | varchar, 4096 | yes |
| `created_at` | datetime | yes |
| `active` | boolean | yes |

Create a unique index on `endpoint` and a key index on `user_id`. Enable row security and grant no client permissions. The Worker API key alone writes/reads these rows. Record the new table ID; do not guess or reuse another table ID.

## VAPID keys

Generate a dedicated P-256 VAPID key pair for this deployment. The Worker expects:
- `VAPID_PUBLIC_KEY`: uncompressed 65-byte P-256 public point, base64url encoded without padding. This is public and is returned to the authenticated browser.
- `VAPID_PRIVATE_KEY`: PKCS#8 DER-encoded P-256 private key, base64url encoded without padding. This is a Cloudflare Worker secret only.
- `VAPID_SUBJECT`: a valid contact URI such as `mailto:ops@your-domain.example`.

Example generation with Node.js (run locally in a secure terminal; never commit the output):

```js
const { generateKeyPairSync, createPrivateKey, createPublicKey } = require('node:crypto');
const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const der = privateKey.export({ format: 'der', type: 'pkcs8' });
const jwk = createPublicKey(privateKey).export({ format: 'jwk' });
const b64url = (b) => Buffer.from(b).toString('base64url');
const publicPoint = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]);
process.stdout.write(JSON.stringify({ VAPID_PUBLIC_KEY: b64url(publicPoint), VAPID_PRIVATE_KEY: b64url(der) }, null, 2));
```

Configure the independent Worker (not the legacy Worker):

```sh
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put APPWRITE_API_KEY
```

Set these non-secret Worker variables in the Cloudflare dashboard or `wrangler.toml`:
- `PUSH_SUBSCRIPTIONS_TABLE_ID` = the new Appwrite table ID
- `VAPID_PUBLIC_KEY` = generated public key
- `VAPID_SUBJECT` = valid contact URI

Do not put the private key in `wrangler.toml`, Pages variables, frontend `VITE_*` variables, or Git.

## Release and real-device test

1. Deploy the independent Worker with the variables/secrets above.
2. Deploy the Appwrite Pages build containing the Alerts screen and service-worker registration.
3. Open SuperTech AI on Android Chrome, sign in, open Alerts, and choose **Enable push notifications**.
4. Choose **Send test notification**. The Worker must report a successful provider response and the notification must appear in Android's notification shade.
5. Close the PWA completely and repeat the test from a second signed-in session or server-side dispatch test. Do not call push production-ready until a closed-app delivery test passes.

If Android has previously denied permission, open Android Settings → Apps → Chrome → Notifications (or the installed SuperTech AI app's App info → Notifications) and allow it. Also confirm the site is not in Chrome's blocked notification list.

## Current blocker

The repository change cannot provision the Appwrite table or set Cloudflare secrets from GitHub. The new table ID and VAPID key pair must be configured in the independent Appwrite/Cloudflare environments before the in-app test can succeed. No secret is stored in source control.
