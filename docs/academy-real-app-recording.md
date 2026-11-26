# Academy real-application video recording

The Academy publisher records the **actual SuperTechAi application**. It must not use `public/academy-demo.html` or a locally fabricated screen.

## Required GitHub Actions secrets

Configure these repository secrets before manually dispatching the publisher:

- `ACADEMY_APP_URL`: the canonical production application URL (for example, the public Bolt deployment URL).
- `ACADEMY_PLAYWRIGHT_STORAGE_STATE_BASE64`: base64-encoded Playwright storage state for a dedicated, approved Academy recording account.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`: existing publisher credentials.

Use a dedicated recording account with no personal member data, no financial balance, no referral tree, and no live trading permissions. Grant only the minimum application access required to view the lessons' screens. Never use an owner's or a real member's browser session.

## Create the recording session state

On a trusted local machine, sign in to the production app as the dedicated recording account and save a Playwright storage state. Keep the file private and do not commit it.

Example using Playwright:

```js
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();
await page.goto(process.env.ACADEMY_APP_URL);
console.log('Sign in with the dedicated Academy recording account.');
await page.pause();
await context.storageState({ path: 'academy-recording-state.json' });
await browser.close();
```

Encode the state file as one base64 string and add it as the GitHub Actions secret `ACADEMY_PLAYWRIGHT_STORAGE_STATE_BASE64`. Do not paste the state into issues, pull requests, logs, or chat. Rotate the session if it is exposed or no longer needed.

## Safe publishing behavior

- Pull-request runs perform syntax validation only; they never publish videos.
- Publishing runs only through a manual `workflow_dispatch`.
- The worker refuses to record if it cannot see the real app's authenticated main navigation. It must not silently fall back to a demo page or record the login screen.
- The browser records at 1440×900 and navigates the real app's existing sections for supported lesson IDs.
- The production UI may change after a deployment. Re-check screenshots and playback before publishing a batch.
- Use a small, explicitly approved pilot first. Do not bulk-regenerate the Academy until the pilot has passed visual and full-playback review.

## Scope and known limitation

The current worker pairs the lesson narration with a real-app screen recording. It does not yet perform a guided click-by-click tour of every control, and the app's live market sections can show current live data. Review each lesson's narration against its captured screen; do not claim the screen explains a step unless that section is visibly demonstrated.

The publisher currently targets the existing `-interface-v2.mp4` naming/version check. Coordinate any later version-tag or Edge Function changes separately; this change does not deploy Supabase functions, modify Academy records, or start publishing.
