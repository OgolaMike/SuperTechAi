-- Enforce the single supported SuperTech AI timeframe set across stored signals and scanner state.
BEGIN;

-- Remove legacy short-interval scanner progress and signal rows so they cannot be
-- reloaded into charts, records, alerts, or account execution proposals.
DELETE FROM public.scanner_candle_marks
WHERE granularity NOT IN (900, 1800, 3600, 7200, 10800, 14400, 28800, 86400);

DELETE FROM public.signal_records
WHERE NOT (
  (timeframe = 'D1' AND granularity = 86400) OR
  (timeframe = 'H8' AND granularity = 28800) OR
  (timeframe = 'H4' AND granularity = 14400) OR
  (timeframe = 'H3' AND granularity = 10800) OR
  (timeframe = 'H2' AND granularity = 7200) OR
  (timeframe = 'H1' AND granularity = 3600) OR
  (timeframe = 'M30' AND granularity = 1800) OR
  (timeframe = 'M15' AND granularity = 900)
);

DELETE FROM public.mt5_signal_intents
WHERE timeframe NOT IN ('D1','H8','H4','H3','H2','H1','M30','M15');

DELETE FROM public.push_events
WHERE payload->>'timeframe' IS NOT NULL
  AND payload->>'timeframe' NOT IN ('D1','H8','H4','H3','H2','H1','M30','M15','8/8');

ALTER TABLE public.mt5_signal_intents
  DROP CONSTRAINT IF EXISTS mt5_signal_intents_timeframe_check;
ALTER TABLE public.mt5_signal_intents
  ADD CONSTRAINT mt5_signal_intents_timeframe_check
  CHECK (timeframe = ANY (ARRAY['D1','H8','H4','H3','H2','H1','M30','M15']::text[]));

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
  );

COMMIT;
