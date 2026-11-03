import { useEffect, useState } from 'react';
import { AlertTriangle, Bot, Cable, CircleHelp, Copy, LockKeyhole, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type PairResult = { ok: boolean; workerId: string; workerToken: string; message: string };
type SyncResult = {
  login?: string; server?: string; currency?: string; balance?: number; equity?: number; margin_free?: number;
  pending_orders?: Array<{ ticket: number; symbol: string; type: number; volume_current: number; price_open: number }>;
  positions?: Array<{ ticket: number; symbol: string; type: number; volume: number; price_open: number; price_current: number; profit: number }>;
  count?: number;
};
type SyncCommand = { command_type: string; status: string; result?: SyncResult | null; error_code?: string | null };
type PreflightCommand = { id: string; status: string; result?: Record<string, unknown> | null; error_code?: string | null; created_at: string; completed_at?: string | null };
type InventoryItem = {
  object_type: 'pending_order' | 'position'; ticket: number; symbol: string;
  side_or_type: number; volume: number; price_open: number; price_current: number | null;
  stop_loss: number; take_profit: number; profit: number | null;
  magic_number: number; broker_comment: string; ownership_status: string; last_seen_at: string;
};

export function Mt5AutoTrading() {
  const [adoptPending, setAdoptPending] = useState(false);
  const [managePositions, setManagePositions] = useState(false);
  const [placeNewOrders, setPlaceNewOrders] = useState(false);
  const [liveExecutionEnabled, setLiveExecutionEnabled] = useState(false);
  const [emergencyStop, setEmergencyStop] = useState(true);
  const [riskEnabled, setRiskEnabled] = useState(false);
  const [riskPerTrade, setRiskPerTrade] = useState('0.50');
  const [dailyLossLimit, setDailyLossLimit] = useState('2.00');
  const [maxOpenPositions, setMaxOpenPositions] = useState('3');
  const [maxSpreadPoints, setMaxSpreadPoints] = useState('0');
  const [maxSlippagePoints, setMaxSlippagePoints] = useState('0');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState('');
  const [accountLogin, setAccountLogin] = useState('');
  const [server, setServer] = useState('');
  const [pairing, setPairing] = useState(false);
  const [pairError, setPairError] = useState('');
  const [pairResult, setPairResult] = useState<PairResult | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState('not_connected');
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  const [syncId, setSyncId] = useState<string | null>(null);
  const [syncCommands, setSyncCommands] = useState<SyncCommand[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [inventoryBusy, setInventoryBusy] = useState(false);
  const [inventoryMessage, setInventoryMessage] = useState('');
  const [proposalSymbol, setProposalSymbol] = useState('');
  const [proposalType, setProposalType] = useState('BUY_STOP');
  const [proposalEntry, setProposalEntry] = useState('');
  const [proposalStopLoss, setProposalStopLoss] = useState('');
  const [proposalTakeProfit, setProposalTakeProfit] = useState('');
  const [preflightBusy, setPreflightBusy] = useState(false);
  const [preflightCommandId, setPreflightCommandId] = useState<string | null>(null);
  const [preflightCommand, setPreflightCommand] = useState<PreflightCommand | null>(null);
  const [preflightMessage, setPreflightMessage] = useState('');
  const [executionCommandId, setExecutionCommandId] = useState<string | null>(null);
  const [executionCommand, setExecutionCommand] = useState<PreflightCommand | null>(null);
  const [executionMessage, setExecutionMessage] = useState('');
  const [executionBusy, setExecutionBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const { data } = await supabase.from('mt5_account_settings')
        .select('bridge_status,last_seen_at')
        .maybeSingle();
      if (active && data) {
        setBridgeStatus(data.bridge_status);
        setLastSeenAt(data.last_seen_at);
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 10000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    let active = true;
    const loadSettings = async () => {
      const { data } = await supabase.from('mt5_account_settings')
        .select('adopt_pending_orders,manage_existing_positions,place_new_orders,live_execution_enabled,emergency_stop,risk_controls_enabled,max_risk_per_trade_pct,max_daily_loss_pct,max_open_positions,max_spread_points,max_slippage_points')
        .maybeSingle();
      if (!active || !data) return;
      setAdoptPending(Boolean(data.adopt_pending_orders));
      setManagePositions(Boolean(data.manage_existing_positions));
      setPlaceNewOrders(Boolean(data.place_new_orders));
      setLiveExecutionEnabled(Boolean(data.live_execution_enabled));
      setEmergencyStop(data.emergency_stop !== false);
      setRiskEnabled(Boolean(data.risk_controls_enabled));
      setRiskPerTrade(String(data.max_risk_per_trade_pct ?? 0.5));
      setDailyLossLimit(String(data.max_daily_loss_pct ?? 2));
      setMaxOpenPositions(String(data.max_open_positions ?? 3));
      setMaxSpreadPoints(String(data.max_spread_points ?? 0));
      setMaxSlippagePoints(String(data.max_slippage_points ?? 0));
    };
    void loadSettings();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!syncId) return;
    let active = true;
    const refresh = async () => {
      const { data, error } = await supabase.functions.invoke('mt5-bridge', {
        body: { action: 'read_only_sync_status', syncId },
      });
      if (!active || error || !data?.commands) return;
      const commands = data.commands as SyncCommand[];
      setSyncCommands(commands);
      if (commands.length === 3 && commands.every((command) => command.status === 'succeeded' || command.status === 'failed')) {
        setSyncing(false);
        setSyncMessage('MT5 read-only sync finished.');
        if (timer) window.clearInterval(timer);
      }
    };
    const timer = window.setInterval(() => void refresh(), 3000);
    void refresh();
    return () => { active = false; window.clearInterval(timer); };
  }, [syncId]);

  useEffect(() => {
    if (!preflightCommandId) return;
    let active = true;
    const refresh = async () => {
      const { data, error } = await supabase.functions.invoke('mt5-bridge', {
        body: { action: 'pending_order_preflight_status', commandId: preflightCommandId },
      });
      if (!active || error || !data?.command) return;
      const command = data.command as PreflightCommand;
      setPreflightCommand(command);
      if (command.status === 'succeeded' || command.status === 'failed') {
        setPreflightBusy(false);
        setPreflightMessage(command.status === 'succeeded'
          ? 'Broker validation finished. No trade was placed.'
          : 'Broker validation could not be completed.');
        window.clearInterval(timer);
      }
    };
    const timer = window.setInterval(() => void refresh(), 2500);
    void refresh();
    return () => { active = false; window.clearInterval(timer); };
  }, [preflightCommandId]);

  useEffect(() => {
    if (!executionCommandId) return;
    let active = true;
    const refresh = async () => {
      const { data, error } = await supabase.functions.invoke('mt5-bridge', {
        body: { action: 'pending_order_execution_status', commandId: executionCommandId },
      });
      if (!active || error || !data?.command) return;
      const command = data.command as PreflightCommand;
      setExecutionCommand(command);
      if (command.status === 'succeeded' || command.status === 'failed') {
        setExecutionBusy(false);
        const state = command.result?.execution_state;
        setExecutionMessage(state === 'accepted'
          ? 'Broker accepted the order. Refresh MT5 inventory to verify its current status.'
          : state === 'uncertain'
            ? 'The send outcome is uncertain. The system did not resend it. Check the broker terminal before taking any further action.'
            : 'The broker rejected the order or a final safety check failed.');
        window.clearInterval(timer);
      }
    };
    const timer = window.setInterval(() => void refresh(), 2500);
    void refresh();
    return () => { active = false; window.clearInterval(timer); };
  }, [executionCommandId]);

  const approvePendingOrder = async () => {
    if (!preflightCommand || preflightCommand.status !== 'succeeded' ||
        preflightCommand.result?.preflight !== 'approved' ||
        preflightCommand.result?.dry_run_only !== true) {
      setExecutionMessage('A successful broker preflight is required first.');
      return;
    }
    const tradeMode = Number(preflightCommand.result?.account_trade_mode);
    const accountType = tradeMode === 2 ? 'REAL ACCOUNT' : tradeMode === 0 ? 'DEMO ACCOUNT' : 'CONTEST/UNKNOWN ACCOUNT';
    const confirmed = window.confirm([
      'MT5 PENDING ORDER APPROVAL',
      accountType,
      'Account: ' + String(preflightCommand.result?.account_login ?? 'unknown') + ' · ' + String(preflightCommand.result?.account_server ?? 'unknown'),
      proposalType + ' ' + proposalSymbol.toUpperCase(),
      'Entry: ' + proposalEntry,
      'Stop loss: ' + proposalStopLoss,
      'Take profit: ' + proposalTakeProfit,
      'This sends a real broker order to the connected account if final checks pass. Continue?'
    ].join('\n'));
    if (!confirmed) return;
    setExecutionBusy(true);
    setExecutionMessage('Requesting final server authorization…');
    setExecutionCommand(null);
    try {
      const { data, error } = await supabase.functions.invoke('mt5-bridge', {
        body: {
          action: 'approve_pending_order',
          preflightCommandId: preflightCommand.id,
          idempotencyKey: crypto.randomUUID(),
        },
      });
      if (error) throw error;
      if (!data?.ok || !data.commandId) throw new Error(data?.error ?? 'Live execution approval was refused.');
      setExecutionCommandId(data.commandId);
      setExecutionMessage('Approved request queued. MT5 worker will repeat the checks before sending.');
    } catch (error) {
      setExecutionBusy(false);
      setExecutionMessage(error instanceof Error ? error.message : 'Could not approve the order.');
    }
  };

  const requestPendingOrderPreflight = async () => {
    setPreflightMessage('');
    setPreflightCommand(null);
    const entry = Number(proposalEntry), stopLoss = Number(proposalStopLoss), takeProfit = Number(proposalTakeProfit);
    if (!proposalSymbol.trim() || ![entry, stopLoss, takeProfit].every((value) => Number.isFinite(value) && value > 0)) {
      setPreflightMessage('Enter a symbol and valid positive entry, stop-loss and take-profit prices.');
      return;
    }
    const isBuy = proposalType.startsWith('BUY');
    if ((isBuy && !(stopLoss < entry && takeProfit > entry)) ||
        (!isBuy && !(takeProfit < entry && stopLoss > entry))) {
      setPreflightMessage('Check your prices: for BUY, SL must be below entry and TP above. For SELL, TP must be below entry and SL above.');
      return;
    }
    setPreflightBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('mt5-bridge', {
        body: {
          action: 'preflight_pending_order',
          symbol: proposalSymbol.trim().toUpperCase(),
          direction: isBuy ? 'BUY' : 'SELL',
          orderType: proposalType,
          entry, stopLoss, takeProfit,
          idempotencyKey: crypto.randomUUID(),
        },
      });
      if (error) throw error;
      if (!data?.ok || !data.commandId) throw new Error(data?.error ?? 'Could not submit this proposal.');
      setPreflightCommandId(data.commandId);
      setPreflightMessage('Proposal sent to your connected MT5 worker for dry-run checks…');
    } catch (error) {
      setPreflightBusy(false);
      setPreflightMessage(error instanceof Error ? error.message : 'Preflight request failed.');
    }
  };

  const saveExecutionSettings = async () => {
    setSettingsMessage('');
    const risk = Number(riskPerTrade);
    const daily = Number(dailyLossLimit);
    const positions = Number(maxOpenPositions);
    const spread = Number(maxSpreadPoints);
    const slippage = Number(maxSlippagePoints);
    if (!Number.isFinite(risk) || risk <= 0 || risk > 2 ||
        !Number.isFinite(daily) || daily <= 0 || daily > 5 ||
        !Number.isInteger(positions) || positions < 1 || positions > 20 ||
        !Number.isInteger(spread) || spread < 0 || spread > 100000 ||
        !Number.isInteger(slippage) || slippage < 0 || slippage > 100000) {
      setSettingsMessage('Check the limits: risk up to 2%, daily loss up to 5%, 1–20 open positions, and non-negative spread/slippage points.');
      return;
    }
    if (riskEnabled && (spread === 0 || slippage === 0)) {
      setSettingsMessage('Set both a spread limit and a slippage limit before enabling risk controls.');
      return;
    }
    setSavingSettings(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw new Error('Please sign in again before saving MT5 settings.');
      const { error } = await supabase.from('mt5_account_settings').update({
        adopt_pending_orders: adoptPending,
        manage_existing_positions: managePositions,
        place_new_orders: placeNewOrders,
        live_execution_enabled: liveExecutionEnabled,
        emergency_stop: emergencyStop,
        risk_controls_enabled: riskEnabled,
        max_risk_per_trade_pct: risk,
        max_daily_loss_pct: daily,
        max_open_positions: positions,
        max_spread_points: spread,
        max_slippage_points: slippage,
        updated_at: new Date().toISOString(),
      }).eq('user_id', authData.user.id);
      if (error) throw error;
      setSettingsMessage('MT5 permissions and risk limits saved. Live order placement still requires a successful preflight and a separate confirmation for each order.');
    } catch (error) {
      setSettingsMessage(error instanceof Error ? error.message : 'Could not save MT5 settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  const requestSync = async () => {
    setSyncing(true);
    setSyncMessage('');
    setSyncCommands([]);
    try {
      const { data, error } = await supabase.functions.invoke('mt5-bridge', {
        body: { action: 'request_read_only_sync' },
      });
      if (error) throw error;
      if (!data?.syncId) throw new Error(data?.error ?? 'Could not request MT5 sync.');
      setSyncId(data.syncId);
      setSyncMessage('Reading account, pending orders and open positions…');
    } catch (error) {
      setSyncing(false);
      setSyncMessage(error instanceof Error ? error.message : 'MT5 sync request failed.');
    }
  };

  const loadInventory = async () => {
    setInventoryBusy(true);
    setInventoryMessage('');
    try {
      const { data, error } = await supabase.functions.invoke('mt5-bridge', {
        body: { action: 'list_inventory' },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setInventory((data?.inventory ?? []) as InventoryItem[]);
      setInventoryMessage('Inventory refreshed. Items remain unchanged at the broker.');
    } catch (error) {
      setInventoryMessage(error instanceof Error ? error.message : 'Could not load MT5 inventory.');
    } finally {
      setInventoryBusy(false);
    }
  };

  const changeAdoption = async (item: InventoryItem, adopt: boolean) => {
    setInventoryMessage('');
    setInventoryBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('mt5-bridge', {
        body: {
          action: adopt ? 'adopt_inventory' : 'revoke_inventory_adoption',
          objectType: item.object_type,
          ticket: item.ticket,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? 'Could not update adoption.');
      setInventoryMessage(data.message ?? 'Adoption status updated.');
      await loadInventory();
    } catch (error) {
      setInventoryMessage(error instanceof Error ? error.message : 'Could not update adoption.');
    } finally {
      setInventoryBusy(false);
    }
  };

  const pairWorker = async () => {
    setPairError('');
    setPairResult(null);
    setPairing(true);
    try {
      const { data, error } = await supabase.functions.invoke('mt5-bridge', {
        body: { action: 'pair', accountLogin: accountLogin.trim(), server: server.trim() },
      });
      if (error) throw error;
      if (!data?.ok || !data.workerToken || !data.workerId) {
        throw new Error(data?.error ?? 'Could not pair this MT5 worker.');
      }
      setPairResult(data as PairResult);
    } catch (error) {
      setPairError(error instanceof Error ? error.message : 'Pairing failed. Please try again.');
    } finally {
      setPairing(false);
    }
  };

  const copyToken = async () => {
    if (!pairResult?.workerToken) return;
    try {
      await navigator.clipboard.writeText(pairResult.workerToken);
    } catch {
      setPairError('Copy was blocked by your browser. Select and copy the token manually.');
    }
  };

  return (
    <section className="mt-8 space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Optional broker integration</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">MT5 Auto Trading</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-2">Pair your MetaTrader 5 terminal with SuperTech AI. The first worker release verifies the account and reads existing orders and positions. It does not trade or change existing orders.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-line/10 bg-surface/[0.04] p-5">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2"><Cable className="h-5 w-5 text-accent" /><h3 className="font-semibold text-ink">Pair your MT5 terminal</h3></div>
            <span className={`rounded-full border px-3 py-1 text-xs font-medium ${bridgeStatus === 'connected' ? 'border-up/20 bg-up/10 text-up' : 'border-amber-400/20 bg-amber-400/10 text-amber-500'}`}>{bridgeStatus === 'connected' ? 'Connected' : pairResult ? 'Worker paired' : bridgeStatus === 'error' ? 'Account check failed' : 'Awaiting worker'}</span>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-accent/20 bg-accent/5 p-4">
            <LockKeyhole className="mt-0.5 h-5 w-5 flex-shrink-0 text-accent" />
            <div>
              <p className="text-sm font-semibold text-ink">No trading password is requested</p>
              <p className="mt-1 text-sm leading-6 text-ink-2">Log into your chosen demo or live account in the official MT5 desktop terminal on your Windows computer or VPS. Enter only the account number and exact broker server name below. Never send your MT5 password to SuperTech AI chat or GitHub.</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-ink-2">MT5 account number
              <input value={accountLogin} onChange={(event) => setAccountLogin(event.target.value)} inputMode="numeric" autoComplete="off" placeholder="e.g. 12345678" className="mt-1.5 w-full rounded-xl border border-line/20 bg-canvas px-3 py-2.5 text-sm text-ink outline-none focus:border-accent" />
            </label>
            <label className="text-xs font-medium text-ink-2">Exact broker server
              <input value={server} onChange={(event) => setServer(event.target.value)} autoComplete="off" placeholder="e.g. Broker-Live 2" className="mt-1.5 w-full rounded-xl border border-line/20 bg-canvas px-3 py-2.5 text-sm text-ink outline-none focus:border-accent" />
            </label>
          </div>
          <button type="button" onClick={pairWorker} disabled={pairing || !/^\d{4,20}$/.test(accountLogin.trim()) || !server.trim()} className="mt-4 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
            {pairing ? 'Pairing…' : 'Create secure Windows worker pairing'}
          </button>
          {pairError && <p role="alert" className="mt-3 text-sm text-red-500">{pairError}</p>}

          {pairResult && (
            <div className="mt-5 rounded-xl border border-up/20 bg-up/5 p-4">
              <p className="text-sm font-semibold text-ink">Worker pairing created</p>
              <p className="mt-1 text-xs leading-5 text-ink-2">This token is shown once. Copy it now and store it in the Windows Credential Manager using the worker's token-provisioning script.</p>
              <p className="mt-3 break-all rounded-lg bg-canvas p-2 font-mono text-xs text-ink">Worker ID: {pairResult.workerId}</p>
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded-lg bg-canvas p-2 text-xs text-ink">{pairResult.workerToken}</code>
                <button type="button" onClick={copyToken} aria-label="Copy worker token" className="rounded-lg border border-line/20 p-2 text-ink"><Copy className="h-4 w-4" /></button>
              </div>
              <p className="mt-3 text-xs leading-5 text-ink-2">Next: install the Windows worker from the repository's <code>mt5-worker</code> folder, set the worker ID, and run <code>provision_token.py</code>. Keep the token private.</p>
            </div>
          )}
          <p className="mt-4 text-xs leading-5 text-ink-2">Demo and live accounts are both supported. The worker checks that its logged-in MT5 account number and server exactly match the details entered here. A mismatch prevents the worker from coming online.</p>
          {lastSeenAt && <p className="mt-2 text-xs text-ink-2">Last worker heartbeat: {new Date(lastSeenAt).toLocaleString()}</p>}
          <button type="button" onClick={requestSync} disabled={syncing || bridgeStatus !== 'connected'} className="mt-4 rounded-xl border border-accent/30 px-4 py-2.5 text-sm font-semibold text-accent disabled:cursor-not-allowed disabled:opacity-40">
            {syncing ? 'Reading MT5 account…' : 'Read account, orders and positions'}
          </button>
          {syncMessage && <p className="mt-2 text-xs text-ink-2">{syncMessage}</p>}
          <div className="mt-6 rounded-xl border border-line/10 bg-canvas/60 p-4">
            <h3 className="text-sm font-semibold text-ink">Pending-order broker check</h3>
            <p className="mt-1 text-xs leading-5 text-ink-2">Submit a proposed pending order for live quote, broker-distance, spread, margin and risk checks. This is a simulation only; the worker cannot place it.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-ink-2">MT5 symbol
                <input value={proposalSymbol} onChange={(event) => setProposalSymbol(event.target.value)} placeholder="e.g. EURUSD" className="mt-1 w-full rounded-lg border border-line/20 bg-canvas px-3 py-2 text-sm text-ink" />
              </label>
              <label className="text-xs text-ink-2">Pending order type
                <select value={proposalType} onChange={(event) => setProposalType(event.target.value)} className="mt-1 w-full rounded-lg border border-line/20 bg-canvas px-3 py-2 text-sm text-ink">
                  <option value="BUY_STOP">Buy Stop · follow upward trend</option>
                  <option value="SELL_STOP">Sell Stop · follow downward trend</option>
                  <option value="BUY_LIMIT">Buy Limit · buy on pullback</option>
                  <option value="SELL_LIMIT">Sell Limit · sell on pullback</option>
                </select>
              </label>
              <label className="text-xs text-ink-2">Entry price
                <input type="number" step="any" value={proposalEntry} onChange={(event) => setProposalEntry(event.target.value)} className="mt-1 w-full rounded-lg border border-line/20 bg-canvas px-3 py-2 text-sm text-ink" />
              </label>
              <label className="text-xs text-ink-2">Stop loss
                <input type="number" step="any" value={proposalStopLoss} onChange={(event) => setProposalStopLoss(event.target.value)} className="mt-1 w-full rounded-lg border border-line/20 bg-canvas px-3 py-2 text-sm text-ink" />
              </label>
              <label className="text-xs text-ink-2">Take profit
                <input type="number" step="any" value={proposalTakeProfit} onChange={(event) => setProposalTakeProfit(event.target.value)} className="mt-1 w-full rounded-lg border border-line/20 bg-canvas px-3 py-2 text-sm text-ink" />
              </label>
            </div>
            <button type="button" onClick={requestPendingOrderPreflight} disabled={preflightBusy || bridgeStatus !== 'connected'} className="mt-3 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
              {preflightBusy ? 'Checking with MT5…' : 'Run broker checks (no trade)'}
            </button>
            {preflightMessage && <p role="status" className="mt-2 text-xs text-ink-2">{preflightMessage}</p>}
            {preflightCommand && (
              <div className="mt-3 rounded-lg border border-line/10 bg-surface/[0.04] p-3">
                <p className="text-xs font-semibold text-ink">Broker check: {preflightCommand.status}</p>
                {preflightCommand.error_code && <p className="mt-1 text-xs text-red-500">Reason: {preflightCommand.error_code}</p>}
                {preflightCommand.result && (
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs text-ink-2">{JSON.stringify(preflightCommand.result, null, 2)}</pre>
                )}
                {preflightCommand.status === 'succeeded' && preflightCommand.result?.preflight === 'approved' && (
                  <button type="button" onClick={() => void approvePendingOrder()} disabled={executionBusy || !liveExecutionEnabled || emergencyStop || !placeNewOrders || !riskEnabled} className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-600 disabled:cursor-not-allowed disabled:opacity-40">
                    {executionBusy ? 'Sending approval…' : 'Confirm and place this MT5 pending order'}
                  </button>
                )}
                {executionMessage && <p role="status" className="mt-2 text-xs text-ink-2">{executionMessage}</p>}
                {executionCommand && (
                  <div className="mt-2 rounded-lg border border-line/10 p-3">
                    <p className="text-xs font-semibold text-ink">Execution: {executionCommand.status}</p>
                    {executionCommand.error_code && <p className="mt-1 text-xs text-red-500">{executionCommand.error_code}</p>}
                    {executionCommand.result && <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs text-ink-2">{JSON.stringify(executionCommand.result, null, 2)}</pre>}
                  </div>
                )}
              </div>
            )}
          </div>
          {syncCommands.length > 0 && (
            <div className="mt-4 space-y-3">
              {syncCommands.map((command) => (
                <div key={command.command_type} className="rounded-xl border border-line/10 bg-canvas/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-ink">{command.command_type === 'sync_account' ? 'Account details' : command.command_type === 'list_pending_orders' ? 'Pending orders' : 'Open positions'}</p>
                    <span className="text-xs text-ink-2">{command.status}</span>
                  </div>
                  {command.status === 'succeeded' && command.result && (
                    <div className="mt-2 space-y-1 text-xs text-ink-2">
                      {command.command_type === 'sync_account' && (
                        <p>Account {command.result.login} · {command.result.server} · {command.result.currency} · Balance {command.result.balance} · Equity {command.result.equity} · Free margin {command.result.margin_free}</p>
                      )}
                      {command.command_type === 'list_pending_orders' && (
                        <>
                          <p>{command.result.count ?? command.result.pending_orders?.length ?? 0} pending orders found. They have not been changed.</p>
                          {command.result.pending_orders?.map((order) => <p key={order.ticket}>#{order.ticket} · {order.symbol} · {order.volume_current} lots · {order.price_open}</p>)}
                        </>
                      )}
                      {command.command_type === 'list_positions' && (
                        <>
                          <p>{command.result.count ?? command.result.positions?.length ?? 0} open positions found. They have not been changed.</p>
                          {command.result.positions?.map((position) => <p key={position.ticket}>#{position.ticket} · {position.symbol} · {position.volume} lots · P/L {position.profit}</p>)}
                        </>
                      )}
                    </div>
                  )}
                  {command.status === 'failed' && <p className="mt-2 text-xs text-red-500">Could not read this item ({command.error_code ?? 'worker_error'}).</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-line/10 bg-surface/[0.04] p-5">
            <h3 className="font-semibold text-ink">Existing MT5 trade inventory</h3>
            <p className="mt-1 text-xs leading-5 text-ink-2">Refresh the broker inventory, then explicitly adopt individual pending orders or positions. Adoption records permission only; it does not change the trade at MT5.</p>
            <button type="button" onClick={loadInventory} disabled={inventoryBusy || bridgeStatus !== 'connected'} className="mt-3 rounded-xl border border-accent/30 px-3 py-2 text-sm font-semibold text-accent disabled:opacity-40">{inventoryBusy ? 'Working…' : 'Refresh trade inventory'}</button>
            {inventoryMessage && <p role="status" className="mt-2 text-xs text-ink-2">{inventoryMessage}</p>}
            <div className="mt-3 space-y-2">
              {inventory.map((item) => (
                <div key={item.object_type + ':' + item.ticket} className="rounded-xl border border-line/10 bg-canvas/60 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-ink">{item.symbol} · #{item.ticket}</p>
                      <p className="mt-1 text-xs text-ink-2">{item.object_type === 'pending_order' ? 'Pending order' : 'Open position'} · {item.volume} lots · Entry {item.price_open}</p>
                      <p className="mt-1 text-xs text-ink-2">SL {item.stop_loss} · TP {item.take_profit}{item.profit == null ? '' : ' · P/L ' + item.profit}</p>
                      <p className="mt-1 text-xs text-ink-2">Ownership: {item.ownership_status.replace(/_/g, ' ')}</p>
                    </div>
                    {item.ownership_status === 'explicitly_adopted' ? (
                      <button type="button" disabled={inventoryBusy} onClick={() => void changeAdoption(item, false)} className="rounded-lg border border-line/20 px-2.5 py-1.5 text-xs text-ink">Revoke</button>
                    ) : (item.ownership_status === 'discovered_unowned' || item.ownership_status === 'strategy_tagged_unverified') ? (
                      <button type="button" disabled={inventoryBusy || (item.object_type === 'pending_order' ? !adoptPending : !managePositions)} onClick={() => void changeAdoption(item, true)} className="rounded-lg bg-accent px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40">Adopt</button>
                    ) : null}
                  </div>
                </div>
              ))}
              {inventory.length === 0 && <p className="text-xs text-ink-2">No inventory loaded yet. Connect MT5 and refresh after a successful read-only sync.</p>}
            </div>
          </div>
          <div className="rounded-2xl border border-line/10 bg-surface/[0.04] p-5">
            <div className="flex items-center gap-2"><Bot className="h-5 w-5 text-accent" /><h3 className="font-semibold text-ink">Execution permissions</h3></div>
            <p className="mt-1 text-xs text-ink-2">Save separate permissions for this MT5 account. They are recorded now but cannot activate trades while the worker remains read-only.</p>
            <label className="mt-5 flex items-start gap-3 text-sm text-ink"><input type="checkbox" checked={adoptPending} onChange={(event) => setAdoptPending(event.target.checked)} className="mt-1 accent-current" /><span><strong className="block font-medium">Allow importing existing pending orders</strong><span className="text-xs text-ink-2">Permission for a future import workflow. Does not modify broker orders.</span></span></label>
            <label className="mt-4 flex items-start gap-3 text-sm text-ink"><input type="checkbox" checked={managePositions} onChange={(event) => setManagePositions(event.target.checked)} className="mt-1 accent-current" /><span><strong className="block font-medium">Allow management of existing positions</strong><span className="text-xs text-ink-2">Separate permission; manual trades will not be touched unless explicitly adopted later.</span></span></label>
            <label className="mt-4 flex items-start gap-3 text-sm text-ink"><input type="checkbox" checked={placeNewOrders} onChange={(event) => setPlaceNewOrders(event.target.checked)} className="mt-1 accent-current" /><span><strong className="block font-medium">Allow new strategy orders</strong><span className="text-xs text-ink-2">Permission required before any new SuperTech AI pending order can be sent.</span></span></label>
            <label className="mt-4 flex items-start gap-3 text-sm text-ink"><input type="checkbox" checked={liveExecutionEnabled} onChange={(event) => { const checked = event.target.checked; if (checked && !window.confirm('Enable MT5 order placement for the connected account? Every order still requires a separate confirmation.')) return; setLiveExecutionEnabled(checked); }} className="mt-1 accent-current" /><span><strong className="block font-medium">Enable MT5 order placement</strong><span className="text-xs text-ink-2">Off by default. Applies to the connected demo or real account. Every pending order still needs your confirmation.</span></span></label>
            <label className="mt-4 flex items-start gap-3 text-sm text-ink"><input type="checkbox" checked={emergencyStop} onChange={(event) => { const checked = event.target.checked; if (!checked && !window.confirm('Turn OFF the emergency stop? New MT5 orders may then be sent after your individual confirmation.')) return; setEmergencyStop(checked); }} className="mt-1 accent-current" /><span><strong className="block font-medium">Emergency stop — block all new orders</strong><span className="text-xs text-ink-2">Keep this on to block execution. Turn it off only when you are ready to authorize new orders.</span></span></label>
            <div className="mt-5 border-t border-line/10 pt-4">
              <h4 className="text-sm font-semibold text-ink">Account risk limits</h4>
              <p className="mt-1 text-xs leading-5 text-ink-2">Conservative starting limits. They will be enforced by the execution worker before any order is released.</p>
              <label className="mt-3 flex items-center gap-3 text-sm text-ink"><input type="checkbox" checked={riskEnabled} onChange={(event) => setRiskEnabled(event.target.checked)} className="accent-current" /><span>Enable risk limits for future automated trading</span></label>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="text-xs text-ink-2">Risk per trade (%)
                  <input type="number" min="0.01" max="2" step="0.01" value={riskPerTrade} onChange={(event) => setRiskPerTrade(event.target.value)} className="mt-1 w-full rounded-lg border border-line/20 bg-canvas px-2.5 py-2 text-sm text-ink" />
                </label>
                <label className="text-xs text-ink-2">Daily loss limit (%)
                  <input type="number" min="0.01" max="5" step="0.01" value={dailyLossLimit} onChange={(event) => setDailyLossLimit(event.target.value)} className="mt-1 w-full rounded-lg border border-line/20 bg-canvas px-2.5 py-2 text-sm text-ink" />
                </label>
                <label className="text-xs text-ink-2">Maximum open positions
                  <input type="number" min="1" max="20" step="1" value={maxOpenPositions} onChange={(event) => setMaxOpenPositions(event.target.value)} className="mt-1 w-full rounded-lg border border-line/20 bg-canvas px-2.5 py-2 text-sm text-ink" />
                </label>
                <label className="text-xs text-ink-2">Maximum spread (points)
                  <input type="number" min="0" step="1" value={maxSpreadPoints} onChange={(event) => setMaxSpreadPoints(event.target.value)} className="mt-1 w-full rounded-lg border border-line/20 bg-canvas px-2.5 py-2 text-sm text-ink" />
                </label>
                <label className="text-xs text-ink-2">Maximum slippage (points)
                  <input type="number" min="0" step="1" value={maxSlippagePoints} onChange={(event) => setMaxSlippagePoints(event.target.value)} className="mt-1 w-full rounded-lg border border-line/20 bg-canvas px-2.5 py-2 text-sm text-ink" />
                </label>
              </div>
              <p className="mt-2 text-xs text-ink-2">Defaults: 0.5% risk per trade, 2% daily loss, maximum 3 positions. Spread and slippage default to zero, which blocks future execution until you configure broker-appropriate limits.</p>
            </div>
            <button type="button" onClick={saveExecutionSettings} disabled={savingSettings || bridgeStatus === 'not_connected'} className="mt-5 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{savingSettings ? 'Saving…' : 'Save permissions and risk limits'}</button>
            {settingsMessage && <p role="status" className="mt-3 text-xs leading-5 text-ink-2">{settingsMessage}</p>}
          </div>
          <div className="rounded-2xl border border-line/10 bg-surface/[0.04] p-5">
            <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-accent" /><h3 className="font-semibold text-ink">Current worker capabilities</h3></div>
            <ul className="mt-3 space-y-2 text-sm text-ink-2">
              <li>• Verify the selected demo or live account identity.</li>
              <li>• Read account balance, equity and free margin.</li>
              <li>• Read pending orders and open positions.</li>
              <li>• Report worker heartbeat and connection errors.</li>
              <li>• No order placement, editing, cancellation or closing.</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4">
            <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" /><div><p className="text-sm font-semibold text-ink">Trading remains disabled</p><p className="mt-1 text-xs leading-5 text-ink-2">Broker execution, risk limits, order reconciliation and end-to-end tests must be completed before automated trading is enabled.</p></div></div>
          </div>
        </div>
      </div>
      <p className="flex items-center gap-2 text-xs text-ink-2"><CircleHelp className="h-4 w-4" />Keep the Windows computer or VPS running with MT5 open for continuous monitoring.</p>
    </section>
  );
}
