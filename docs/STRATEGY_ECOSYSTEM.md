# SuperTechAI strategy ecosystem

## Platform model

SuperTechAI is a multi-strategy platform with two separate execution paths:

- **Manual trading:** remains user-controlled and is never managed by a strategy worker.
- **Automated strategies:** each strategy has its own identifier, settings, signal lifecycle, position ownership and audit history. Shared broker connectivity does not imply shared position control.

## Intelligence and strategy layers

1. **Unified Multi-Timeframe Intelligence:** the coordination layer. H4 owns the primary signal; the ten configured timeframes contribute confirmation. It produces one coordinated direction per asset, not ten competing instructions.
2. **Pure Price Action:** reads candle bodies, wicks, swing highs/lows, structure and rejection independently of indicator calculations.
3. **Market Structure SAR:** independent M15 setup using confirmed HH/HL or LL/LH structure, a Parabolic SAR flip and ATR protection. Current release is signal-only.
4. **Break & Retest:** independent level-break and retest setup.
5. **Triple Bottom / Triple Top:** pure-price-action pending-order ideas, tracked independently from market signals.
6. **3H Wick Intelligence:** independent H4 rejection setup. In confirmation mode, a same-symbol, fresh Unified Signal must agree with the wick direction. It proposes a BB(20, 2.0) initial stop, a progressive price-based trailing plan and a three-hour maximum holding period.

## 3H Wick rules

- Evaluate only fully closed H4 candles.
- BUY: bullish close with lower wick at least 2 times the candle body.
- SELL: bearish close with upper wick at least 2 times the candle body.
- If both or neither condition applies, reject the setup.
- Require a fresh Unified Signal for the exact same symbol and same direction. A signal on another symbol can never authorize this setup.
- Initial BUY stop: lower H4 Bollinger Band minus 0.1 standard deviation; initial SELL stop: upper band plus 0.1 standard deviation.
- Trailing activation is +0.7% favourable price movement. At +0.7%, stop reaches break-even; each additional +0.5 percentage points locks another +0.5 percentage points from entry. Stop may only tighten.
- Maximum holding time is three hours from actual broker execution time, not signal time.
- Only one entry per H4 signal key and asset.
- A later Unified Signal reversal does not reverse or force-close an already-open position.
- The strategy may only manage positions carrying its own strategy identifier.
- Its exact versioned broker label is `supertech:3h-wick:v1:<intent-uuid>`; generic SuperTech labels do not qualify for 3H Wick ownership.
- The pure position-decision helper ignores manual, generic, closed and malformed positions; it returns only HOLD, MODIFY_STOP or CLOSE decisions. A broker adapter must verify every broker acknowledgement before recording success.

## Release boundary

The web client currently provides a read-only candidate preview. The lifecycle helper is a pure decision layer; it does not submit orders, persist strategy-owned positions, or run a durable three-hour position manager. cTrader's current repository UI explicitly reports that the cloud trade engine is not active. Do not enable unattended execution until a broker-side worker/cBot, idempotent order dispatch, broker stop-distance and volume validation, position reconciliation, close confirmation, exposure controls and demo end-to-end tests are complete.

## Asset coverage

The strategy evaluator is symbol-scoped and does not infer or substitute symbols. Production all-asset automation must enumerate instruments actually available and tradable on the connected cTrader account, then validate symbol mapping, market hours, permissions, tick size, minimum volume and stop constraints. The current single-asset dashboard data feed is not evidence that every broker instrument is being scanned.

## Manual-trading guarantee

Manual positions must not carry the strategy ownership tag. The 3H Wick manager must filter every modify/close operation by both account and strategy-owned broker position ID/label. Disabling the strategy stops new entries; it must not close or alter manual positions.
