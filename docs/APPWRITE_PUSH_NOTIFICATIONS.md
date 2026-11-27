# Appwrite Web Push for SuperTech AI

This is an isolated Web Push implementation for the Appwrite deployment. It does not import, call, or fall back to Supabase.

## What it does

- Registers the current browser with the installed PWA service worker.
- Saves that member's Web Push endpoint and encryption keys in their Appwrite Account preferences under `supertechPush`.
- Uses an Appwrite Function with a server-only API key and VAPID private key to send notifications.
- Includes a signed-in test action and a trusted server-to-server `send` action.
- Removes expired subscriptions when a push provider returns 404 or 410.

## Appwrite Function deployment

Deploy `appwrite/functions/push` as an Appwrite Function using Node.js 22 (or the current supported Node runtime), entry point `src/main.js`, and install command `npm install`.

Configure these function variables/secrets:

- `APPWRITE_API_KEY`: server-only Appwrite API key with Users read/update permissions.
- `VAPID_PUBLIC_KEY`: public VAPID key.
- `VAPID_PRIVATE_KEY`: private VAPID key (secret).
- `VAPID_SUBJECT`: contact URI, e.g. `mailto:admin@your-domain.example`.
- `PUSH_INTERNAL_TOKEN`: long random secret used only by trusted backend event producers.

Appwrite supplies `APPWRITE_FUNCTION_API_ENDPOINT` and `APPWRITE_FUNCTION_PROJECT_ID` at runtime. Do not expose any server secret to Vite or Cloudflare Pages.

Allow authenticated users to execute the function. The function validates the Appwrite user JWT and refuses unverified accounts. Do not make the function publicly executable without its own authentication.

## Cloudflare Pages public build variables

- `VITE_APPWRITE_PUSH_FUNCTION_ID`: the deployed Appwrite Function ID.
- `VITE_APPWRITE_PUSH_VAPID_PUBLIC_KEY`: matching public VAPID key.

These two values are public. Never set the VAPID private key or Appwrite API key as a Vite variable.

## Event delivery contract

A trusted server-side producer can send a member notification by executing this function with JSON body:

```json
{
  "action": "send",
  "userId": "APPWRITE_USER_ID",
  "notification": {
    "title": "New Super Signal",
    "body": "Volatility 100 · BUY · Entry 1234.5",
    "url": "/",
    "tag": "signal:unique-event-id"
  }
}
```

Include header `x-supertech-internal-token` matching the function secret. Never call this internal action from the browser. Connect signal lifecycle, pending-order, income and referral event producers to this contract after each producer is migrated to Appwrite. Use stable event IDs in tags and enforce producer-side idempotency.

## Validation checklist

1. Confirm the Appwrite Web platform includes the exact Cloudflare Pages origin.
2. Deploy the function and configure its secrets.
3. Add the two public Vite variables and rebuild/redeploy Cloudflare Pages.
4. Sign in to SuperTech AI on Android and open **More → Alerts & service health**.
5. Tap **Enable on this device**, accept Android's prompt, then tap **Send test notification**.
6. Lock the phone and repeat the test from a second signed-in session or trusted server producer. Confirm the notification appears without the app in the foreground.
7. Inspect Appwrite Function execution logs for provider errors. Verify expired endpoints are pruned.
8. Test unsubscribe and a second device; ensure disabling one device does not remove another device's subscription.

## Important limitations

A browser-side subscription alone does not create notifications. A deployed sender, VAPID key pair, server-only API key, and backend event producers are all required. This implementation supplies the registration and sender path; signal/business event producers must invoke the trusted send contract to deliver automatic alerts for those events.
