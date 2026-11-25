-- Official SuperTech AI timeframe standard:
-- M30, H1, H2, H3, H4, H6, H8, H12, D1, W1.
-- Legacy M1/M5/M15 records remain readable; NOT VALID avoids rewriting history
-- while enforcing the new standard for new inserts and updated rows.

BEGIN;

ALTER TABLE public.signal_records
  DROP CONSTRAINT IF EXISTS signal_records_timeframe_check;

ALTER TABLE public.signal_records
  ADD CONSTRAINT signal_records_timeframe_check
  CHECK (
    (timeframe = 'M30' AND granularity = 1800) OR
    (timeframe = 'H1' AND granularity = 3600) OR
    (timeframe = 'H2' AND granularity = 7200) OR
    (timeframe = 'H3' AND granularity = 10800) OR
    (timeframe = 'H4' AND granularity = 14400) OR
    (timeframe = 'H6' AND granularity = 21600) OR
    (timeframe = 'H8' AND granularity = 28800) OR
    (timeframe = 'H12' AND granularity = 43200) OR
    (timeframe = 'D1' AND granularity = 86400) OR
    (timeframe = 'W1' AND granularity = 604800)
  ) NOT VALID;

ALTER TABLE public.push_events
  DROP CONSTRAINT IF EXISTS push_events_timeframe_check;

ALTER TABLE public.push_events
  ADD CONSTRAINT push_events_timeframe_check
  CHECK (
    payload->>'timeframe' IS NULL OR
    payload->>'timeframe' IN (
      'M30','H1','H2','H3','H4','H6','H8','H12','D1','W1',
      '8/8','10/10','10TF'
    )
  ) NOT VALID;

ALTER TABLE public.mt5_signal_intents
  DROP CONSTRAINT IF EXISTS mt5_signal_intents_timeframe_check;

ALTER TABLE public.mt5_signal_intents
  ADD CONSTRAINT mt5_signal_intents_timeframe_check
  CHECK (timeframe = ANY (ARRAY[
    'M30','H1','H2','H3','H4','H6','H8','H12','D1','W1'
  ]::text[]))
  NOT VALID;

COMMIT;
