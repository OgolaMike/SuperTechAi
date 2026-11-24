-- Dual-engine timeframe policy: H4 macro + M15 precision; no M1/M5 signal stream.
BEGIN;

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

ALTER TABLE public.push_events
  DROP CONSTRAINT IF EXISTS push_events_timeframe_check;
ALTER TABLE public.push_events
  ADD CONSTRAINT push_events_timeframe_check
  CHECK (
    payload->>'timeframe' IS NULL OR
    payload->>'timeframe' IN ('D1','H8','H4','H3','H2','H1','M30','M15','8/8')
  ) NOT VALID;

-- Stop scheduling obsolete lower-timeframe scans; historical records remain available.
DELETE FROM public.scanner_candle_marks
WHERE granularity IN (60, 300);

COMMIT;
