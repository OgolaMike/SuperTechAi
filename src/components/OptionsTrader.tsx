import { useMemo, useState, useEffect, useCallback } from 'react';
import { Activity, ArrowUpRight, CheckCircle2, Clock3, Link2, RefreshCw, Unplug, Wallet } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Asset, TfState } from '@/lib/sma';
import type { SuperSignal } from '@/lib/intelligence';
import type { ConfluenceResult } from '@/lib/strategyConfluence';
import { buildOptionsBarrier, OPTIONS_CONTRACT_DURATION_MINUTES } from '@/lib/optionsTrader';

type AccountMode = 'demo' | 'real';
type ContractMode = 'touch' | 'no-touch' | 'both';
type DerivAccount = { account_id: string; account_type: string; currency: string; status: string };
type Props = {
  assets: Asset[];
  states: Record<string, Record<number, TfState>>;
  prices: Record<string, number>;
  superSignals: SuperSignal[];
  confluenceResults: ConfluenceResult[];
  nowEpoch: number;
  loaded: boolean;
};

function Choice<T extends string>({ value, options, onChange }: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return <div className="grid grid-cols-2 gap-1 rounded-xl border border-line/15 bg-surface/[0.045] p-1">
    {options.map(option => <button key={option.value} type="button" onClick={() => onChange(option.value)}
      aria-pressed={value === option.value}
      className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${value === option.value ? 'bg-surface/[0.14] text-ink shadow-sm' : 'text-ink-2 hover:text-ink'}`}>
      {option.label}
    </button>)}
  </div>;
}

export function OptionsTrader({ assets, states, prices, superSignals, confluenceResults, nowEpoch, loaded }: Props) {
  const [account, setAccount] = useState<AccountMode>('demo');
  const [contract, setContract] = useState<ContractMode>('both');
  const [stake, setStake] = useState('1');
  const [accounts, setAccounts] = useState<DerivAccount[]>([]);
  const [connected, setConnected] = useState(false);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [connectionBusy, setConnectionBusy] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState('');
  const [connectionError, setConnectionError] = useState('');
  const [quoteBusySymbol, setQuoteBusySymbol] = useState('');
  const [quoteError, setQuoteError] = useState('');
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState('');
  const [quotes, setQuotes] = useState<Record<string, Array<{ contractType: string; askPrice: number; payout: number; currency: string; barrier: string; snapshotId: string }>>>({});

  const loadConnection = useCallback(async () => {
    setConnectionBusy(true);
    const { data, error } = await supabase.functions.invoke('deriv-status', { body: {} });
    if (error || data?.error) {
      setConnectionError(error?.message ?? data.error);
      setConnected(false);
    } else {
      const list = Array.isArray(data?.accounts) ? data.accounts as DerivAccount[] : [];
      setAccounts(list);
      if (data?.connected) {
        const { data: saved, error: settingsError } = await supabase.functions.invoke('deriv-options-settings', { body: { action: 'get' } });
        const settings = !settingsError && saved?.settings ? saved.settings : null;
        if (settings?.account_mode === 'demo' || settings?.account_mode === 'real') setAccount(settings.account_mode);
        if (settings?.contract_kind === 'ONETOUCH') setContract('touch');
        else if (settings?.contract_kind === 'NOTOUCH') setContract('no-touch');
        else if (settings?.contract_kind === 'BOTH') setContract('both');
        if (settings?.stake != null && Number.isFinite(Number(settings.stake))) setStake(String(settings.stake));
      }
      setConnected(Boolean(data?.connected));
      setNeedsReconnect(Boolean(data?.needsReconnect));
      setConnectionError('');
      if (list.length && !list.some(item => item.account_type === account)) {
        setAccount(list.some(item => item.account_type === 'demo') ? 'demo' : 'real');
      }
    }
    setConnectionBusy(false);
  }, [account]);

  useEffect(() => {
    void loadConnection();
    const params = new URLSearchParams(window.location.search);
    if (params.get('deriv') === 'connected') {
      setConnectionMessage('Deriv account authorised. Your account details have been checked.');
      params.delete('deriv');
      const query = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (query ? `?${query}` : '') + window.location.hash);
    } else if (params.get('deriv') === 'error') {
      setConnectionError('Deriv authorisation was not completed. Please try again.');
      params.delete('deriv');
      const query = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (query ? `?${query}` : '') + window.location.hash);
    }
  }, [loadConnection]);

  const connect = async () => {
    setConnectionBusy(true); setConnectionError(''); setConnectionMessage('Opening Deriv secure sign-in…');
    const { data, error } = await supabase.functions.invoke('deriv-connect', { body: {} });
    if (error || !data?.authorizationUrl) {
      setConnectionError(error?.message ?? data?.error ?? 'Could not start Deriv connection. Please try again.');
      setConnectionMessage(''); setConnectionBusy(false); return;
    }
    window.location.assign(data.authorizationUrl);
  };

  const disconnect = async () => {
    setConnectionBusy(true); setConnectionError(''); setConnectionMessage('');
    const { data, error } = await supabase.functions.invoke('deriv-disconnect', { body: {} });
    if (error || !data?.disconnected) setConnectionError(error?.message ?? data?.error ?? 'Could not disconnect Deriv.');
    else { setConnected(false); setAccounts([]); setConnectionMessage('Deriv has been disconnected from SuperTech AI.'); }
    setConnectionBusy(false);
  };

  const selectedAccount = accounts.find(item => item.account_type === account && item.status === 'active') ?? accounts.find(item => item.account_type === account) ?? null;

  const saveSettings = async () => {
    if (!selectedAccount || selectedAccount.status !== 'active') {
      setSettingsMessage('Connect and select an active Deriv account first.');
      return;
    }
    const amount = Number(stake);
    if (!Number.isFinite(amount) || amount < 0.35) {
      setSettingsMessage('Enter a valid stake of at least 0.35.');
      return;
    }
    setSettingsBusy(true);
    setSettingsMessage('');
    const contractKind = contract === 'both' ? 'BOTH' : contract === 'touch' ? 'ONETOUCH' : 'NOTOUCH';
    const { data, error } = await supabase.functions.invoke('deriv-options-settings', {
      body: { action: 'save', accountId: selectedAccount.account_id, accountMode: account, contractKind, stake: amount, automationEnabled: false },
    });
    if (error || data?.error) {
      setSettingsMessage(data?.error === 'execution_not_enabled'
        ? 'Automatic trading is still locked while Demo execution tests are pending.'
        : error?.message ?? data?.error ?? 'Could not save settings.');
    } else {
      setSettingsMessage('Your account and trading preferences have been saved. Automatic trading remains off.');
    }
    setSettingsBusy(false);
  };

  const opportunities = useMemo(() => {
    const signalBySymbol = new Map(superSignals.map(signal => [signal.symbol, signal]));
    const assetBySymbol = new Map(assets.map(asset => [asset.symbol, asset]));
    return confluenceResults
      .filter(result => result.status === 'HIGH_CONFLUENCE' && result.direction)
      .map(result => {
        const asset = assetBySymbol.get(result.symbol);
        const signal = signalBySymbol.get(result.symbol);
        return asset && signal && nowEpoch >= signal.signalEpoch && nowEpoch - signal.signalEpoch <= 8 * 14400
          ? { asset, signal, result, price: prices[result.symbol] ?? null, bands: states[result.symbol]?.[1800] ?? null } : null;
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => b.result.score - a.result.score);
  }, [assets, confluenceResults, nowEpoch, prices, states, superSignals]);

  const requestQuotes = async (item: (typeof opportunities)[number]) => {
    if (!selectedAccount || selectedAccount.status !== 'active') {
      setQuoteError('Connect an active Deriv account and select it first.');
      return;
    }
    const bands = item.bands;
    if (item.price == null || bands?.bbHigh == null || bands.bbLow == null) {
      setQuoteError('Waiting for a completed 30-minute Bollinger reading for this market.');
      return;
    }
    const barrier = buildOptionsBarrier({
      direction: item.result.direction as 'BUY' | 'SELL',
      contractKind: 'ONETOUCH',
      spot: item.price,
      bollingerUpper: bands.bbHigh,
      bollingerLower: bands.bbLow,
    });
    if (!barrier) {
      setQuoteError('A valid directional barrier is not available yet.');
      return;
    }
    const amount = Number(stake);
    if (!Number.isFinite(amount) || amount <= 0) {
      setQuoteError('Enter a valid stake amount.');
      return;
    }
    const kinds = contract === 'both' ? ['ONETOUCH', 'NOTOUCH'] : [contract === 'touch' ? 'ONETOUCH' : 'NOTOUCH'];
    setQuoteBusySymbol(item.asset.symbol);
    setQuoteError('');
    try {
      const responses = await Promise.all(kinds.map(async contractType => {
        const { data, error } = await supabase.functions.invoke('deriv-options-proposal', {
          body: {
            accountId: selectedAccount.account_id,
            symbol: item.asset.symbol,
            contractType,
            barrier,
            stake: amount,
            signalSnapshot: {
              signalId: `${item.asset.symbol}:${item.signal.signalEpoch}:${item.result.direction}`,
              direction: item.result.direction,
              signalEpoch: item.signal.signalEpoch,
              confluenceScore: item.result.score,
              upperBand: bands.bbHigh,
              lowerBand: bands.bbLow,
              middleBand: (Number(bands.bbHigh) + Number(bands.bbLow)) / 2,
            },
          },
        });
        if (error || data?.error || !data?.proposal) throw new Error(data?.error ?? error?.message ?? 'Could not get Deriv quote.');
        if (typeof data.proposal.snapshotId !== 'string' || !data.proposal.snapshotId) throw new Error('Deriv quote was not saved securely. Please request a fresh quote.');
        return { contractType, askPrice: Number(data.proposal.askPrice), payout: Number(data.proposal.payout), currency: String(data.proposal.currency), barrier: String(data.proposal.barrier), snapshotId: data.proposal.snapshotId };
      }));
      setQuotes(current => ({ ...current, [item.asset.symbol]: responses }));
    } catch (error) {
      setQuoteError(error instanceof Error ? error.message : 'Could not get Deriv quote.');
    } finally {
      setQuoteBusySymbol('');
    }
  };

  const strategySignals = useMemo(
    () => confluenceResults.reduce((count, result) => count + result.assessments.filter(item => item.status === 'SIGNAL').length, 0),
    [confluenceResults],
  );

  return <section className="mt-6 space-y-5">
    <header className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Deriv options</p>
      <h2 className="text-2xl font-semibold tracking-tight text-ink">Options Trader</h2>
      <p className="max-w-xl text-sm text-ink-2">One SuperTech AI brain. Touch and No Touch execution.</p>
    </header>

    <div className="rounded-2xl border border-line/15 bg-surface/[0.04] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-line/15 bg-surface/[0.07]"><Wallet className="h-5 w-5 text-accent" /></span>
          <div>
            <p className="text-sm font-semibold text-ink">Deriv account</p>
            <p className="text-xs text-ink-2">{connected ? `${accounts.length} authorised account(s) found` : needsReconnect ? 'Connection expired — reconnect required' : 'Not connected'}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void loadConnection()} disabled={connectionBusy} className="inline-flex items-center gap-1.5 rounded-lg border border-line/20 px-3 py-2 text-xs font-semibold text-ink disabled:opacity-50"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
          {connected && <button type="button" onClick={() => void disconnect()} disabled={connectionBusy} className="inline-flex items-center gap-1.5 rounded-lg border border-line/20 px-3 py-2 text-xs font-semibold text-ink disabled:opacity-50"><Unplug className="h-3.5 w-3.5" /> Disconnect</button>}
          {!connected && <button type="button" onClick={() => void connect()} disabled={connectionBusy} className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Link2 className="h-4 w-4" /> {connectionBusy ? 'Please wait…' : needsReconnect ? 'Reconnect Deriv' : 'Connect Deriv'}</button>}
        </div>
      </div>
      {connectionMessage && <p className="mt-3 text-sm text-emerald-500">{connectionMessage}</p>}
      {connectionError && <p role="alert" className="mt-3 text-sm text-rose-400">{connectionError}</p>}
      {connected && selectedAccount && <p className="mt-3 text-xs text-ink-2">Selected {selectedAccount.account_type.toUpperCase()} account · {selectedAccount.account_id} · {selectedAccount.currency}</p>}
      {!connected && <p className="mt-3 text-sm leading-relaxed text-ink-2">Connect securely with Deriv. You will sign in on Deriv's official page and approve access. SuperTech AI never asks for your Deriv password or a pasted API token.</p>}
    </div>

    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-line/15 bg-surface/[0.04] p-4 sm:p-5">
        <label className="mb-2 block text-sm font-semibold text-ink">Account</label>
        <Choice value={account} onChange={setAccount} options={[{ value: 'demo', label: 'Demo' }, { value: 'real', label: 'Real' }]} />
        <p className="mt-2 text-xs text-ink-3">{selectedAccount ? `Using authorised ${account} account ${selectedAccount.account_id}.` : account === 'demo' ? 'Connect Deriv to select your demo account.' : 'Real-money trading requires an authorised real account.'}</p>
        <div className="mb-2 mt-5 text-sm font-semibold text-ink">Trading type</div>
        <div className="grid grid-cols-3 gap-1 rounded-xl border border-line/15 bg-surface/[0.045] p-1">
          {([{ value: 'touch', label: 'Touch' }, { value: 'no-touch', label: 'No Touch' }, { value: 'both', label: 'Both' }] as Array<{value: ContractMode; label: string}>).map(option =>
            <button key={option.value} type="button" onClick={() => setContract(option.value)} aria-pressed={contract === option.value}
              className={`rounded-lg px-2 py-2.5 text-xs font-semibold transition-colors sm:text-sm ${contract === option.value ? 'bg-surface/[0.14] text-ink shadow-sm' : 'text-ink-2 hover:text-ink'}`}>{option.label}</button>)}
        </div>
        <label htmlFor="options-stake" className="mb-2 mt-5 block text-sm font-semibold text-ink">Stake per trade</label>
        <div className="flex items-center gap-2 rounded-xl border border-line/15 bg-surface/[0.045] px-3 py-2.5">
          <span className="text-sm text-ink-2">{selectedAccount?.currency ?? 'USD'}</span>
          <input id="options-stake" type="number" min="0.35" step="0.01" inputMode="decimal" value={stake} onChange={event => setStake(event.target.value)} className="w-full bg-transparent text-base font-semibold text-ink outline-none" />
        </div>
        <p className="mt-2 text-xs text-ink-3">The broker's minimum stake and account currency will be checked before any order.</p>
        <button type="button" onClick={() => void saveSettings()} disabled={settingsBusy || !connected}
          className="mt-4 w-full rounded-xl border border-accent/35 bg-accent/10 px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-accent/15 disabled:cursor-not-allowed disabled:opacity-50">
          {settingsBusy ? 'Saving…' : 'Save trading preferences'}
        </button>
        {settingsMessage && <p role="status" className="mt-2 text-xs text-ink-2">{settingsMessage}</p>}
      </div>

      <div className="space-y-4 rounded-2xl border border-line/15 bg-surface/[0.04] p-4 sm:p-5">
        <div><p className="text-sm font-semibold text-ink">Markets</p><p className="mt-1 text-sm text-ink-2">All eligible Deriv markets</p><p className="mt-1 text-xs text-ink-3">Contract duration: {OPTIONS_CONTRACT_DURATION_MINUTES} minutes</p></div>
        <div className="flex items-center gap-2 rounded-xl border border-line/10 bg-surface/[0.035] p-3 text-xs text-ink-2"><Activity className="h-4 w-4 shrink-0 text-accent" /> Market analysis is shared with the main SuperTech AI engine.</div>
        <div className="border-t border-line/10 pt-4">
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-sm font-semibold text-ink">Auto Trading</p><p className="mt-1 text-xs text-ink-2">Not available until live execution checks are complete</p></div>
            <button type="button" role="switch" aria-checked={false} disabled className="relative h-7 w-12 cursor-not-allowed rounded-full bg-surface/[0.2] opacity-45" aria-label="Automatic trading is not yet available"><span className="absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow" /></button>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink-3">Your existing activate/deactivate control will operate this feature once the order engine is verified. No trades can be placed from this preview yet.</p>
        </div>
        <div className="rounded-xl border border-line/10 bg-surface/[0.035] p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-ink"><CheckCircle2 className="h-4 w-4 text-accent" /> Intelligence connected</div>
          <p className="mt-1 text-xs leading-relaxed text-ink-2">Trend, independent strategies and confluence are supplied by the existing SuperTech AI engines.</p>
        </div>
      </div>
    </div>

    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-2xl border border-line/15 bg-surface/[0.04] p-4"><div className="flex items-center gap-2 text-xs text-ink-2"><Activity className="h-4 w-4 text-accent" /> Deriv markets</div><p className="mt-3 text-2xl font-semibold text-ink">{assets.length}</p></div>
      <div className="rounded-2xl border border-line/15 bg-surface/[0.04] p-4"><div className="flex items-center gap-2 text-xs text-ink-2"><CheckCircle2 className="h-4 w-4 text-accent" /> Strategy signals</div><p className="mt-3 text-2xl font-semibold text-ink">{strategySignals}</p></div>
      <div className="rounded-2xl border border-line/15 bg-surface/[0.04] p-4"><div className="flex items-center gap-2 text-xs text-ink-2"><Clock3 className="h-4 w-4 text-accent" /> Qualified opportunities</div><p className="mt-3 text-2xl font-semibold text-ink">{opportunities.length}</p></div>
    </div>

    <div className="rounded-2xl border border-line/15 bg-surface/[0.035] p-4">
      <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold text-ink">Market opportunities</h3><p className="mt-1 text-xs text-ink-2">Ranked using existing SuperTech AI confluence. These are analysis results, not executed contracts.</p></div><ArrowUpRight className="h-4 w-4 text-ink-3" /></div>
      {!loaded ? <p className="mt-4 text-sm text-ink-3">Connecting to market intelligence…</p> : opportunities.length === 0 ? <p className="mt-4 rounded-xl border border-dashed border-line/20 px-4 py-8 text-center text-sm text-ink-3">Waiting for a qualified market opportunity.</p> :
        <div className="mt-4 space-y-2">{opportunities.slice(0, 6).map(({ asset, signal, result, price }) =>
          <div key={asset.symbol} className="rounded-xl border border-line/10 bg-surface/[0.035] p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-sm font-semibold text-ink">{asset.name}</p><p className="mt-1 text-xs text-ink-2">{result.direction} · {result.agreementCount} strategies agree · {result.score}/100 evidence score</p></div>
              <div className="text-right"><p className="text-sm font-semibold text-ink">{price == null ? '—' : price.toFixed(asset.digits)}</p><p className="mt-1 text-[11px] text-ink-3">{signal.classification}</p></div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-ink-3">Barrier uses the completed M30 Bollinger boundary.</p>
              <button type="button" onClick={() => void requestQuotes(opportunities.find(item => item.asset.symbol === asset.symbol)!)} disabled={quoteBusySymbol === asset.symbol || !selectedAccount} className="rounded-lg border border-accent/40 px-3 py-2 text-xs font-semibold text-ink disabled:opacity-40">{quoteBusySymbol === asset.symbol ? 'Getting quote…' : 'Get Deriv quote'}</button>
            </div>
            {quotes[asset.symbol]?.map(quote => <p key={quote.contractType} className="mt-2 text-xs text-ink-2">{quote.contractType === 'ONETOUCH' ? 'Touch' : 'No Touch'} · Stake {quote.askPrice.toFixed(2)} {quote.currency} · Payout {quote.payout.toFixed(2)} {quote.currency} · Barrier {quote.barrier} · Quote saved</p>)}
          </div>)}</div>}
      {quoteError && <p role="alert" className="mt-3 text-xs text-rose-400">{quoteError}</p>}
    </div>
    <div className="rounded-2xl border border-line/15 bg-surface/[0.035] p-4"><div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold text-ink">Recent trades</h3><p className="mt-1 text-xs text-ink-2">Completed and active options trades will appear here.</p></div><ArrowUpRight className="h-4 w-4 text-ink-3" /></div><div className="mt-4 rounded-xl border border-dashed border-line/20 px-4 py-8 text-center text-sm text-ink-3">No trades to display yet.</div></div>
  </section>;
}
