# Market Structure SAR strategy

Market Structure SAR is an independent M15 signal strategy in the scanner. It uses only confirmed candles and the official SuperTechAi timeframe set; its execution trigger is M15.

## Entry rules

- BUY: the latest two confirmed swing highs form a Higher High (HH), the latest two confirmed swing lows form a Higher Low (HL), and Parabolic SAR flips from above the prior close to below the latest confirmed close.
- SELL: the latest two confirmed swing lows form a Lower Low (LL), the latest two confirmed swing highs form a Lower High (LH), and Parabolic SAR flips from below the prior close to above the latest confirmed close.
- Swing points require two candles on each side, so the newest pivot is not used until confirmed.
- The signal is keyed by symbol, M15 candle epoch, direction and strategy version to prevent duplicate alerts.

## Protection proposal

- ATR uses the latest 14 true ranges.
- Initial stop distance is 2 ATR from the confirmed entry reference.
- The trailing reference combines the Parabolic SAR value with a 1.5 ATR volatility buffer and only moves in the protective direction when a position manager applies it.
- No fixed take-profit is assumed; the proposal is designed to trail a confirmed trend. A broker-side position manager must validate stop distance, tick size, freeze levels and ownership before changing a live stop.

## Release boundary

This release produces a dedicated signal and push notification only. It does not place market or pending orders, calculate live volume, modify broker stops, close positions or manage manual trades. Do not present it as unattended EA execution. The MT5 bridge documentation currently describes manual member-confirmed pending orders and does not support automatic position management. A later execution release needs strategy-owned position records, risk-sized volume, idempotent order dispatch, broker protection confirmation, restart reconciliation, and demo plus broker end-to-end tests.

## Risk notes

HH/HL and LL/LH are lagging swing confirmations; SAR can whipsaw in ranges. ATR distances are volatility estimates, not guaranteed loss limits. Spread, slippage, gaps, commissions and broker stop constraints can make realized risk larger than planned.
