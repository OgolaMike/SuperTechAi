import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Search, Volume2 } from 'lucide-react';
import type { Asset } from '@/lib/sma';

const MAX_SELECTED = 10;

type Props = {
  assets: Asset[];
  selected: string[];
  onChange: (symbols: string[]) => void;
  soundsEnabled: boolean;
  onToggleSounds: () => void;
};

export function AssetSelector({ assets, selected, onChange, soundsEnabled, onToggleSounds }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return assets;
    return assets.filter((asset) =>
      `${asset.name} ${asset.symbol} ${asset.fullName}`.toLowerCase().includes(term),
    );
  }, [assets, query]);
  const selectedNames = assets
    .filter((asset) => selected.includes(asset.symbol))
    .map((asset) => asset.name);

  useEffect(() => {
    if (!open) return;
    const onDocumentPointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocumentPointerDown);
    return () => document.removeEventListener('mousedown', onDocumentPointerDown);
  }, [open]);

  const toggle = (symbol: string) => {
    if (selected.includes(symbol)) {
      if (selected.length === 1) return;
      onChange(selected.filter((item) => item !== symbol));
      return;
    }
    if (selected.length < MAX_SELECTED) onChange([...selected, symbol]);
  };

  return (
    <div ref={ref} className="relative w-full sm:w-auto">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-xl border border-line/10 bg-surface/[0.03] px-3 py-2 text-left transition-colors hover:border-line/20 hover:bg-surface/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 sm:w-80 sm:flex-none"
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className="min-w-0">
            <span className="block break-words text-sm font-semibold text-ink">
              {selectedNames.length === 1 ? selectedNames[0] : `${selected.length} assets monitored`}
            </span>
            <span className="block break-words text-xs uppercase tracking-wider text-ink-3">
              Choose up to {MAX_SELECTED} assets
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 flex-shrink-0 text-ink-2" />
        </button>
        <button
          type="button"
          onClick={onToggleSounds}
          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
            soundsEnabled
              ? 'border-accent/40 bg-accent/10 text-accent'
              : 'border-line/10 bg-surface/[0.03] text-ink-3 hover:text-ink-2'
          }`}
          aria-label={soundsEnabled ? 'Mute signal sounds' : 'Enable signal sounds'}
          title={soundsEnabled ? 'Signal sounds on' : 'Enable signal sounds'}
        >
          <Volume2 className="h-4 w-4" />
        </button>
      </div>

      {open && (
        <div className="absolute right-0 z-30 mt-2 max-h-[min(70vh,32rem)] w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line/10 bg-canvas/95 p-2 shadow-2xl backdrop-blur-xl">
          <div className="mb-2 flex items-center justify-between px-1 text-xs uppercase tracking-wider text-ink-3">
            <span>{selected.length}/{MAX_SELECTED} selected</span>
            <span>All Deriv markets</span>
          </div>
          <label className="mb-2 flex items-center gap-2 rounded-lg border border-line/10 bg-surface/[0.03] px-2.5 py-2">
            <Search className="h-4 w-4 text-ink-3" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search symbol or market"
              className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
              autoFocus
            />
          </label>
          <div role="listbox" aria-multiselectable="true" className="max-h-80 overflow-y-auto">
            {filtered.map((asset) => {
              const active = selected.includes(asset.symbol);
              const disabled = !active && selected.length >= MAX_SELECTED;
              return (
                <button
                  key={asset.symbol}
                  type="button"
                  role="option"
                  aria-selected={active}
                  disabled={disabled}
                  onClick={() => toggle(asset.symbol)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors ${
                    active
                      ? 'bg-accent/10 text-accent'
                      : disabled
                      ? 'cursor-not-allowed text-ink-3/50'
                      : 'text-ink hover:bg-surface/5'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block break-words text-sm font-medium">{asset.name}</span>
                    <span className="block break-words text-xs uppercase tracking-wider text-ink-3">
                      {asset.symbol} · {asset.fullName}
                    </span>
                  </span>
                  {active && <Check className="h-4 w-4 flex-shrink-0 text-accent" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
