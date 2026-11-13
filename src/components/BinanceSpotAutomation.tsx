import { useCallback, useEffect, useState } from 'react';
import { CircleHelp, KeyRound, RefreshCw, ShieldCheck, Unplug, Wallet } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Settings = {
  connection_status: string;
  auto_trade_enabled: boolean;
  live_execution_enabled: boolean;
  emergency_stop: boolean;
  risk_percent: number | string;
  max_open_positions: number;
  allowed_symbols: string[] | null;
  api_key_last4: string | null;
  last_checked_at: string | null;
  last_error_code: string | null;
};
type Order = {
  id: string; symbol: string; side: string; order_kind: string; entry_price: number;
  quantity: number; stop_loss: number | null; take_profit: number | null; status: string;
  broker_order_list_id: string | null; created_at: string;
};
type AccountBalance = { asset: string; free: number; locked: number };

async function callBinance(action: string, payload: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke('binance-spot', { body: { action, ...payload } });
  if (error) {
    const response = (error as { context?: Response }).context;
    if (response && typeof response.text === 'function') {
      const raw = await response.clone().text().catch(() => '');
      let detail: { error?: string; message?: string } | null = null;
      try { detail = JSON.parse(raw); } catch { /* Keep the HTTP response as the fallback. */ }
      const reason = detail?.error ?? detail?.message ?? ((raw && raw.length < 240 ? raw : '') || error.message || `Binance Spot request failed (${response.status}).`);
      if (/invalid api-key, ip, or permissions/i.test(reason)) {
        throw new Error('Binance rejected this API key. Check that the key and secret are correct and Spot trading permission is enabled. If IP restrictions are enabled, whitelist the SuperTech server egress IPs; recent connection logs have shown 35.180.109.45 and 15.237.127.167. Never enable withdrawals.');
      }
      throw new Error(reason);
    }
    throw new Error(error.message || 'Binance Spot request failed. Check the connection and try again.');
  }
  if (!data?.ok) throw new Error(data?.error ?? data?.message ?? 'Binance Spot request failed.');
  return data;
}

