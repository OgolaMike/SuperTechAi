# SuperTech AI repair notes — 10 November 2026

- The scanner now treats an empty or null Binance Futures `allowed_symbols` list as all eligible USD-M perpetual pairs. Explicit non-empty lists remain restrictive.
- The tracked scanner and Binance Futures Edge Function sources are synchronized from the deployed Supabase project.
- Binance Spot and Futures connection errors remain visible after connection tests and explain the common invalid-key, IP-restriction, and permission failure.
- Binance credentials must remain withdrawal-disabled. Exchange-side API key permissions and IP restrictions must be verified by the account owner.
- PWA manifest uses a transparent SVG brand mark for normal icons and a dark-backed SVG for maskable installation icons.
- Break & Retest retains a fixed 5R risk/reward type.
- The Academy admin panel is backend-publishing-only; browser-based duplicate video generation code has been removed.

Live Futures order execution must remain gated by explicit member opt-in, risk controls, emergency stop, 8/8 Super Signal confirmation, and confirmed protective orders. This document does not authorize live trading or change account permissions.
