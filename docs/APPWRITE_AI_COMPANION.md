# Appwrite AI Companion

This feature moves the Personal AI experience onto the independent Appwrite platform. It does not call Supabase and does not depend on Supabase Edge Functions.

## API

The independent Worker exposes authenticated routes:
- `GET /api/ai/profile` — load the member's personal goal and memory preference.
- `PUT /api/ai/profile` — save the goal and explicit memory opt-in.
- `GET /api/ai/history` — load the member's saved conversation only when memory is enabled.
- `DELETE /api/ai/history` — clear the authenticated member's saved conversation.
- `POST /api/ai/chat` — generate a response using the configured OpenAI model.

Every route authenticates the Appwrite JWT and derives the member ID from the verified Appwrite account. The browser cannot supply a member ID or access another member's memory. Appwrite server credentials and the model API key remain Worker secrets.

## Memory and privacy

- Goals are stored in the member's Appwrite profile row.
- Conversation history is stored only after the member explicitly enables memory.
- Turning memory off deletes saved conversation rows.
- Clearing conversation history deletes the member's saved rows.
- Appwrite tables use row security with no client permissions; the Worker is the only reader/writer.

## AI behaviour

The companion is designed to guide members across Dashboard, Signals, Analysis, Crypto, Deriv, Automation, Academy, Account and network/business areas. It must not claim it has placed trades, changed account settings, connected a broker or read balances unless the relevant verified result is supplied. App-reported signal context is not a broker execution receipt. The companion must not invent live prices, news or outcomes, promise returns, or recommend timeframes below M30.

## Required configuration before live use

1. Provision both tables from `appwrite/schema/personal-ai.tables.json` in the intended Appwrite database.
2. Enable row security and confirm zero client permissions for both tables.
3. Set Worker variables `AI_PROFILES_TABLE_ID` and `AI_CHAT_HISTORY_TABLE_ID` to the provisioned table IDs.
4. Add `OPENAI_API_KEY` as a Worker secret. Optionally set `PERSONAL_AI_MODEL`; the default is `gpt-4.1-mini`.
5. Deploy the independent Worker and verify the routes using a verified Appwrite test account.
6. Verify both memory-on and memory-off flows, cross-account isolation, clear-history deletion, model timeout/rate-limit handling, and mobile layout.

The AI API returns a clear unavailable response until its model key and required storage are configured. A Pages preview deployment alone does not deploy or configure this Worker.
