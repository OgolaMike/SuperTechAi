# SuperTech AI Brain — Appwrite Function

This is the server-side model gateway for the SuperTech AI Brain. Deploy it as an Appwrite Function with Node.js 20+ and set the following function environment variables:

- `AI_PROVIDER`: provider label, e.g. `xai`
- `AI_BASE_URL`: OpenAI-compatible API base URL for the chosen provider
- `AI_MODEL`: model identifier enabled for the account
- `AI_API_KEY`: secret API key (never expose to Vite/browser variables)
- `AI_MAX_OUTPUT_TOKENS`: optional output cap (default 900)

Grant execution to authenticated users only. The function requires Appwrite's `x-appwrite-user-id` execution header and rejects anonymous calls. Set an appropriate execution timeout (at least 30 seconds) and configure per-user rate limits at the gateway/Appwrite layer before public rollout.

The endpoint accepts POST JSON:
```json
{
  "module": "dashboard",
  "task": "daily-briefing",
  "message": "What should I focus on?",
  "context": { "selectedAsset": "..." }
}
```

It returns an answer with provider/model/request metadata. It intentionally has no broker, payment, withdrawal or account-mutation tools.

This source is a deployable function entry point, not proof that a function has been created in the live Appwrite project. Configure the function ID, runtime, scopes, environment variables and deployment in Appwrite Console before connecting the app.
