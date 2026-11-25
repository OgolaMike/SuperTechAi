import type { Toast } from '@/hooks/useSignalAlerts';

export type BubbleStatus = 'unopened' | 'opened' | 'expired' | 'dismissed';
export type ArchivedBubble = { toast: Toast; status: BubbleStatus; savedAt: number };
const STORAGE_KEY = 'supertech-bubble-history-v1';
const MAX_HISTORY = 500;

export function loadBubbleHistory(): ArchivedBubble[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(value) ? value as ArchivedBubble[] : [];
  } catch {
    return [];
  }
}

function writeHistory(rows: ArchivedBubble[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(0, MAX_HISTORY))); } catch { /* storage may be unavailable */ }
}

export function saveBubble(toast: Toast) {
  const rows = loadBubbleHistory();
  const index = rows.findIndex((row) => row.toast.id === toast.id);
  if (index >= 0) return;
  writeHistory([{ toast, status: 'unopened', savedAt: Date.now() }, ...rows]);
}

export function markBubble(id: string, status: BubbleStatus) {
  const rows = loadBubbleHistory();
  const index = rows.findIndex((row) => row.toast.id === id);
  if (index < 0) return;
  rows[index] = { ...rows[index], status };
  writeHistory(rows);
}
