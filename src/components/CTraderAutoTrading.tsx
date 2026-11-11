import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Cloud, ExternalLink, Link2, RefreshCw, ShieldCheck, Unplug } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type CTraderConnection = {
  id: string;
  ctrader_account_id: string;
  environment: 'demo' | 'live';
  broker_name: string;
  account_label: string | null;
  connection_status: string;
  token_expires_at: string | null;
  last_seen_at: string | null;
};
type CTraderSettings = {
  automation_enabled: boolean;
  unattended_execution_enabled: boolean;
  allow_live_execution: boolean;
  risk_per_trade_percent: number;
  daily_loss_limit_percent: number;
  max_open_positions: number;
  max_spread_pips: number;
  allowed_symbols: string[];
};

const DEFAULT_SETTINGS: CTraderSettings = {
  automation_enabled: false,
  unattended_execution_enabled: false,
  allow_live_execution: false,
  risk_per_trade_percent: 0.5,
  daily_loss_limit_percent: 2,
  max_open_positions: 1,
  max_spread_pips: 0,
  allowed_symbols: [],
};

export function CTraderAutoTrading() {
  const [connections, setConnections] = useState<CTraderConnection[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [settings, setSettings] = useState<CTraderSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const selected = connections.find((item) => item.id === selectedId) ?? connections[0] ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data, error: loadError } = await supabase
      .from('ctrader_connections')
      .select('id,ctrader_account_id,environment,broker_name,account_label,connection_status,token_expires_at,last_seen_at')
      .order('created_at', { ascending: false });
    if (loadError) setError(loadError.message);
    const rows = (data ?? []) as CTraderConnection[];
    setConnections(rows);
    setSelectedId((current) => rows.some((row) => row.id === current) ? current : rows[0]?.id ?? '');
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!selected) { setSettings(DEFAULT_SETTINGS); return; }
    let active = true;
    void supabase.from('ctrader_execution_settings')
      .select('automation_enabled,unattended_execution_enabled,allow_live_execution,risk_per_trade_percent,daily_loss_limit_percent,max_open_positions,max_spread_pips,allowed_symbols')
      .eq('connection_id', selected.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        setSettings(data ? { ...DEFAULT_SETTINGS, ...data } : DEFAULT_SETTINGS);
      });
    return () => { active = false; };
  }, [selected?.id]);

  const connect = async () => {
    setBusy(true); setError(''); setMessage('Opening secure cTrader authorisation…');
    const { data, error: invokeError } = await supabase.functions.invoke('ctrader-connect', { body: { redirectPath: '/' } });
    if (invokeError || !data?.authorizationUrl) {
      setError(invokeError?.message ?? data?.error ?? 'Could not start cTrader authorisation.');
      setBusy(false); setMessage(''); return;
    }
    window.location.assign(data.authorizationUrl);
  };

  const discover = async () => {
    setBusy(true); setError(''); setMessage('Finding the accounts you authorised…');
    const { data, error: invokeError } = await supabase.functions.invoke('ctrader-discover-accounts', { body: {} });
    if (invokeError || !data?.connected) {
      setError(invokeError?.message ?? data?.error ?? 'No authorised cTrader accounts were found.');
    } else {
      setMessage(`Connected ${data.discovered} cTrader account(s). Choose the account you want to use below.`);
      await load();
    }
    setBusy(false);
  };

  const saveSettings = async () => {
    if (!selected) return;
    setBusy(true); setError(''); setMessage('');
    const payload = {
      connection_id: selected.id,
      automation_enabled: false,
      unattended_execution_enabled: false,
      allow_live_execution: false,
      risk_per_trade_percent: settings.risk_per_trade_percent,
      daily_loss_limit_percent: settings.daily_loss_limit_percent,
      max_open_positions: settings.max_open_positions,
      max_spread_pips: settings.max_spread_pips,
      allowed_symbols: settings.allowed_symbols,
      updated_at: new Date().toISOString(),
    };
    const { error: saveError } = await supabase.from('ctrader_execution_settings').upsert(payload, { onConflict: 'connection_id' });
    if (saveError) setError(saveError.message);
    else setMessage('Risk preferences saved. Automated execution remains safely off until the cloud execution service is activated.');
    setBusy(false);
  };

  const disconnect = async () => {
    if (!window.confirm('Disconnect your cTrader authorisation from SuperTech AI?')) return;
    setBusy(true); setError(''); setMessage('');
    const { error: invokeError } = await supabase.functions.invoke('ctrader-disconnect', { body: {} });
    if (invokeError) setError(invokeError.message);
    else { setMessage('cTrader authorisation revoked.'); await load(); }
    setBusy(false);
  };

  return (
    <section className="mt-8 space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Cloud trading connection</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Connect cTrader</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-2">Connect your broker account once. Your phone is only the control panel; cloud automation is designed to keep running when you close the app.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading || busy} className="inline-flex items-center justify-center gap-2 rounded-xl border border-line/20 px-4 py-2.5 text-sm font-semibold text-ink disabled:opacity-50"><RefreshCw className="h-4 w-4" /> Refresh</button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-line/10 bg-surface/[0.04] p-5">
          <div className="flex items-center gap-3"><div className="rounded-xl bg-accent/10 p-3 text-accent"><Link2 className="h-5 w-5" /></div><div><h3 className="font-semibold text-ink">1. Connect your account</h3><p className="text-xs text-ink-2">Secure authorisation through cTrader</p></div></div>
          <p className="mt-4 text-sm leading-6 text-ink-2">Sign in with your cTrader ID and approve SuperTech AI. You do not need to share your broker password with us.</p>
          <button type="button" onClick={() => void connect()} disabled={busy} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Please wait…' : 'Connect cTrader'} <ExternalLink className="h-4 w-4" /></button>
          <button type="button" onClick={() => void discover()} disabled={busy} className="mt-2 w-full rounded-xl border border-line/20 px-4 py-2.5 text-sm font-semibold text-ink disabled:opacity-50">I have authorised cTrader — find my accounts</button>
        </div>

        <div className="rounded-2xl border border-line/10 bg-surface/[0.04] p-5">
          <div className="flex items-center gap-3"><div className="rounded-xl bg-accent/10 p-3 text-accent"><Cloud className="h-5 w-5" /></div><div><h3 className="font-semibold text-ink">2. Cloud execution</h3><p className="text-xs text-ink-2">Designed to work while you are offline</p></div></div>
          <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-amber-500"><Activity className="h-4 w-4" /> Cloud execution service not yet active</div>
          <p className="mt-2 text-sm leading-6 text-ink-2">Your account connection can be prepared here. The unattended trade engine and its scheduled cloud runner still need to be completed and tested before automatic orders can be enabled.</p>
          <div className="mt-4 rounded-xl border border-line/10 bg-canvas/50 p-3 text-xs leading-5 text-ink-2"><ShieldCheck className="mr-1 inline h-4 w-4 text-accent" /> Trading stays OFF until the cloud worker, broker permissions and safety checks are verified.</div>
        </div>
      </div>

      {error && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-500">{error}</div>}
      {message && <div role="status" className="rounded-xl border border-line/10 bg-surface/[0.04] p-3 text-sm text-ink-2">{message}</div>}

      <div className="rounded-2xl border border-line/10 bg-surface/[0.04] p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h3 className="font-semibold text-ink">Your connected accounts</h3><p className="mt-1 text-xs text-ink-2">Choose which account will be prepared for automation.</p></div>
          {selected && <button type="button" onClick={() => void disconnect()} disabled={busy} className="inline-flex items-center gap-2 self-start rounded-lg border border-red-500/30 px-3 py-2 text-xs font-semibold text-red-500 disabled:opacity-50"><Unplug className="h-4 w-4" /> Disconnect</button>}
        </div>
        {loading ? <p className="mt-4 text-sm text-ink-2">Loading accounts…</p> : connections.length === 0 ? <div className="mt-4 rounded-xl border border-dashed border-line/20 p-5 text-center text-sm text-ink-2">No cTrader account connected yet. Start with the Connect cTrader button above.</div> : (
          <div className="mt-4 space-y-3">
            <label className="block text-xs font-medium text-ink-2">Selected account
              <select value={selected?.id ?? ''} onChange={(event) => setSelectedId(event.target.value)} className="mt-1 w-full rounded-xl border border-line/20 bg-canvas px-3 py-3 text-sm text-ink">
                {connections.map((account) => <option key={account.id} value={account.id}>{account.broker_name} · {account.account_label ?? account.ctrader_account_id} · {account.environment.toUpperCase()}</option>)}
              </select>
            </label>
            {selected && <div className="flex flex-wrap items-center gap-2 text-xs"><span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 font-semibold text-emerald-500"><CheckCircle2 className="h-3.5 w-3.5" /> {selected.connection_status}</span><span className="rounded-full bg-surface/[0.08] px-2.5 py-1 text-ink-2">{selected.environment.toUpperCase()} account</span><span className="text-ink-2">Account ID: {selected.ctrader_account_id}</span></div>}
          </div>
        )}
      </div>

      {selected && <div className="rounded-2xl border border-line/10 bg-surface/[0.04] p-5">
        <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 text-accent" /><div><h3 className="font-semibold text-ink">3. Trading safety preferences</h3><p className="mt-1 text-xs leading-5 text-ink-2">Set your preferred limits now. These settings do not place trades or switch automation on.</p></div></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-ink-2">Risk per trade (%)
            <input type="number" min="0.1" max="1" step="0.1" value={settings.risk_per_trade_percent} onChange={(e) => setSettings(s => ({ ...s, risk_per_trade_percent: Number(e.target.value) }))} className="mt-1 w-full rounded-lg border border-line/20 bg-canvas px-3 py-2.5 text-sm text-ink" />
          </label>
          <label className="text-xs text-ink-2">Daily loss limit (%)
            <input type="number" min="0.5" max="5" step="0.5" value={settings.daily_loss_limit_percent} onChange={(e) => setSettings(s => ({ ...s, daily_loss_limit_percent: Number(e.target.value) }))} className="mt-1 w-full rounded-lg border border-line/20 bg-canvas px-3 py-2.5 text-sm text-ink" />
          </label>
          <label className="text-xs text-ink-2">Maximum open positions
            <input type="number" min="1" max="3" step="1" value={settings.max_open_positions} onChange={(e) => setSettings(s => ({ ...s, max_open_positions: Number(e.target.value) }))} className="mt-1 w-full rounded-lg border border-line/20 bg-canvas px-3 py-2.5 text-sm text-ink" />
          </label>
          <label className="text-xs text-ink-2">Maximum spread (pips)
            <input type="number" min="0" step="0.1" value={settings.max_spread_pips} onChange={(e) => setSettings(s => ({ ...s, max_spread_pips: Number(e.target.value) }))} className="mt-1 w-full rounded-lg border border-line/20 bg-canvas px-3 py-2.5 text-sm text-ink" />
          </label>
        </div>
        <button type="button" onClick={() => void saveSettings()} disabled={busy} className="mt-4 rounded-xl border border-accent/30 px-4 py-2.5 text-sm font-semibold text-accent disabled:opacity-50">Save safety preferences</button>
      </div>}
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs leading-5 text-ink-2"><AlertTriangle className="mr-1 inline h-4 w-4 text-amber-500" />Live trading requires cTrader trading permission and a successful end-to-end test. Connecting an account does not automatically enable live orders.</div>
    </section>
  );
}
