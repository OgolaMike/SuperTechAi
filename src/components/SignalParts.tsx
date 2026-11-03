import { Check } from 'lucide-react';
import { formatDateTime, formatPrice } from '@/lib/sma';
import type { Direction, SignalStatus } from '@/lib/signals';

export const STATUS_TEXT: Record<SignalStatus, string> = {
  Open: 'Trade is open',
  TP1: 'First profit level reached',
  TP2: 'Second profit level reached',
  TP3: 'Final profit level reached',
  Stopped: 'Stop-loss reached',
};

export function statusTone(status: SignalStatus): string {
  if (status === 'Stopped') return 'border-down/40 bg-down/10 text-down';
  if (status === 'Open') return 'border-line/15 bg-surface/[0.04] text-ink-2';
  return 'border-up/40 bg-up/10 text-up';
}

export function directionExplanation(direction: Direction): string {
  return direction === 'BUY'
    ? 'The price has crossed above its average. The market may move up.'
    : 'The price has crossed below its average. The market may move down.';
}

type EntryTimeProps = { epoch: number; direction: Direction };

export function EntryTime({ epoch, direction }: EntryTimeProps) {
  const tone = direction === 'BUY' ? 'text-up' : 'text-down';
  return (
    <div className="rounded-xl border border-line/10 bg-surface/[0.04] px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-ink-3">Signal time</div>
      <div className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${tone}`}>{formatDateTime(epoch)}</div>
    </div>
  );
}

type CurrentPriceProps = { price: number | undefined; entry: number; direction: Direction; digits: number };

export function CurrentPrice({ price, entry, direction, digits }: CurrentPriceProps) {
  if (price === undefined) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-line/10 bg-surface/[0.02] px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">Live price</span>
        <span className="text-sm text-ink-3">Waiting for price</span>
      </div>
    );
  }
  const favourable = direction === 'BUY' ? price >= entry : price <= entry;
  const tone = favourable ? 'text-up' : 'text-down';
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line/10 bg-surface/[0.02] px-4 py-3">
      <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">Live price</span>
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
              {row.hitEpoch !== null ? `Reached at ${formatDateTime(row.hitEpoch)}` : row.hint}
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
