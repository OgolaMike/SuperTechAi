# Deriv Options Trader execution contract

This is the shared execution contract for the Supabase and Appwrite editions. The browser may display opportunities and trade history, but it must never hold a Deriv access token or decide that a real-money order is safe. Each backend implements the same contract with its own database, secrets and authenticated server functions.

## Lifecycle

1. **Qualify** — consume a fresh output from the existing independent strategy engines and confluence engine. Require a current, high-confluence directional opportunity. Do not recreate market analysis in the options executor.
2. **Build proposal** — calculate the 30-minute relative barrier from the agreed Bollinger 2.5-deviation boundary. Request a Deriv proposal for the selected market and ONETOUCH/NOTOUCH contract. Both contract kinds use the same directional barrier.
3. **Validate proposal** — reject stale or expired proposals, mismatched symbols/contracts/account modes, invalid prices, unsupported markets, and stake outside the server-owned limit. A displayed opportunity is not permission to buy.
4. **Reserve execution** — create a durable execution record with a unique idempotency key before sending a buy. Enforce one active purchase per opportunity/proposal according to the configured duplicate policy.
5. **Buy** — use the fresh proposal ID and the server-selected authorised account. Never accept a proposal ID, account ID, stake limit or account mode as trusted merely because the browser supplied it.
6. **Monitor** — persist the Deriv contract ID and subscribe/poll the open contract until a terminal result is confirmed. Reconnect safely after backend or socket interruptions.
7. **Settle** — persist the broker-confirmed result, buy price, payout, profit/loss, buy/sell times and final status. Do not infer a win/loss from a local price approximation.
8. **History** — show active and completed contracts from persisted records, with a clear pending/unknown state when Deriv has not confirmed the result.

## Required safety behaviour

- The existing Activate/Deactivate control is the only automation switch. The backend checks its persisted state immediately before each purchase.
- Demo is the default. Real mode requires an explicit member action and a server-side check that the selected OAuth-authorised account is a real account. A UI toggle alone is not authorisation.
- The configured stake limit and available balance are checked server-side. A failed check means no buy request.
- A proposal must be fresh, unexpired and match the intended symbol, direction/barrier and contract type.
- Persist an idempotency key before sending a buy. If the buy request times out, mark the attempt `UNKNOWN` and reconcile against Deriv contract/statement records before any retry. Never blindly retry an ambiguous buy.
- Store every state transition and broker response needed for an audit trail. Encrypt OAuth tokens at rest and never return them to the browser.
- Disconnecting or expiring OAuth prevents new purchases. Existing open contracts must still be monitored and reconciled where the broker authorisation permits.
- No emergency-stop control is added; Deactivate remains the member-facing stop for new automated purchases.
- No real-money automation is enabled until the complete Demo lifecycle has passed end-to-end tests.

## Backend parity

Implement the same operations in both independent editions:

- `getConnectionStatus`
- `listEligibleMarkets`
- `createProposal`
- `purchaseProposal`
- `getOpenContracts`
- `monitorContract`
- `reconcileUnknownPurchase`
- `listTradeHistory`
- `setAutomationEnabled`

Supabase and Appwrite must use separate OAuth credentials, encrypted token stores, database records and function secrets. Keep the shared TypeScript domain rules in `src/lib/optionsTrader.ts` and `src/lib/optionsTraderLifecycle.ts`; duplicate all security-critical validation in each backend. Do not point the Appwrite edition at the Supabase project or deploy these Supabase migrations to production without explicit approval.

## Current release gate

Automatic trading remains disabled. OAuth setup and the account UI are present on the feature branch, but OAuth has not been end-to-end tested and the proposal-to-settlement executor is not yet implemented. The Deriv OAuth client ID and isolated test backend configuration are still required before a real connection test. Production remains unchanged.
