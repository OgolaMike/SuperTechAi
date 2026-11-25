# Ten-Timeframe Unified Intelligence — Sync Readiness

Last checked: 2026-11-25

## Canonical analysis model

The official timeframe set is:

`M30, H1, H2, H3, H4, H6, H8, H12, D1, W1`.

- H4 remains the primary direction; W1 adds the highest-level market context.
- The other nine frames are supporting reads.
- A signal requires fresh data for all ten frames, at least six supporting reads aligned with H4, and no opposing directional read.
- Neutral supporting reads are permitted; missing or stale reads are not.
- M30 is the lowest permitted analysis and execution timeframe; no M1, M5 or M15 feed is part of the official set.
- If the gate is not satisfied, the unified result is WAIT/no signal.

## Repository implementation

- Shared frontend timeframe configuration and live candle state include all ten frames.
- Scanner evaluates the same H4-led ten-frame gate.
- Super Signal remains one H4-anchored result; timeframe tiles show support/neutral/missing/opposing state rather than separate instructions.
- Pending Orders use H4 for direction, require at least six of nine supporting reads without opposition, and use a fresh M30 signal as the trigger.
- Binance Futures and OKX Futures executor gates require at least 7/10 agreement (H4 plus six supporting frames).
- Pure Price Action remains indicator-free and now displays confirmed market structure, swing highs/lows, and the last closed candle below its chart.

## Database

Applied to the active Supabase project:

- `20261125095830_enable_ten_timeframe_analysis`
- `20261125100500_validate_ten_timeframe_constraints`

The `signal_records_timeframe_check` and `push_events_timeframe_check` constraints are validated. Existing rows were checked before validation; no unsupported timeframe values were found.

## Verification

The repository verification workflows run:

- TypeScript typecheck
- ESLint
- Vite production build
- Deno static checks for scanner, Binance Spot/Futures, and OKX Futures functions
- MT5 risk-control unit tests

## Production sync blocker — do not mistake this for a deployment

The Supabase project is reported as `ACTIVE_HEALTHY`, but scanner invocations from the existing one-minute cron are currently receiving HTTP 402. The recorded response body says the project service is restricted because it exceeded its egress quota and that the project owner must upgrade the plan or remove spend caps to restore service.

The scanner state last recorded a successful run on 2026-11-15. Consequently, the old M1/M5 feed coverage is historical only and is no longer part of the official timeframe set.

The deployed Edge Function versions observed at the time of this check were:

- `scanner`: v36
- `binance-futures-executor`: v12
- `okx-futures-executor`: v4
- `okx-futures`: v5

These deployed versions do not yet contain all current repository changes. Do not treat GitHub main or the database migration as proof that Edge Functions have been deployed. Deployment and live-feed verification must wait until the Supabase service restriction is resolved. Do not remove spend caps or change billing without the project owner's explicit approval.

## Current handoff

GitHub `main` contains the implementation and verification changes. The database schema is synchronized and validated. Edge Function deployment and live-feed validation remain blocked by the Supabase egress restriction; the frontend host has not been redeployed as part of this change.
