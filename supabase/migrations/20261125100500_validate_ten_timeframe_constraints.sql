-- Validate the expanded timeframe constraints after checking existing rows for legacy values.
ALTER TABLE public.signal_records
  VALIDATE CONSTRAINT signal_records_timeframe_check;

ALTER TABLE public.push_events
  VALIDATE CONSTRAINT push_events_timeframe_check;
