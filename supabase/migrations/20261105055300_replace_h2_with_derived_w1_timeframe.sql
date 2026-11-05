-- Keep review-only MT5 signal intent metadata aligned with the eight-frame strategy.
-- Weekly candles are derived from completed UTC daily candles; H2 is no longer part of confluence.
BEGIN;

ALTER TABLE public.mt5_signal_intents
  DROP CONSTRAINT IF EXISTS mt5_signal_intents_timeframe_check;

ALTER TABLE public.mt5_signal_intents
  ADD CONSTRAINT mt5_signal_intents_timeframe_check
  CHECK (timeframe = ANY (ARRAY['M1','M5','M15','M30','H1','H4','D1','W1']::text[]));

COMMIT;
