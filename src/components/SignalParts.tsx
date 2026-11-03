import { Check } from 'lucide-react';
import { formatDateTime, formatPrice } from '@/lib/sma';
import type { Direction, SignalStatus } from '@/lib/signals';

export const STATUS_TEXT: Record<SignalStatus, string> = {
  Open: 'Open',
  TP1: 'Target 1 reached',
  TP2: 'Target 2 reached',
  TP3: 'Target 3 reached',
  Stopped: 'Stop-loss hit',
  Reversed: 'Reversed by opposite signal',
};

export function statusTone(status: SignalStatus): string {
  if (status === 'Stopped') return 'border-down/40 bg-down/10 text-down';
  if (status === 'Reversed') return 'border-warn/40 bg-warn/10 text-warn';
  if (status === 'Open') return 'border-line/15 bg-surface/[0.04] text-ink-2';
  return 'border-up/40 bg-up/10 text-up';
}

export function directionExplanation(direction: Direction): string {
  return direction === 'BUY'
    ? 'Price has moved up through its recent average, a sign of upward momentum.'
    : 'Price has moved down through its recent average, a sign of downward momentum.';
}

type EntryTimeProps = { epoch: number; direction: Direction };

export function EntryTime({ epoch, direction }: EntryTimeProps) {
  const tone = direction === 'BUY' ? 'text-up' : 'text-down';
  return (
    <div className="rounded-xl border border-line/10 bg-surface/[0.04] px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-ink-3">Entry time</div>
      <div className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${tone}`}>{formatDateTime(epoch)}</div>
    </div>
  );
}

type CurrentPriceProps = { price: number | undefined; entry: number; direction: Direction; digits: number };

export function CurrentPrice({ price, entry, direction, digits }: CurrentPriceProps) {
  if (price === undefined) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-line/10 bg-surface/[0.02] px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">Current price</span>
        <span className="text-sm text-ink-3">Waiting for live price</span>
      </div>
    );
  }
  const favourable = direction === 'BUY' ? price >= entry : price <= entry;
  const tone = favourable ? 'text-up' : 'text-down';
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line/10 bg-surface/[0.02] px-4 py-3">
      <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">Current price</span>
      <span className={`font-mono text-lg font-semibold tabular-nums ${tone}`}>{formatPrice(price, digits)}</span>
    </div>
  );
}

type LevelRow = {
  label: string;
  hint: string;
  value: number;
  hitEpoch: number | null;
  tone: string;
};

type LevelListProps = { rows: LevelRow[]; digits: number };

export function LevelList({ rows, digits }: LevelListProps) {
  return (
    <ul className="divide-y divide-line/10 overflow-hidden rounded-xl border border-line/10">
      {rows.map((row) => (
        <li key={row.label} className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink">
              {row.hitEpoch !== null && <Check className="h-4 w-4 flex-shrink-0 text-up" />}
              <span>{row.label}</span>
            </div>
            <div className="mt-0.5 text-xs leading-relaxed text-ink-3">
              {row.hitEpoch !== null ? `Hit at ${formatDateTime(row.hitEpoch)}` : row.hint}
            </div>
          </div>
          <span className={`flex-shrink-0 font-mono text-lg font-semibold tabular-nums ${row.tone}`}>
            {formatPrice(row.value, digits)}
          </span>
        </li>
      ))}
    </ul>
  );
}
