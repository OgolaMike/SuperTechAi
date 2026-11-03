-- Mark an earlier signal as closed when a confirmed opposite-direction signal appears.
ALTER TABLE signal_records ADD COLUMN IF NOT EXISTS reversed_epoch bigint;
ALTER TABLE signal_records DROP CONSTRAINT IF EXISTS signal_records_status_check;
ALTER TABLE signal_records ADD CONSTRAINT signal_records_status_check
  CHECK (status IN ('Open', 'TP1', 'TP2', 'TP3', 'Stopped', 'Reversed'));
