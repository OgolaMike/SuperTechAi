# Appwrite AI Companion

The Appwrite deployment uses the independent Worker for AI requests and Appwrite TablesDB for member preferences and optional chat memory. This implementation does not call Supabase or Supabase Edge Functions.

## Authenticated API

- `GET /api/ai/profile` — read the signed-in member's goal and memory preference.
- `PUT /api/ai/profile` — save the goal and explicit memory opt-in.
- `GET /api/ai/history` — read the member's saved chat only when memory is enabled.
- `DELETE /api/ai/history` — clear the member's saved chat.
- `POST /api/ai/chat` — request an AI response.

Every route verifies the Appwrite JWT and derives the member ID from the verified Appwrite account. The browser cannot select a member ID. Appwrite server credentials and the AI provider key remain Worker-side secrets.

## Privacy controls

- The personal goal is stored in the member's private Appwrite profile.
- Chat history is persisted only after the member enables memory.
- Turning memory off clears saved chat history.
- Clearing the conversation deletes saved rows for the signed-in member.
- Both tables must have row security enabled and no client permissions.
- Do not place API keys in Vite variables or browser code.

## AI behaviour

The Companion is a cross-platform guide for Dashboard, Super Signals, Analysis, Crypto, Deriv, Automation, Academy, Account, referrals and business areas. It may explain supplied app context, but must not claim it has placed trades, connected brokers, changed account settings or read private balances. App-reported signals are not broker fills. It must not invent live prices, news or performance, or promise returns. The Super 13 timeframe context includes M1, M5 and M15 as well as higher frames; explain that lower timeframes can be noisier and must be interpreted with broader context.

## Required configuration before live use

1. Provision `member_ai_profiles` and `member_ai_chat_history` from `appwrite/schema/personal-ai.tables.json` in the intended Appwrite database.
2. Confirm exact columns and indexes, row security enabled, and zero client permissions on both tables.
3. Set Worker variables `AI_PROFILES_TABLE_ID` and `AI_CHAT_HISTORY_TABLE_ID`.
4. Add `OPENAI_API_KEY` as a Worker secret. Optionally set `PERSONAL_AI_MODEL`; the code default is `gpt-4.1-mini`.
5. Deploy the independent Worker and test with verified Appwrite accounts.
6. Verify profile save/load, memory on/off, history deletion, cross-account isolation, model errors and mobile layout.

A Pages deployment alone does not provision Appwrite tables, set Worker secrets or deploy the Worker. Until these are configured, the Companion will show a clear service-unavailable message rather than pretending the AI is connected.
