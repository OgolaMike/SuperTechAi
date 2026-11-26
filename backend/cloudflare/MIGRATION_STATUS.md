# Backend migration tracker

This tracker intentionally distinguishes source inventory from completed ports. A route is not considered migrated until its server-side authorization, data contract, integration behavior and tests are implemented.

| Existing responsibility | Target Worker route/service | Status |
|---|---|---|
| scanner | market scanner + scheduled trigger | Not started |
| push | push delivery and subscription management | Not started |
| crypto-movers | crypto daily movers | Not started |
| admin-users | admin member management | Not started |
| mt5-bridge | MT5 bridge | Not started |
| finance | membership and finance | Not started |
| ctrader-connect | cTrader OAuth connect | Not started |
| ctrader-callback | cTrader OAuth callback | Not started |
| ctrader-disconnect | cTrader disconnect | Not started |
| ctrader-discover-accounts | cTrader account discovery | Not started |
| binance-spot | Binance Spot integration | Not started |
| network | member/referral network | Not started |
| academy-videos | Academy video library and publishing | Not started |
| binance-futures | Binance Futures integration | Not started |
| binance-futures-executor | Binance Futures execution | Not started |
| okx-futures | OKX Futures integration | Not started |
| okx-futures-executor | OKX Futures execution | Not started |
| marketing-ai | marketing content generation | Not started |
| marketing-image | marketing image generation | Not started |
| exchange-market | exchange market data proxy | Not started |
| automation-status | automation connection/status | Not started |
| academy-ai | AI Academy and tutoring | Not started |
| nfc-community | NFC community cards | Not started |

## Completed in this branch
- Isolated Cloudflare Worker project structure.
- Neon PostgreSQL connectivity health-check route.
- Environment-specific Wrangler configuration for staging and production.
- CORS allow-list tied to the configured app origin.
- Fail-closed placeholder response for application routes that have not yet been ported.

## Not yet completed
- Neon database provisioned or schema applied.
- Better Auth setup, email verification, password recovery and admin bootstrap.
- App tables, policies, database functions and triggers.
- Any of the 23 application responsibilities above.
- Cron schedules, R2 storage, push delivery and external service credentials.
- Frontend data/auth adapter replacement.
- Build, typecheck, integration tests and deployment verification.

No production endpoint has been switched. The existing Supabase project and app remain the active system.