export function BinanceSpotAutomation() {
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [keyType, setKeyType] = useState<'ed25519' | 'hmac'>('ed25519');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [balances, setBalances] = useState<AccountBalance[]>([]);
  const [maxOpen, setMaxOpen] = useState('3');
  const [autoTrade, setAutoTrade] = useState(false);
  const [liveExecution, setLiveExecution] = useState(false);
  const [emergencyStop, setEmergencyStop] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setError('');
    try {
      const result = await callBinance('status');
      const next = result.settings as Settings | null;
      setSettings(next);
      setOrders((result.orders ?? []) as Order[]);
      if (next) {
        setMaxOpen(String(next.max_open_positions ?? 3));
        setAutoTrade(Boolean(next.auto_trade_enabled));
        setLiveExecution(Boolean(next.live_execution_enabled));
        setEmergencyStop(next.emergency_stop !== false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load Binance Spot settings.');
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const connect = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await callBinance('connect', { apiKey, apiSecret, keyType });
      setBalances((result.account?.balances ?? []) as AccountBalance[]);
      setApiKey(''); setApiSecret('');
      setMessage('Binance Spot account connected. Automation remains OFF until you explicitly arm it.');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect Binance account.');
    } finally { setBusy(false); }
  };

  const testConnection = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await callBinance('test_connection');
      setBalances((result.account?.balances ?? []) as AccountBalance[]);
      setMessage('Binance API connection verified.');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Binance connection test failed.');
    } finally { setBusy(false); }
  };

  const saveSettings = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      await callBinance('settings', {
        maxOpenPositions: Number(maxOpen),
        autoTradeEnabled: autoTrade,
        liveExecutionEnabled: liveExecution,
        emergencyStop,
      });
      setMessage('Binance Spot automation settings saved.');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save Binance Spot settings.');
    } finally { setBusy(false); }
  };

  const disconnect = async () => {
    if (!window.confirm('Disconnect Binance Spot? This disables new automated orders. Existing exchange orders are not cancelled automatically.')) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await callBinance('disconnect');
      setBalances([]);
      setMessage('Binance disconnected. Existing exchange orders were left untouched.');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not disconnect Binance.');
    } finally { setBusy(false); }
  };

  const connected = settings?.connection_status === 'connected';

  return (
    <section className="mt-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Binance Spot automation</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Connect Binance Spot</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-2">
            Connect a Spot API key. SuperTechAi places BUY LIMIT entries with Binance OTOCO take-profit and stop-loss exits; partial fills are reconciled by cancelling the remainder and attaching an OCO exit to the filled quantity.
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-medium ${connected ? 'border-up/20 bg-up/10 text-up' : 'border-amber-400/20 bg-amber-400/10 text-amber-500'}`}>
          {connected ? 'Connected' : 'Not connected'}
        </span>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-line/10 bg-surface/[0.04] p-5">
          <div className="mb-4 flex items-center gap-2"><KeyRound className="h-5 w-5 text-accent" /><h3 className="font-semibold text-ink">API connection</h3></div>
          {!connected ? (
            <div className="space-y-3">
              <label className="block text-xs font-medium text-ink-2">Binance API Key
                <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" spellCheck={false} className="mt-1 w-full rounded-xl border border-line/15 bg-canvas px-3 py-3 text-sm text-ink outline-none focus:border-accent" placeholder="Paste API key" />
              </label>
              <label className="block text-xs font-medium text-ink-2">Binance key type
                <select value={keyType} onChange={(e) => setKeyType(e.target.value as 'ed25519' | 'hmac')} className="mt-1 w-full rounded-xl border border-line/15 bg-canvas px-3 py-3 text-sm text-ink outline-none focus:border-accent">
                  <option value="ed25519">Self-generated Ed25519</option>
                  <option value="hmac">System-generated API Secret (HMAC)</option>
                </select>
              </label>
              <label className="block text-xs font-medium text-ink-2">Binance API Secret or Ed25519 Private Key (PEM)
                <textarea value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} autoComplete="off" spellCheck={false} rows={5} className="mt-1 w-full resize-y rounded-xl border border-line/15 bg-canvas px-3 py-3 font-mono text-xs text-ink outline-none focus:border-accent" placeholder={"For Ed25519, paste the full PEM beginning with -----BEGIN PRIVATE KEY-----"} />
                <span className="mt-1 block text-[11px] leading-5 text-ink-3">Ed25519: paste the full private-key PEM, including BEGIN/END lines. HMAC: paste the Binance API Secret. Never share either credential.</span>
              </label>
              <button type="button" disabled={busy || !apiKey.trim() || !apiSecret.trim()} onClick={() => void connect()} className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
                {busy ? 'Connecting…' : 'Connect Binance Spot'}
              </button>
              {!apiKey.trim() || !apiSecret.trim() ? <p className="text-xs text-ink-3">Enter both your API key and API secret to enable connection.</p> : null}
              <div className="rounded-xl border border-accent/20 bg-accent/5 p-3 text-xs leading-5 text-ink-2">
                Before connecting the first account, the administrator must add <strong>BINANCE_CREDENTIALS_ENCRYPTION_KEY</strong> to Supabase Edge Function Secrets. Use a unique random value of at least 32 characters; never commit it to the repository.
              </div>
              <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs leading-5 text-ink-2">
                Create an API key with Spot trading permission only. Keep withdrawals disabled. Never paste your Binance credentials into chat.
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-line/10 bg-canvas/50 p-3">
                <div><p className="text-sm font-semibold text-ink">API key ending in ••••{settings?.api_key_last4}</p><p className="mt-1 text-xs text-ink-3">Credentials encrypted and stored server-side</p></div>
                <ShieldCheck className="h-5 w-5 text-up" />
              </div>
              <div className="flex flex-wrap gap-2">
                <button disabled={busy} onClick={() => void testConnection()} className="inline-flex items-center gap-2 rounded-xl border border-line/15 px-3 py-2 text-sm text-ink disabled:opacity-50"><RefreshCw className="h-4 w-4" />Test connection</button>
                <button disabled={busy} onClick={() => void disconnect()} className="inline-flex items-center gap-2 rounded-xl border border-line/15 px-3 py-2 text-sm text-ink disabled:opacity-50"><Unplug className="h-4 w-4" />Disconnect</button>
              </div>
              {balances.length > 0 && <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Available balances</p><div className="grid grid-cols-2 gap-2">{balances.slice(0, 8).map((b) => <div key={b.asset} className="rounded-lg border border-line/10 bg-canvas/50 p-2"><p className="text-xs text-ink-3">{b.asset}</p><p className="mt-1 text-sm font-semibold text-ink">{b.free.toLocaleString(undefined, { maximumFractionDigits: 6 })}</p></div>)}</div></div>}
            </div>
          )}
          {(message || error) && <div role="status" aria-live="polite" className={`mt-3 rounded-xl border p-3 text-sm ${error ? 'border-rose-500/20 bg-rose-500/5 text-rose-500' : 'border-up/20 bg-up/5 text-up'}`}>{error || message}</div>}
        </div>

        <div className="rounded-2xl border border-line/10 bg-surface/[0.04] p-5">
          <div className="mb-4 flex items-center gap-2"><Wallet className="h-5 w-5 text-accent" /><h3 className="font-semibold text-ink">Trading controls</h3></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-accent/20 bg-accent/5 px-3 py-2.5">
              <p className="text-xs font-medium text-ink-2">Risk per trade</p>
              <p className="mt-1 text-lg font-semibold text-ink">{Number(settings?.risk_percent ?? 3)}%</p>
              <p className="mt-1 text-[11px] leading-4 text-ink-3">Of current Binance USDT balance</p>
            </div>
            <label className="text-xs font-medium text-ink-2">Max active trades
              <input type="number" min="1" max="20" step="1" value={maxOpen} onChange={(e) => setMaxOpen(e.target.value)} className="mt-1 w-full rounded-xl border border-line/15 bg-canvas px-3 py-2.5 text-sm text-ink" />
            </label>
          </div>
          <div className="mt-3 rounded-xl border border-up/20 bg-up/5 p-3">
            <p className="text-sm font-semibold text-ink">Automatic Binance market access</p>
            <p className="mt-1 text-xs leading-5 text-ink-2">All eligible Binance USDT Spot pairs covered by SuperTech AI analysis are automatically permitted. An empty allowlist means all eligible pairs; the backend checks live exchange trading status and symbol rules before every order.</p>
          </div>
          <div className="mt-4 space-y-3 rounded-xl border border-line/10 bg-canvas/50 p-3">
            <label className="flex items-center justify-between gap-3 text-sm text-ink"><span>Enable automation</span><input type="checkbox" checked={autoTrade} onChange={(e) => setAutoTrade(e.target.checked)} /></label>
            <label className="flex items-center justify-between gap-3 text-sm text-ink"><span>Authorize live spot orders</span><input type="checkbox" checked={liveExecution} onChange={(e) => setLiveExecution(e.target.checked)} /></label>
            <label className="flex items-center justify-between gap-3 text-sm font-semibold text-rose-500"><span>Emergency stop</span><input type="checkbox" checked={emergencyStop} onChange={(e) => setEmergencyStop(e.target.checked)} /></label>
          </div>
          <button disabled={busy || !connected} onClick={() => void saveSettings()} className="mt-4 w-full rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm font-semibold text-ink disabled:opacity-50">Save trading controls</button>
          <p className="mt-3 text-xs leading-5 text-ink-3">Automation only runs when the account is connected, both permissions are enabled, and the emergency stop is OFF. Only currently active, supported USDT Spot pairs can trade. Position size adjusts to the entry-to-stop distance so planned risk is limited to 3% of the current Binance USDT balance; available free USDT and exchange minimums can reduce or prevent an order.</p>
        </div>
      </div>

      <div className="rounded-2xl border border-line/10 bg-surface/[0.04] p-5">
        <div className="flex items-start gap-3"><CircleHelp className="mt-0.5 h-5 w-5 flex-shrink-0 text-accent" /><div>
          <h3 className="font-semibold text-ink">How Binance Spot automation works</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-ink-2">
            <li>Uses the same closed-candle M15/M5/M1 confirmation and BUY LIMIT entry levels as the signal engine.</li>
            <li>When an entry is accepted, Binance OTOCO holds protective exits until the BUY limit fills. Partial fills are separately protected by an OCO exit after the scanner reconciles them.</li>
            <li>Spot is long-only here: bearish signals do not open borrowed or short positions.</li>
            <li>Unfilled entries expire after two hours. Only SuperTechAi-created orders are counted for its active-trade limit; unrelated exchange orders are not modified.</li>
            <li>Withdrawals are not used. Existing exchange orders are not automatically cancelled when you disconnect.</li>
          </ul>
        </div></div>
      </div>

      <div className="rounded-2xl border border-line/10 bg-surface/[0.04] p-5">
        <div className="mb-4 flex items-center justify-between gap-3"><h3 className="font-semibold text-ink">Automated order history</h3><button onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-lg border border-line/15 px-3 py-2 text-xs text-ink"><RefreshCw className="h-3.5 w-3.5" />Refresh</button></div>
        {orders.length === 0 ? <p className="text-sm text-ink-3">No Binance Spot automation orders yet.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-xs"><thead className="text-ink-3"><tr><th className="pb-2">Pair</th><th className="pb-2">Type</th><th className="pb-2">Entry</th><th className="pb-2">Quantity</th><th className="pb-2">Stop loss</th><th className="pb-2">Target</th><th className="pb-2">Status</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id} className="border-t border-line/10 text-ink"><td className="py-2.5 font-semibold">{order.symbol}</td><td>{order.order_kind}</td><td>{Number(order.entry_price).toPrecision(8)}</td><td>{Number(order.quantity).toPrecision(6)}</td><td>{order.stop_loss == null ? '—' : Number(order.stop_loss).toPrecision(8)}</td><td>{order.take_profit == null ? '—' : Number(order.take_profit).toPrecision(8)}</td><td>{order.status.replace(/_/g, ' ')}</td></tr>)}</tbody></table></div>}
      </div>
    </section>
  );
}
