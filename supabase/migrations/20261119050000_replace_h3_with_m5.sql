-- Replace the legacy H3 analysis slot with native M5 entry-timing analysis.
-- This migration is staged on the parallel feature branch; it is not applied to production.
BEGIN;

-- Remove stale H3 scan cursors so the retired interval cannot resume.
DELETE FROM public.scanner_candle_marks WHERE granularity = 10800;

-- Keep historical H3 signal rows for audit, but enforce the new official eight
-- timeframe set for new writes. NOT VALID avoids rewriting historical records.
ALTER TABLE public.signal_records
  DROP CONSTRAINT IF EXISTS signal_records_timeframe_check;
ALTER TABLE public.signal_records
  ADD CONSTRAINT signal_records_timeframe_check
  CHECK (
    (timeframe = 'D1' AND granularity = 86400) OR
    (timeframe = 'H8' AND granularity = 28800) OR
    (timeframe = 'H4' AND granularity = 14400) OR
    (timeframe = 'H2' AND granularity = 7200) OR
    (timeframe = 'H1' AND granularity = 3600) OR
    (timeframe = 'M30' AND granularity = 1800) OR
    (timeframe = 'M15' AND granularity = 900) OR
    (timeframe = 'M5' AND granularity = 300)
  ) NOT VALID;

-- Retire any queued H3 alerts without deleting their audit history.
UPDATE public.push_events
SET dispatched_at = COALESCE(dispatched_at, now())
WHERE payload->>'timeframe' = 'H3';

ALTER TABLE public.push_events
  DROP CONSTRAINT IF EXISTS push_events_timeframe_check;
ALTER TABLE public.push_events
  ADD CONSTRAINT push_events_timeframe_check
  CHECK (
    payload->>'timeframe' IS NULL OR
    payload->>'timeframe' IN ('D1','H8','H4','H2','H1','M30','M15','M5','8/8')
  ) NOT VALID;

ALTER TABLE public.mt5_signal_intents
  DROP CONSTRAINT IF EXISTS mt5_signal_intents_timeframe_check;
ALTER TABLE public.mt5_signal_intents
  ADD CONSTRAINT mt5_signal_intents_timeframe_check
  CHECK (timeframe = ANY (ARRAY['D1','H8','H4','H2','H1','M30','M15','M5']::text[]));

COMMIT;
