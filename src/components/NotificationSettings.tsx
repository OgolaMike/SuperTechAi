import { useEffect, useMemo, useState } from 'react';
import { Bell, BellOff, Check, Loader2, Search } from 'lucide-react';
import { usePushSettings, type PushStatus } from '@/hooks/usePushSettings';
import type { Asset } from '@/lib/sma';
import {
  ALERT_CATEGORIES, loadAlertModes, loadMemberAlertModes, saveMemberAlertModes, type AlertMode, type AlertModeSettings,
} from '@/lib/alertPreferences';
import { useSession } from '@/lib/sessionContext';

const STATUS_TEXT: Record<PushStatus, string> = {
  checking: 'Checking this device…', unsupported: 'This browser does not support push notifications.',
  blocked: 'Notifications are blocked. Allow them in your browser or phone settings.',
  off: 'Push alerts are off on this device.', on: 'Push alerts are enabled on this device.', working: 'Updating…',
};
const MODE_LABEL: Record<AlertMode, string> = { full: 'Full', bubble: 'Bubble', muted: 'Mute' };
type Props = { assets: Asset[] };

export function NotificationSettings({ assets }: Props) {
  const { session } = useSession();
  const userId = session.user.id;
  const { status, error, enable, disable, saveAlertControls } = usePushSettings();
  const [settings, setSettings] = useState<AlertModeSettings>(() => loadAlertModes(userId));
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [saved, setSaved] = useState(true);
  const busy = status === 'working' || status === 'checking';
  const filteredAssets = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? assets.filter((a) => `${a.name} ${a.symbol} ${a.fullName}`.toLowerCase().includes(term)) : assets;
  }, [assets, query]);
  const fullCount = assets.filter((asset) => (settings.assets[asset.symbol] ?? settings.defaultAssetMode) === 'full').length;
  const bubbleCount = assets.filter((asset) => (settings.assets[asset.symbol] ?? settings.defaultAssetMode) === 'bubble').length;
  const mutedCount = assets.filter((asset) => (settings.assets[asset.symbol] ?? settings.defaultAssetMode) === 'muted').length;

  useEffect(() => {
    let cancelled = false;
    setLoadingSettings(true);
    loadMemberAlertModes(userId).then((value) => { if (!cancelled) setSettings(value); })
      .catch((err: unknown) => { if (!cancelled) setSaveError(err instanceof Error ? err.message : 'Could not load your saved alert settings.'); })
      .finally(() => { if (!cancelled) setLoadingSettings(false); });
    return () => { cancelled = true; };
  }, [userId]);
  const change = (next: AlertModeSettings) => { setSettings(next); setSaved(false); };
  const setCategory = (key: keyof AlertModeSettings['categories'], mode: AlertMode) =>
    change({ ...settings, categories: { ...settings.categories, [key]: mode } });
  const setAsset = (symbol: string, mode: AlertMode) =>
    change({ ...settings, assets: { ...settings.assets, [symbol]: mode } });
  const save = async () => {
    setSaveError(null);
    try {
      await saveMemberAlertModes(settings, userId);
      await saveAlertControls(settings);
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save your alert choices.');
    }
  };
  const setAllAssets = (mode: AlertMode) => change({ ...settings, defaultAssetMode: mode, assets: {} });

  return (
    <section className="rounded-2xl border border-line/10 bg-surface/[0.03] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Your alert controls</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-ink">Choose what reaches you</h2>
          <p className="mt-1 text-sm text-ink-2">{STATUS_TEXT[status]}</p>
        </div>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 text-accent">
          {status === 'on' ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
        </span>
      </div>
      {(error || saveError) && <p className="mt-3 rounded-xl border border-down/25 bg-down/10 px-3 py-2 text-sm text-down">{saveError ?? error}</p>}

      {loadingSettings ? <p className="mt-5 text-sm text-ink-2">Loading your saved alert choices…</p> : <div className="mt-5 space-y-5">
        <div>
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-ink">1. Choose the trade alerts</h3>
            <p className="text-xs text-ink-2">Set each type independently.</p>
          </div>
          <div className="space-y-2">
            {ALERT_CATEGORIES.map((item) => (
              <div key={item.key} className="flex flex-col gap-2 rounded-xl border border-line/10 bg-surface/[0.025] p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{item.label}</p>
                  <p className="text-xs text-ink-2">{item.description}</p>
                </div>
                <ModePicker value={settings.categories[item.key]} onChange={(mode) => setCategory(item.key, mode)} />
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-line/10 pt-4">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-ink">2. Choose the assets</h3>
              <p className="text-xs text-ink-2">Assets not individually changed use your default.</p>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] font-medium">
              <span className="rounded-full bg-up/10 px-2 py-1 text-up">{fullCount} full</span>
              <span className="rounded-full bg-accent/10 px-2 py-1 text-accent">{bubbleCount} bubbles</span>
              <span className="rounded-full bg-surface/[0.08] px-2 py-1 text-ink-2">{mutedCount} muted</span>
            </div>
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-ink-2">Default for other assets:</span>
            <ModePicker value={settings.defaultAssetMode} onChange={(mode) => change({ ...settings, defaultAssetMode: mode })} />
          </div>
          <label className="mb-2 flex items-center gap-2 rounded-lg border border-line/10 bg-surface/[0.03] px-3 py-2">
            <Search className="h-4 w-4 text-ink-3" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find an asset or symbol"
              className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3" />
          </label>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {filteredAssets.map((asset) => (
              <div key={asset.symbol} className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 hover:bg-surface/[0.05]">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{asset.name}</p>
                  <p className="text-[11px] text-ink-3">{asset.symbol}</p>
                </div>
                <ModePicker value={settings.assets[asset.symbol] ?? settings.defaultAssetMode} onChange={(mode) => setAsset(asset.symbol, mode)} />
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => setAllAssets('full')} className="rounded-lg border border-up/25 px-3 py-2 text-xs font-semibold text-up">All full</button>
            <button type="button" onClick={() => setAllAssets('bubble')} className="rounded-lg border border-accent/25 px-3 py-2 text-xs font-semibold text-accent">All bubbles</button>
            <button type="button" onClick={() => setAllAssets('muted')} className="rounded-lg border border-line/20 px-3 py-2 text-xs font-semibold text-ink-2">Mute all</button>
          </div>
        </div>

        <div className="rounded-xl border border-line/10 bg-surface/[0.025] p-3">
          <h3 className="text-sm font-semibold text-ink">What each setting means</h3>
          <p className="mt-1 text-xs leading-relaxed text-ink-2"><b>Full:</b> alert bubble, sound and push notification when enabled. <b>Bubble:</b> show quietly inside SuperTech AI without sound or push. <b>Mute:</b> hide the alert completely. Your choices only affect your alerts; market scanning and trade automation continue.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {status === 'on' ? (
            <button type="button" onClick={disable} disabled={busy} className="rounded-xl border border-line/20 px-4 py-2.5 text-sm font-semibold text-ink disabled:opacity-50">
              {busy && <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />} Turn off push on this device
            </button>
          ) : status !== 'unsupported' && (
            <button type="button" onClick={enable} disabled={busy || status === 'blocked'} className="rounded-xl bg-gradient-to-r from-accent to-up px-4 py-2.5 text-sm font-bold text-canvas disabled:opacity-50">
              {busy ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : <Bell className="mr-2 inline h-4 w-4" />} Enable push alerts
            </button>
          )}
          <button type="button" onClick={save} disabled={saved || busy || loadingSettings} className="rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-canvas disabled:cursor-not-allowed disabled:opacity-40">
            <Check className="mr-2 inline h-4 w-4" /> {saved ? 'Saved' : 'Save my choices'}
          </button>
        </div>
      </div>}
    </section>
  );
}

function ModePicker({ value, onChange }: { value: AlertMode; onChange: (mode: AlertMode) => void }) {
  return (
    <div className="inline-flex shrink-0 rounded-lg border border-line/15 bg-surface/[0.04] p-0.5" role="group" aria-label="Alert behaviour">
      {(['full', 'bubble', 'muted'] as AlertMode[]).map((mode) => (
        <button key={mode} type="button" onClick={() => onChange(mode)} aria-pressed={value === mode}
          className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${value === mode ? mode === 'full' ? 'bg-up/15 text-up' : mode === 'bubble' ? 'bg-accent/15 text-accent' : 'bg-surface/[0.12] text-ink' : 'text-ink-3 hover:text-ink'}`}>
          {MODE_LABEL[mode]}
        </button>
      ))}
    </div>
  );
}
