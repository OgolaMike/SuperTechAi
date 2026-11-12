-- Align persisted account-intent metadata with the official eight-timeframe analysis set.
-- Existing M1/M5 intent history is retained; new/updated intents must use an official frame.
BEGIN;

ALTER TABLE public.mt5_signal_intents
  DROP CONSTRAINT IF EXISTS mt5_signal_intents_timeframe_check;

ALTER TABLE public.mt5_signal_intents
  ADD CONSTRAINT mt5_signal_intents_timeframe_check
  CHECK (timeframe = ANY (ARRAY['D1','H8','H4','H3','H2','H1','M30','M15']::text[]))
  NOT VALID;

-- These granularities are no longer part of the scheduled eight-frame scan.
DELETE FROM public.scanner_candle_marks
WHERE granularity IN (60, 300);

COMMIT;
