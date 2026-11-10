import { useEffect, useMemo, useState } from 'react';
import { Bell, BellOff, Check, Loader2, Search } from 'lucide-react';
import { usePushSettings, type PushStatus } from '@/hooks/usePushSettings';
import type { BoolPrefKey } from '@/lib/pushClient';
import type { Asset } from '@/lib/sma';

const CATEGORIES: { key: BoolPrefKey; label: string; description: string }[] = [
  { key: 'signals', label: 'New signals', description: 'A confirmed BUY or SELL crossover, with entry and levels.' },
  { key: 'targets', label: 'Target hits', description: 'TP1, TP2 or TP3 reached on a confirmed candle close.' },
  { key: 'stops', label: 'Stop-loss hits', description: 'A stop-loss reached on a confirmed candle close.' },
  { key: 'limitOrders', label: 'New limit-order signals', description: 'Confirmed limit-entry opportunities.' },
  { key: 'pendingOrders', label: 'Pending-order alerts', description: 'New confirmed pending-order setups.' },
  { key: 'superSignals', label: 'Super Signals', description: 'Alerts when all eight timeframes agree.' },
  { key: 'income', label: 'Income alerts', description: 'New commissions and earnings credited to your account.' },
  { key: 'business', label: 'Business alerts', description: 'New referrals and activated memberships.' },
];

const STATUS_TEXT: Record<PushStatus, string> = {
  checking: 'Checking this device…',
  unsupported: 'This browser does not support push notifications.',
  blocked: 'Notifications are blocked for this site. Allow them in your browser or phone settings, then try again.',
  off: 'Push notifications are off on this device.',
  on: 'Push notifications are on for this device.',
  working: 'Updating…',
};

type Props = { assets: Asset[] };

