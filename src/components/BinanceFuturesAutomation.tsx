import { useCallback, useEffect, useState } from 'react';
import { Activity, KeyRound, RefreshCw, ShieldAlert, ShieldCheck, Unplug, Wallet } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Settings = {
  connection_status: string; auto_trade_enabled: boolean; live_execution_enabled: boolean;
  emergency_stop: boolean; leverage: number; risk_percent: number | string;
  max_daily_loss_pct: number | string; max_open_positions: number; allowed_symbols: string[] | null;
  api_key_last4: string | null; account_label: string | null; last_checked_at: string | null;
  last_error_code: string | null;
};
type Order = { id: string; symbol: string; side: string; leverage: number; quantity: number; entry_price: number | null; stop_loss: number; take_profit: number; status: string; created_at: string };
type Position = { id: string; symbol: string; side: string; quantity: number; entry_price: number; mark_price: number | null; leverage: number; unrealized_pnl: number | null; status: string };

async function callFutures(action: string, payload: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke('binance-futures', { body: { action, ...payload } });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? 'Binance Futures request failed.');
  return data;
}

export function BinanceFuturesAutomation() {
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [leverage, setLeverage] = useState('1');
  const [risk, setRisk] = useState('0.5');
  const [dailyLoss, setDailyLoss] = useState('2');
  const [maxOpen, setMaxOpen] = useState('3');
  const [symbols, setSymbols] = useState('');
  const [autoTrade, setAutoTrade] = useState(false);
  const [liveExecution, setLiveExecution] = useState(false);
  const [emergencyStop, setEmergencyStop] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setError('');
    try {
      const result = await callFutures('status');
      const next = result.settings as Settings | null;
      setSettings(next);
      setOrders((result.orders ?? []) as Order[]);
      setPositions((result.positions ?? []) as Position[]);
      if (next) {
        setLeverage(String(next.leverage ?? 1));
        setRisk(String(next.risk_percent ?? 0.5));
        setDailyLoss(String(next.max_daily_loss_pct ?? 2));
        setMaxOpen(String(next.max_open_positions ?? 3));
        setSymbols((next.allowed_symbols ?? []).join(', '));
        setAutoTrade(Boolean(next.auto_trade_enabled));
        setLiveExecution(Boolean(next.live_execution_enabled));
        setEmergencyStop(next.emergency_stop !== false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load Futures settings.');
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const connect = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await callFutures('connect', { apiKey, apiSecret });
      setApiKey(''); setApiSecret('');
      setMessage(`Binance USDT-M Futures connected. ${result.account?.openPositions ?? 0} existing position(s) detected. Automation remains OFF.`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect Binance Futures.');
    } finally { setBusy(false); }
  };

  const testConnection = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await callFutures('test_connection');
      setMessage(`Connection verified. ${result.account?.openPositions ?? 0} open Futures position(s) detected.`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Futures connection test failed.');
    } finally { setBusy(false); }
  };

  const saveSettings = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const allowedSymbols = [...new Set(symbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean))];
      await callFutures('settings', {
        leverage: Number(leverage), riskPercent: Number(risk), maxDailyLossPct: Number(dailyLoss),
        maxOpenPositions: Number(maxOpen), allowedSymbols, autoTradeEnabled: autoTrade,
        liveExecutionEnabled: liveExecution, emergencyStop,
      });
      setMessage('Futures controls saved. Live order execution is not yet armed by the signal engine.');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save Futures settings.');
    } finally { setBusy(false); }
  };

  const disconnect = async () => {
    if (!window.confirm('Disconnect Binance Futures? This disables new automation. Existing exchange positions and orders will not be closed or cancelled.')) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await callFutures('disconnect');
      setMessage('Futures disconnected. Existing exchange positions and orders were left untouched.');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not disconnect Binance Futures.');
    } finally { setBusy(false); }
  };

  const connected = settings?.connection_status === 'connected';
  return (
    <section className="mt-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Binance Futures automation</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Super Signal Futures Trader</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-2">A separate USDT-M Futures connection for Super Signals. The execution rule is 8/8 agreement only; ordinary BUY/SELL signals and Spot automation do not qualify.</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-medium ${connected ? 'border-up/20 bg-up/10 text-up' : 'border-amber-400/20 bg-amber-400/10 text-amber-500'}`}>{connected ? 'Futures connected' : 'Not connected'}</span>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-line/10 bg-surface/[0.04] p-5">
          <div className="mb-4 flex items-center gap-2"><KeyRound className="h-5 w-5 text-accent" /><h3 className="font-semibold text-ink">Binance Futures API</h3></div>
          {!connected ? <div className="space-y-3">
            <label className="block text-xs font-medium text-ink-2">API Key<input value={apiKey} onChange={e => setApiKey(e.target.value)} autoComplete="off" spellCheck={false} className="mt-1 w-full rounded-xl border border-line/15 bg-canvas px-3 py-3 text-sm text-ink outline-none focus:border-accent" placeholder="Paste Futures-enabled API key" /></label>
            <label className="block text-xs font-medium text-ink-2">API Secret<input type="password" value={apiSecret} onChange={e => setApiSecret(e.target.value)} autoComplete="new-password" className="mt-1 w-full rounded-xl border border-line/15 bg-canvas px-3 py-3 text-sm text-ink outline-none focus:border-accent" placeholder="Paste API secret" /></label>
            <button disabled={busy || !apiKey.trim() || !apiSecret.trim()} onClick={() => void connect()} className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Connecting…' : 'Connect USDT-M Futures'}</button>
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs leading-5 text-ink-2">Use a dedicated Binance API key with Futures trading permission only. Keep withdrawals disabled, restrict access by IP where possible, and never share the key in chat.</div>
          </div> : <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-line/10 bg-canvas/50 p-3"><div><p className="text-sm font-semibold text-ink">Key ending ••••{settings?.api_key_last4}</p><p className="mt-1 text-xs text-ink-3">Encrypted on the server</p></div><ShieldCheck className="h-5 w-5 text-up" /></div>
            <div className="flex flex-wrap gap-2">
              <button disabled={busy} onClick={() => void testConnection()} className="inline-flex items-center gap-2 rounded-xl border border-line/15 px-3 py-2 text-sm text-ink disabled:opacity-50"><RefreshCw className="h-4 w-4" />Test connection</button>
              <button disabled={busy} onClick={() => void disconnect()} className="inline-flex items-center gap-2 rounded-xl border border-line/15 px-3 py-2 text-sm text-ink disabled:opacity-50"><Unplug className="h-4 w-4" />Disconnect</button>
            </div>
          </div>}
        </div>

        <div className="rounded-2xl border border-line/10 bg-surface/[0.04] p-5">
          <div className="mb-4 flex items-center gap-2"><Wallet className="h-5 w-5 text-accent" /><h3 className="font-semibold text-ink">Personal risk controls</h3></div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-ink-2">Leverage (1×–20×)<select value={leverage} onChange={e => setLeverage(e.target.value)} className="mt-1 w-full rounded-xl border border-line/15 bg-canvas px-3 py-2.5 text-sm text-ink">{Array.from({length:20},(_,i)=>i+1).map(v=><option key={v} value={v}>{v}×</option>)}</select></label>
            <label className="text-xs font-medium text-ink-2">Risk per trade<select value={risk} onChange={e => setRisk(e.target.value)} className="mt-1 w-full rounded-xl border border-line/15 bg-canvas px-3 py-2.5 text-sm text-ink">{['0.25','0.5','0.75','1','1.5','2'].map(v=><option key={v} value={v}>{v}%</option>)}</select></label>
            <label className="text-xs font-medium text-ink-2">Daily loss limit<select value={dailyLoss} onChange={e => setDailyLoss(e.target.value)} className="mt-1 w-full rounded-xl border border-line/15 bg-canvas px-3 py-2.5 text-sm text-ink">{['1','1.5','2','3','4','5'].map(v=><option key={v} value={v}>{v}%</option>)}</select></label>
            <label className="text-xs font-medium text-ink-2">Maximum open positions<input type="number" min="1" max="10" value={maxOpen} onChange={e => setMaxOpen(e.target.value)} className="mt-1 w-full rounded-xl border border-line/15 bg-canvas px-3 py-2.5 text-sm text-ink" /></label>
          </div>
          <label className="mt-3 block text-xs font-medium text-ink-2">Allowed Futures pairs (comma-separated)<input value={symbols} onChange={e => setSymbols(e.target.value)} className="mt-1 w-full rounded-xl border border-line/15 bg-canvas px-3 py-2.5 text-sm text-ink" placeholder="BTCUSDT, ETHUSDT, SOLUSDT" /></label>
          <div className="mt-4 space-y-3 rounded-xl border border-line/10 bg-canvas/50 p-3">
            <label className="flex items-center justify-between gap-3 text-sm text-ink"><span>Enable Super Signal automation</span><input type="checkbox" checked={autoTrade} onChange={e => setAutoTrade(e.target.checked)} /></label>
            <label className="flex items-center justify-between gap-3 text-sm text-ink"><span>Authorize live Futures orders</span><input type="checkbox" checked={liveExecution} onChange={e => setLiveExecution(e.target.checked)} /></label>
            <label className="flex items-center justify-between gap-3 text-sm font-semibold text-rose-500"><span>Emergency stop</span><input type="checkbox" checked={emergencyStop} onChange={e => setEmergencyStop(e.target.checked)} /></label>
          </div>
          <button disabled={busy || !connected} onClick={() => void saveSettings()} className="mt-4 w-full rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm font-semibold text-ink disabled:opacity-50">Save Futures controls</button>
          <p className="mt-3 text-xs leading-5 text-ink-3">Leverage is applied per member and per symbol by the execution engine. Risk sizing must be based on stop distance, not leverage alone. Settings are saved independently from Binance Spot.</p>
        </div>
      </div>

      <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm leading-6 text-ink-2">
        <div className="flex items-center gap-2 font-semibold text-ink"><ShieldAlert className="h-4 w-4 text-amber-500" />Execution safety</div>
        This connection and settings panel are deployed. Live order placement is intentionally not active yet: the scanner-to-Futures execution gate, exchange precision checks, daily-loss lockout and protective stop/target reconciliation must pass before any real trade can be sent. Enabling the switches here does not bypass that server-side gate.
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-line/10 bg-surface/[0.04] p-4"><p className="text-xs uppercase tracking-wide text-ink-3">Open positions shown</p><p className="mt-1 text-2xl font-semibold text-ink">{positions.filter(p=>p.status==='open').length}</p><p className="text-xs text-ink-3">Strategy-tracked positions</p></div>
        <div className="rounded-2xl border border-line/10 bg-surface/[0.04] p-4"><p className="text-xs uppercase tracking-wide text-ink-3">Recent Futures orders</p><p className="mt-1 text-2xl font-semibold text-ink">{orders.length}</p><p className="text-xs text-ink-3">SuperTechAi order ledger</p></div>
      </div>
      <div className="rounded-2xl border border-line/10 bg-surface/[0.04] p-5">
        <div className="mb-4 flex items-center justify-between gap-3"><h3 className="font-semibold text-ink">Futures order history</h3><button onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-lg border border-line/15 px-3 py-2 text-xs text-ink"><Activity className="h-3.5 w-3.5" />Refresh</button></div>
        {orders.length===0 ? <p className="text-sm text-ink-3">No Futures orders have been placed.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-xs"><thead className="text-ink-3"><tr><th className="pb-2">Pair</th><th className="pb-2">Side</th><th className="pb-2">Leverage</th><th className="pb-2">Quantity</th><th className="pb-2">Entry</th><th className="pb-2">Stop</th><th className="pb-2">Target</th><th className="pb-2">Status</th></tr></thead><tbody>{orders.map(o=><tr key={o.id} className="border-t border-line/10 text-ink"><td className="py-2.5 font-semibold">{o.symbol}</td><td>{o.side}</td><td>{o.leverage}×</td><td>{Number(o.quantity).toPrecision(6)}</td><td>{o.entry_price == null ? '—' : Number(o.entry_price).toPrecision(8)}</td><td>{Number(o.stop_loss).toPrecision(8)}</td><td>{Number(o.take_profit).toPrecision(8)}</td><td>{o.status.replace(/_/g,' ')}</td></tr>)}</tbody></table></div>}
      </div>
      {message && <div className="rounded-xl border border-up/20 bg-up/5 p-3 text-sm text-up">{message}</div>}
      {error && <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-sm text-rose-500">{error}</div>}
    </section>
  );
}
