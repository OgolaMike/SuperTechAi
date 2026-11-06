-- Replace the weekly scanner timeframe with native 8-hour candles.
-- Keep existing W1 audit/history rows intact; do not relabel historical weekly data as H8.
BEGIN;

ALTER TABLE public.mt5_signal_intents
  DROP CONSTRAINT IF EXISTS mt5_signal_intents_timeframe_check;

ALTER TABLE public.mt5_signal_intents
  ADD CONSTRAINT mt5_signal_intents_timeframe_check
  CHECK (timeframe = ANY (ARRAY['M1','M5','M15','M30','H1','H4','H8','D1']::text[]))
  NOT VALID;

-- Force the scanner to establish a fresh H8 processing cursor rather than
-- inheriting the old weekly-granularity cursor.
DELETE FROM public.scanner_candle_marks
WHERE granularity = 604800;

COMMIT;
