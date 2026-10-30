import { supabase } from '@/lib/supabase';

export type ScannerState = {
  connection_status: string;
  last_run_at: string | null;
  last_success_at: string | null;
  last_scan_symbols: number | null;
  last_scan_signals: number | null;
  last_error: string | null;
  last_error_at: string | null;
};

export type HealthLevel = 'up' | 'warn' | 'down' | 'unknown';

export type HealthAssessment = { level: HealthLevel; label: string };

const STALE_AFTER_MS = 3 * 60 * 1000;

export async function fetchScannerState(): Promise<ScannerState | null> {
  const { data, error } = await supabase
    .from('scanner_state')
    .select('connection_status, last_run_at, last_success_at, last_scan_symbols, last_scan_signals, last_error, last_error_at')
    .eq('id', 'main')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ScannerState | null) ?? null;
}

export function assessHealth(state: ScannerState | null, nowMs: number): HealthAssessment {
  if (!state) return { level: 'unknown', label: 'Waiting for the first scan' };
  const lastRun = state.last_run_at ? Date.parse(state.last_run_at) : NaN;
  if (!Number.isFinite(lastRun) || nowMs - lastRun > STALE_AFTER_MS) {
    return { level: 'down', label: 'Scanner is not running' };
  }
  if (state.connection_status !== 'connected') return { level: 'down', label: 'Market feed disconnected' };
  if (state.last_error) return { level: 'warn', label: 'Running with errors' };
  return { level: 'up', label: 'Scanning 24/7' };
}
