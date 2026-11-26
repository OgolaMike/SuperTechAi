import { useEffect, useState } from 'react';
import { CheckCircle2, Cloud, Volume2 } from 'lucide-react';
import type { Asset } from '@/lib/sma';
import {
  ALERT_CATEGORIES,
  loadAlertModes,
  loadMemberAlertModes,
  saveMemberAlertModes,
  type AlertMode,
  type AlertModeSettings,
  type AlertCategory,
} from '@/lib/alertPreferences';

type Props = { userId: string; assets: Asset[]; soundsEnabled: boolean; onToggleSounds: () => void };

export function IndependentAlertSettings({ userId, assets, soundsEnabled, onToggleSounds }: Props) {
  const [settings, setSettings] = useState<AlertModeSettings>(() => loadAlertModes(userId));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void loadMemberAlertModes(userId).then(value => { if (active) setSettings(value); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId]);

  const setCategory = (key: AlertCategory, mode: AlertMode) => {
    setSettings(current => ({ ...current, categories: { ...current.categories, [key]: mode } }));
    setMessage('');
  };
  const setAsset = (symbol: string, mode: AlertMode) => {
    setSettings(current => ({ ...current, assets: { ...current.assets, [symbol]: mode } }));
    setMessage('');
  };
  const save = async () => {
    setSaving(true); setError(''); setMessage('');
    try {
      const synced = await saveMemberAlertModes(settings, userId);
      setMessage(synced ? 'Your choices are saved and synced across devices.' : 'Saved on this device. Cloud sync will resume when the independent service is configured.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save your alert choices.');
    } finally {
      setSaving(false);
    }
  };

  const picker = (value: AlertMode, onChange: (mode: AlertMode) => void) =>
    <select value={value} onChange={event => onChange(event.target.value as AlertMode)} className="rounded-lg border border-line/15 bg-canvas px-3 py-2 text-xs font-semibold text-ink">
      <option value="full">Full</option><option value="bubble">Bubble</option><option value="muted">Mute</option>
    </select>;

  return <section className="mt-8 space-y-5">
    <div>
      <p className="text-xs font-semibold uppercase tracking-[.18em] text-accent">Your preferences</p>
      <h2 className="mt-1 text-2xl font-semibold text-ink">Alerts & notifications</h2>
      <p className="mt-2 text-sm text-ink-2">Choose what you see and hear. These settings do not change market analysis or trading rules.</p>
    </div>
    <div className="rounded-2xl border border-line/15 bg-surface/[.04] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2"><Volume2 className="h-4 w-4 text-accent"/><div><p className="text-sm font-semibold text-ink">Alert sounds</p><p className="text-xs text-ink-2">Control sounds on this device</p></div></div>
        <button type="button" onClick={onToggleSounds} className="rounded-lg border border-line/15 px-3 py-2 text-xs font-semibold text-ink">{soundsEnabled ? 'Turn sounds off' : 'Turn sounds on'}</button>
      </div>
    </div>
    {loading ? <p className="text-sm text-ink-2">Loading your saved choices…</p> : <>
      <div className="space-y-2">
        {ALERT_CATEGORIES.map(item => <div key={item.key} className="flex flex-col gap-2 rounded-xl border border-line/10 bg-surface/[.025] p-3 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-sm font-medium text-ink">{item.label}</p><p className="text-xs text-ink-2">{item.description}</p></div>
          {picker(settings.categories[item.key], mode => setCategory(item.key, mode))}
        </div>)}
      </div>
      <div className="rounded-2xl border border-line/15 bg-surface/[.04] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold text-ink">Asset alerts</p><p className="text-xs text-ink-2">Default for assets without an individual setting</p></div>{picker(settings.defaultAssetMode, mode => {setSettings(current => ({...current,defaultAssetMode:mode}));setMessage('');})}</div>
        {assets.length > 0 && <div className="mt-3 space-y-2 border-t border-line/10 pt-3">{assets.map(asset => <div key={asset.symbol} className="flex items-center justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm text-ink">{asset.name}</p><p className="text-[11px] text-ink-3">{asset.symbol}</p></div>{picker(settings.assets[asset.symbol] ?? settings.defaultAssetMode, mode => setAsset(asset.symbol, mode))}</div>)}</div>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void save()} disabled={saving} className="rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-canvas disabled:opacity-50">{saving ? 'Saving…' : 'Save my choices'}</button>
        {message && <p className="flex items-center gap-1.5 text-xs text-emerald-500"><CheckCircle2 className="h-4 w-4"/>{message}</p>}
        {error && <p role="alert" className="text-xs text-rose-400">{error}</p>}
      </div>
    </>}
  </section>;
}
