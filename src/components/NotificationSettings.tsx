import { Bell, BellOff, Check, Loader2 } from 'lucide-react';
import { usePushSettings, type PushStatus } from '@/hooks/usePushSettings';
import type { BoolPrefKey } from '@/lib/pushClient';
import type { Asset } from '@/lib/sma';

const CATEGORIES: { key: BoolPrefKey; label: string; description: string }[] = [
  { key: 'signals', label: 'New signals', description: 'A confirmed BUY or SELL crossover, with entry and levels.' },
  { key: 'targets', label: 'Target hits', description: 'TP1, TP2 or TP3 reached on a confirmed candle close.' },
  { key: 'stops', label: 'Stop-loss hits', description: 'A stop-loss reached on a confirmed candle close.' },
  { key: 'limitOrders', label: 'New limit-order signals', description: 'New BUY LIMIT and SELL LIMIT setups, including entry price and signal strength.' },
];

const STATUS_TEXT: Record<PushStatus, string> = {
  checking: 'Checking this device…',
  unsupported: 'This browser does not support push notifications.',
  blocked: 'Notifications are blocked for this site. Allow them in your browser or phone settings, then try again.',
  off: 'Push notifications are off on this device.',
  on: 'Push notifications are on for this device.',
  working: 'Updating…',
};

type Props = {
  assets: Asset[];
};

export function NotificationSettings({ assets }: Props) {
  const { status, prefs, error, enable, disable, updatePref, updateSymbols } = usePushSettings();
  const isOn = status === 'on';
  const busy = status === 'working' || status === 'checking';
  const alertSymbols = prefs.symbols ?? assets.map((asset) => asset.symbol);

  const toggleAsset = (symbol: string) => {
    const next = alertSymbols.includes(symbol)
      ? alertSymbols.filter((item) => item !== symbol)
      : [...alertSymbols, symbol];
    updateSymbols(next);
  };

  return (
    <section className="rounded-2xl border border-line/10 bg-surface/[0.03] p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Push notifications</p>
          <h2 className="text-lg font-semibold tracking-tight text-ink">Get alerts when the app is closed</h2>
          <p className="text-sm text-ink-2">{STATUS_TEXT[status]}</p>
        </div>
        <span
          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border ${
            isOn ? 'border-up/30 bg-up/10 text-up' : 'border-line/10 bg-surface/[0.03] text-ink-2'
          }`}
        >
          {isOn ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
        </span>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-down/30 bg-down/10 px-4 py-3 text-sm text-down">{error}</div>
      )}

      {status === 'unsupported' || status === 'checking' ? null : (
        <div className="mt-6 flex flex-col gap-4">
          {isOn ? (
            <div className="flex flex-col gap-2">
              {CATEGORIES.map((item) => (
                <ToggleRow
                  key={item.key}
                  label={item.label}
                  description={item.description}
                  checked={prefs[item.key]}
                  disabled={busy}
                  onChange={(value) => updatePref(item.key, value)}
                />
              ))}
            </div>
          ) : null}

          {isOn && assets.length > 0 && (
            <div className="flex flex-col gap-3 rounded-xl border border-line/10 bg-surface/[0.02] px-4 py-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-ink">Assets that send alerts</span>
                <span className="text-xs text-ink-2">Pick which of your monitored assets should notify this device.</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {assets.map((asset) => {
                  const active = alertSymbols.includes(asset.symbol);
                  return (
                    <button
                      key={asset.symbol}
                      type="button"
                      aria-pressed={active}
                      disabled={busy}
                      onClick={() => toggleAsset(asset.symbol)}
                      className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60 ${
                        active
                          ? 'border-accent/40 bg-accent/10 text-accent'
                          : 'border-line/10 bg-surface/[0.02] text-ink-3 hover:text-ink-2'
                      }`}
                    >
                      {asset.name}
                    </button>
                  );
                })}
              </div>
              <span className="text-xs text-ink-3">
                {alertSymbols.length === 0
                  ? 'No assets selected, so this device will not receive alerts.'
                  : `Alerts for ${alertSymbols.length} of ${assets.length} monitored assets.`}
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            {isOn ? (
              <button
                type="button"
                onClick={disable}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-xl border border-line/10 bg-surface/[0.05] px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface/[0.09] disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Turn off on this device
              </button>
            ) : (
              <button
                type="button"
                onClick={enable}
                disabled={busy || status === 'blocked'}
                className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-canvas transition-transform duration-200 hover:scale-[1.02] disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Allow notifications
              </button>
            )}
          </div>

          <p className="text-xs leading-relaxed text-ink-3">
            Android: works in Chrome and in the installed app. iPhone and iPad: add the app to your Home Screen first, then
            allow notifications from inside it (iOS 16.4 or later). Desktop: Chrome, Edge and Firefox are supported.
            Notifications come from our server, so they arrive even when every tab is closed, as long as the device is online.
          </p>
        </div>
      )}
    </section>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-line/10 bg-surface/[0.02] px-4 py-3">
      <div className="flex flex-col gap-0.5">
        <span id={`${label}-label`} className="text-sm font-medium text-ink">
          {label}
        </span>
        <span className="text-xs text-ink-2">{description}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${label}-label`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors duration-200 disabled:opacity-60 ${
          checked ? 'bg-accent' : 'bg-line/20'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}
