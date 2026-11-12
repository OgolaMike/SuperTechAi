import { Check } from 'lucide-react';
import { formatDateTime, formatPrice } from '@/lib/sma';
import type { Direction, SignalStatus } from '@/lib/signals';

export const STATUS_TEXT: Record<SignalStatus, string> = {
  Open: 'Trade is open',
  TP1: 'First profit level reached',
  TP2: 'Second profit level reached',
  TP3: 'TAKE PROFIT 3 reached',
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
    <div className="min-w-0 w-full rounded-xl border border-line/10 bg-surface/[0.04] px-3 py-3 sm:px-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-ink-3">Signal time</div>
      <div className={`mt-1 min-w-0 break-words font-mono text-base font-semibold leading-relaxed tabular-nums sm:text-xl lg:text-2xl ${tone}`}>{formatDateTime(epoch)}</div>
    </div>
  );
}

type CurrentPriceProps = { price: number | undefined; entry: number; direction: Direction; digits: number };

export function CurrentPrice({ price, entry, direction, digits }: CurrentPriceProps) {
  if (price === undefined) {
    return (
      <div className="flex min-w-0 w-full flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-line/10 bg-surface/[0.02] px-3 py-3 sm:px-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">Live price</span>
        <span className="min-w-0 break-words text-sm text-ink-3">Waiting for price</span>
      </div>
    );
  }
  const favourable = direction === 'BUY' ? price >= entry : price <= entry;
  const tone = favourable ? 'text-up' : 'text-down';
  return (
    <div className="flex min-w-0 w-full flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-line/10 bg-surface/[0.02] px-3 py-3 sm:px-4">
      <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">Live price</span>
      <span className={`min-w-0 max-w-full break-all text-right font-mono text-base font-semibold tabular-nums sm:text-lg ${tone}`}>{formatPrice(price, digits)}</span>
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
    <ul className="w-full min-w-0 divide-y divide-line/10 overflow-hidden rounded-xl border border-line/10">
      {rows.map((row) => (
        <li key={row.label} className={`level-dial flex w-full min-w-0 flex-col items-stretch gap-2 rounded-xl border px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-4 sm:py-4 lg:px-5 ${row.tone === 'text-entry' ? 'level-dial-entry' : row.tone === 'text-down' ? 'level-dial-down' : row.tone === 'text-up' ? 'level-dial-up' : 'level-dial-neutral'} ${row.hitEpoch !== null ? 'level-dial-hit' : 'level-dial-pending'}`}>
          <div className="min-w-0 w-full sm:flex-1">
            <div className={`flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-base font-bold leading-snug sm:text-lg lg:text-xl ${row.tone}`}>
              {row.hitEpoch !== null && <Check className="h-5 w-5 flex-shrink-0 text-up" />}
              <span className="min-w-0 max-w-full break-words">{row.label}</span>
            </div>
            <div className="mt-1 min-w-0 break-words text-xs leading-relaxed text-ink-2">
              {row.hitEpoch !== null ? `Reached at ${formatDateTime(row.hitEpoch)}` : row.hint}
            </div>
          </div>
          <span className={`block min-w-0 max-w-full break-all text-left font-mono text-lg font-extrabold leading-snug tabular-nums sm:flex-shrink-0 sm:text-right sm:text-xl lg:text-2xl ${row.tone}`}>
            {formatPrice(row.value, digits)}
          </span>
        </li>
      ))}
    </ul>
  );
}
