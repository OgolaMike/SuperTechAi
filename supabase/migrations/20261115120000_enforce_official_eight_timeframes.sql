-- Enforce the single supported SuperTech AI timeframe set across stored signals and scanner state.
BEGIN;

-- Remove legacy short-interval scanner progress so unsupported feeds cannot resume.
DELETE FROM public.scanner_candle_marks
WHERE granularity NOT IN (900, 1800, 3600, 7200, 10800, 14400, 28800, 86400);

-- Preserve old records for audit, but prevent them from appearing in member history
-- and prevent any new unsupported timeframe rows from being written.
ALTER TABLE public.signal_records
  DROP CONSTRAINT IF EXISTS signal_records_timeframe_check;
ALTER TABLE public.signal_records
  ADD CONSTRAINT signal_records_timeframe_check
  CHECK (
    (timeframe = 'D1' AND granularity = 86400) OR
    (timeframe = 'H8' AND granularity = 28800) OR
    (timeframe = 'H4' AND granularity = 14400) OR
    (timeframe = 'H3' AND granularity = 10800) OR
    (timeframe = 'H2' AND granularity = 7200) OR
    (timeframe = 'H1' AND granularity = 3600) OR
    (timeframe = 'M30' AND granularity = 1800) OR
    (timeframe = 'M15' AND granularity = 900)
  ) NOT VALID;

-- Retire queued legacy notifications without deleting their audit history.
UPDATE public.push_events
SET dispatched_at = COALESCE(dispatched_at, now())
WHERE payload->>'timeframe' IS NOT NULL
  AND payload->>'timeframe' NOT IN ('D1','H8','H4','H3','H2','H1','M30','M15','8/8');

ALTER TABLE public.push_events
  DROP CONSTRAINT IF EXISTS push_events_timeframe_check;
ALTER TABLE public.push_events
  ADD CONSTRAINT push_events_timeframe_check
  CHECK (
    payload->>'timeframe' IS NULL OR
    payload->>'timeframe' IN ('D1','H8','H4','H3','H2','H1','M30','M15','8/8')
  ) NOT VALID;

ALTER TABLE public.mt5_signal_intents
  DROP CONSTRAINT IF EXISTS mt5_signal_intents_timeframe_check;
ALTER TABLE public.mt5_signal_intents
  ADD CONSTRAINT mt5_signal_intents_timeframe_check
  CHECK (timeframe = ANY (ARRAY['D1','H8','H4','H3','H2','H1','M30','M15']::text[]));

COMMIT;
