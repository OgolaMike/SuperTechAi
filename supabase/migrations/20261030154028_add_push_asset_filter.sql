/*
# Per-asset push filter

1. Plain-English summary
- Each push subscription can now choose which assets send it alerts.

2. Changes
- `push_subscriptions.symbols`: list of asset symbols to alert for. NULL means all assets, so existing subscriptions keep receiving everything.

3. Notes
- Idempotent: safe to re-run.
- No data is deleted or altered.
*/

ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS symbols text[];