export function NotificationSettings({ assets }: Props) {
  const { status, prefs, error, enable, disable, updatePref, updateSymbols } = usePushSettings();
  const [draftSymbols, setDraftSymbols] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const isOn = status === 'on';
  const busy = status === 'working' || status === 'checking';
  const allSymbols = useMemo(() => assets.map((asset) => asset.symbol), [assets]);
  const selectedSymbols = prefs.symbols ?? allSymbols;
  const selectedSet = new Set(draftSymbols);
  const filteredAssets = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return assets;
    return assets.filter((asset) => `${asset.name} ${asset.symbol} ${asset.fullName}`.toLowerCase().includes(term));
  }, [assets, query]);
  const hasDraftChanges = draftSymbols.length !== selectedSymbols.length ||
    draftSymbols.some((symbol) => !selectedSymbols.includes(symbol));

  useEffect(() => {
    setDraftSymbols(selectedSymbols);
  }, [selectedSymbols.join('|')]);

  const applyAssetFilter = () => {
    const unique = [...new Set(draftSymbols)];
    // NULL means all assets, preserving future markets without needing another settings change.
    updateSymbols(unique.length === allSymbols.length && allSymbols.every((symbol) => unique.includes(symbol)) ? null : unique);
  };

  return (
    <section className="rounded-2xl border border-line/10 bg-surface/[0.03] p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Push notifications</p>
          <h2 className="text-lg font-semibold tracking-tight text-ink">Get alerts when the app is closed</h2>
          <p className="text-sm text-ink-2">{STATUS_TEXT[status]}</p>
        </div>
        <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border ${isOn ? 'border-up/30 bg-up/10 text-up' : 'border-line/10 bg-surface/[0.03] text-ink-2'}`}>
          {isOn ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
        </span>
      </div>

      {error && <div className="mt-4 rounded-xl border border-down/30 bg-down/10 px-4 py-3 text-sm text-down">{error}</div>}

      {status !== 'unsupported' && status !== 'checking' && (
        <div className="mt-6 flex flex-col gap-4">
          {isOn && (
            <div className="flex flex-col gap-2">
              {CATEGORIES.map((item) => (
                <ToggleRow key={item.key} label={item.label} description={item.description}
                  checked={prefs[item.key]} disabled={busy} onChange={(value) => updatePref(item.key, value)} />
              ))}
            </div>
          )}

          {assets.length > 0 && (
            <div className="flex flex-col gap-3 rounded-2xl border border-line/10 bg-surface/[0.035] px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold text-ink">Asset alert control</span>
                  <span className="text-xs text-ink-2">Choose which markets can send alerts to this device. Every asset remains in background scanning and market analysis.</span>
                </div>
                <span className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent">
                  {draftSymbols.length} / {assets.length} selected
                </span>
              </div>

              <label className="flex items-center gap-2 rounded-lg border border-line/10 bg-surface/[0.03] px-3 py-2">
                <Search className="h-4 w-4 text-ink-3" />
                <input value={query} onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search asset or symbol" className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3" />
              </label>

              <div className="grid max-h-64 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
                {filteredAssets.map((asset) => {
                  const checked = selectedSet.has(asset.symbol);
                  return (
                    <label key={asset.symbol} className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-ink transition-colors hover:bg-surface/[0.06]">
                      <input type="checkbox" checked={checked}
                        onChange={(event) => setDraftSymbols((current) => event.target.checked
                          ? [...current, asset.symbol]
                          : current.filter((symbol) => symbol !== asset.symbol))}
                        className="h-4 w-4 accent-[var(--color-accent)]" />
                      <span className="min-w-0 flex-1 truncate">{asset.name}</span>
                      <span className="text-xs text-ink-3">{asset.symbol}</span>
                    </label>
                  );
                })}
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={applyAssetFilter} disabled={busy || !hasDraftChanges}
                  className="inline-flex items-center gap-2 rounded-xl border border-accent/40 bg-gradient-to-r from-accent to-up px-4 py-2.5 text-sm font-bold text-canvas transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50">
                  <BellOff className="h-4 w-4" /> Mute all except selected
                </button>
                <button type="button" onClick={() => { setDraftSymbols(allSymbols); updateSymbols(null); }}
                  disabled={busy || (prefs.symbols === null && draftSymbols.length === allSymbols.length)}
                  className="rounded-xl border border-line/20 bg-surface/[0.05] px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-surface/[0.09] disabled:cursor-not-allowed disabled:opacity-50">
                  Allow all assets
                </button>
              </div>
              <p className="text-xs leading-relaxed text-ink-3">
                Muting only filters your alerts. It does not remove assets from the scanner, charts, price feeds, or Super Signal analysis. Income and business alerts are unaffected.
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            {isOn ? (
              <button type="button" onClick={disable} disabled={busy}
                className="inline-flex items-center gap-2 rounded-xl border border-line/20 bg-surface/[0.06] px-5 py-2.5 text-sm font-semibold text-ink shadow-sm transition-all hover:-translate-y-0.5 hover:border-down/40 hover:bg-down/10 hover:text-down disabled:cursor-not-allowed disabled:opacity-60">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Turn off on this device
              </button>
            ) : (
              <button type="button" onClick={enable} disabled={busy || status === 'blocked'}
                className="inline-flex items-center gap-2 rounded-xl border border-accent/40 bg-gradient-to-r from-accent to-up px-5 py-2.5 text-sm font-bold text-canvas shadow-[0_6px_22px_rgba(34,197,94,0.18)] transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Allow notifications
              </button>
            )}
          </div>
          <p className="text-xs leading-relaxed text-ink-3">
            Android: works in Chrome and in the installed app. iPhone and iPad: add the app to your Home Screen first, then allow notifications from inside it (iOS 16.4 or later). Notifications arrive while the device is online, even when tabs are closed.
          </p>
        </div>
      )}
    </section>
  );
}

function ToggleRow({ label, description, checked, disabled, onChange }: {
  label: string; description: string; checked: boolean; disabled: boolean; onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-line/10 bg-surface/[0.02] px-4 py-3">
      <div className="flex flex-col gap-0.5">
        <span id={`${label}-label`} className="text-sm font-medium text-ink">{label}</span>
        <span className="text-xs text-ink-2">{description}</span>
      </div>
      <button type="button" role="switch" aria-checked={checked} aria-labelledby={`${label}-label`}
        disabled={disabled} onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 flex-shrink-0 rounded-full border border-white/10 shadow-inner transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-60 ${checked ? 'bg-gradient-to-r from-accent to-up' : 'bg-line/25'}`}>
        <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-md ring-1 ring-black/10 transition-transform duration-300 ${checked ? 'translate-x-[20px]' : 'translate-x-0'}`} />
      </button>
    </div>
  );
}
