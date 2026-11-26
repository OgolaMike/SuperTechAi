import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock3, Eye, EyeOff, Link2, RefreshCw, Unplug } from 'lucide-react';
import {
  disconnectCTraderConnection,
  discoverCTraderAccounts,
  getCTraderConnectionStatus,
  refreshCTraderConnection,
  selectCTraderAccount,
  startCTraderConnection,
  type CTraderAccount,
  type CTraderConnectionStatus,
  connectBinanceSpot,
  disconnectBinanceSpot,
  getBinanceSpotConnectionStatus,
  type BinanceSpotConnectionStatus,
  connectBinanceFutures,
  disconnectBinanceFutures,
  getBinanceFuturesConnectionStatus,
} from '@/lib/independentApi';

export function IndependentBrokerConnections() {
  const [status, setStatus] = useState<CTraderConnectionStatus | null>(null);
  const [accounts, setAccounts] = useState<CTraderAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [binanceStatus, setBinanceStatus] = useState<BinanceSpotConnectionStatus | null>(null);
  const [binanceApiKey, setBinanceApiKey] = useState('');
  const [binanceApiSecret, setBinanceApiSecret] = useState('');
  const [showBinanceSecret, setShowBinanceSecret] = useState(false);
  const [futuresStatus, setFuturesStatus] = useState<BinanceSpotConnectionStatus | null>(null);
  const [futuresApiKey, setFuturesApiKey] = useState('');
  const [futuresApiSecret, setFuturesApiSecret] = useState('');
  const [showFuturesSecret, setShowFuturesSecret] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const result = await getCTraderConnectionStatus();
      setStatus(result);
      setAccounts(result.accounts || []);
      setSelectedAccountId(result.selectedAccountId || '');
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not check your cTrader connection.');
    }
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('ctrader') === 'connected') {
      setMessage('cTrader authorization completed. Your encrypted connection is saved.');
      url.searchParams.delete('ctrader');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    }
    void loadStatus();
    void getBinanceSpotConnectionStatus().then(setBinanceStatus).catch(() => setBinanceStatus(null));
    void getBinanceFuturesConnectionStatus().then(setFuturesStatus).catch(() => setFuturesStatus(null));
  }, [loadStatus]);

  const connect = async () => {
    setBusy(true); setError(''); setMessage('Opening cTrader secure authorization…');
    try {
      const result = await startCTraderConnection(window.location.pathname);
      window.location.assign(result.authorizationUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start cTrader authorization.');
      setMessage('');
      setBusy(false);
    }
  };

  const discover = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await discoverCTraderAccounts();
      setAccounts(result.accounts);
      setMessage(result.accounts.length ? `Found ${result.accounts.length} authorized cTrader account(s).` : 'No authorized cTrader accounts were returned.');
      await loadStatus();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not discover cTrader accounts.');
    } finally {
      setBusy(false);
    }
  };

  const selectAccount = async () => {
    if (!selectedAccountId) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await selectCTraderAccount(selectedAccountId);
      setMessage(`Connected to ${result.selectedAccount.broker} account ${result.selectedAccount.traderLogin || result.selectedAccount.accountId}. Trading remains disabled.`);
      await loadStatus();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not authorize this cTrader account.');
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await refreshCTraderConnection();
      setMessage(result.refreshed ? 'Your cTrader authorization has been refreshed.' : 'Your cTrader authorization is still valid.');
      await loadStatus();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not refresh cTrader authorization.');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await disconnectCTraderConnection();
      setStatus({ connected: false, status: 'not_connected' });
      setAccounts([]);
      setSelectedAccountId('');
      setMessage(result.note);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not disconnect cTrader.');
    } finally {
      setBusy(false);
    }
  };

  return <section className="mt-8 space-y-5">
    <div>
      <p className="text-xs font-semibold uppercase tracking-[.2em] text-accent">Broker connections</p>
      <h2 className="mt-1 text-2xl font-semibold text-ink">Connect your trading account</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-2">Use the broker’s official authorization page. SuperTech AI never asks you to paste your broker password or access token.</p>
    </div>
    <article className="rounded-2xl border border-line/15 bg-surface/[.04] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><span className="text-base font-semibold text-ink">cTrader</span>{status?.connected && <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-500">Connected</span>}</div>
          <p className="mt-1 text-xs text-ink-2">{status?.connected ? 'Encrypted authorization saved securely.' : 'Connect through cTrader’s official sign-in.'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void loadStatus()} disabled={busy} className="rounded-lg border border-line/20 px-3 py-2 text-xs font-semibold text-ink disabled:opacity-50"><RefreshCw className="mr-1 inline h-3.5 w-3.5"/>Check</button>
          {status?.connected ? <>
            <button type="button" onClick={() => void discover()} disabled={busy} className="rounded-lg border border-line/20 px-3 py-2 text-xs font-semibold text-ink disabled:opacity-50">{accounts.length ? 'Refresh accounts' : 'Find my accounts'}</button>
            <button type="button" onClick={() => void refresh()} disabled={busy} className="rounded-lg border border-line/20 px-3 py-2 text-xs font-semibold text-ink disabled:opacity-50">Refresh access</button>
            <button type="button" onClick={() => void disconnect()} disabled={busy} className="rounded-lg border border-line/20 px-3 py-2 text-xs font-semibold text-ink disabled:opacity-50"><Unplug className="mr-1 inline h-3.5 w-3.5"/>Disconnect</button>
          </> : <button type="button" onClick={() => void connect()} disabled={busy} className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Link2 className="mr-1 inline h-4 w-4"/>{busy ? 'Please wait…' : 'Connect cTrader'}</button>}
        </div>
      </div>
      {status?.connected && <div className="mt-4 flex items-start gap-2 rounded-xl border border-line/10 bg-surface/[.035] p-3 text-xs text-ink-2"><Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-accent"/><span>{status.tokenExpiresAt ? `Access authorization expiry: ${new Date(status.tokenExpiresAt).toLocaleString()}.` : 'Authorization is saved.'} {status.permissionScope ? `Permission: ${status.permissionScope}.` : ''} Account authorization is separate from trading activation.</span></div>}
      {accounts.length > 0 && <div className="mt-4 space-y-3 border-t border-line/10 pt-4">
        <div><p className="text-sm font-semibold text-ink">Your authorized accounts</p><p className="mt-1 text-xs text-ink-2">Choose which account SuperTech AI should use. This step only verifies access; it does not place trades.</p></div>
        <div className="space-y-2">
          {accounts.map(item => <label key={item.accountId} className="flex cursor-pointer items-center gap-3 rounded-xl border border-line/10 p-3">
            <input type="radio" name="ctrader-account" value={item.accountId} checked={selectedAccountId === item.accountId} onChange={() => setSelectedAccountId(item.accountId)} />
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-ink">{item.broker} · {item.traderLogin || item.accountId}</span><span className="text-[11px] text-ink-2">{item.isLive ? 'Live account' : 'Demo account'} · {item.accountType || 'Account'} · {item.permissionScope}</span></span>
            {selectedAccountId === item.accountId && <span className="text-[10px] font-semibold text-accent">{status?.status === 'account_authorized' ? 'Selected' : 'Chosen'}</span>}
          </label>)}
        </div>
        <button type="button" onClick={() => void selectAccount()} disabled={busy || !selectedAccountId || selectedAccountId === status?.selectedAccountId} className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Verifying…' : 'Use this account'}</button>
      </div>}
      {message && <p className="mt-3 flex items-start gap-2 text-xs text-emerald-500"><CheckCircle2 className="h-4 w-4 shrink-0"/>{message}</p>}
      {error && <p role="alert" className="mt-3 text-xs text-rose-400">{error}</p>}
    </article>
    <article className="rounded-2xl border border-line/15 bg-surface/[.04] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><span className="text-base font-semibold text-ink">Binance Spot</span>{binanceStatus?.connected && <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-500">Connected</span>}</div>
          <p className="mt-1 text-xs text-ink-2">{binanceStatus?.connected ? `API key ending ${binanceStatus.apiKeyLast4 || '••••'} verified. Withdrawals must remain disabled.` : 'Connect with a Binance API key. Never use your Binance login password.'}</p>
        </div>
        {binanceStatus?.connected && <button type="button" disabled={busy} onClick={() => { setBusy(true); void disconnectBinanceSpot().then(result => { setBinanceStatus({ connected: false, status: 'not_connected', tradingEnabled: false }); setMessage(result.note); }).catch(cause => setError(cause instanceof Error ? cause.message : 'Could not disconnect Binance.')).finally(() => setBusy(false)); }} className="rounded-lg border border-line/20 px-3 py-2 text-xs font-semibold text-ink disabled:opacity-50"><Unplug className="mr-1 inline h-3.5 w-3.5"/>Disconnect</button>}
      </div>
      {!binanceStatus?.connected && <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-ink-2">Binance API key<input autoComplete="off" value={binanceApiKey} onChange={event => setBinanceApiKey(event.target.value)} className="mt-1 w-full rounded-lg border border-line/20 bg-surface px-3 py-2 text-sm text-ink" placeholder="Paste API key"/></label>
        <label className="block text-xs text-ink-2">Binance API secret<span className="mt-1 flex rounded-lg border border-line/20 bg-surface"><input autoComplete="new-password" type={showBinanceSecret ? 'text' : 'password'} value={binanceApiSecret} onChange={event => setBinanceApiSecret(event.target.value)} className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-ink outline-none" placeholder="Paste API secret"/><button type="button" onClick={() => setShowBinanceSecret(value => !value)} className="px-3 text-ink-2" aria-label={showBinanceSecret ? 'Hide API secret' : 'Show API secret'}>{showBinanceSecret ? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}</button></span></label>
        <div className="sm:col-span-2"><button type="button" disabled={busy || !binanceApiKey.trim() || !binanceApiSecret.trim()} onClick={() => { setBusy(true); setError(''); setMessage(''); void connectBinanceSpot(binanceApiKey, binanceApiSecret).then(result => { setBinanceStatus({ connected: true, status: 'connected', apiKeyLast4: result.apiKeyLast4, tradingEnabled: false }); setBinanceApiKey(''); setBinanceApiSecret(''); setMessage('Binance Spot account verified and encrypted. Trading automation remains OFF.'); }).catch(cause => setError(cause instanceof Error ? cause.message : 'Could not connect Binance Spot.')).finally(() => setBusy(false)); }} className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Verifying…' : 'Connect Binance Spot'}</button></div>
      </div>}
      <p className="mt-3 text-[11px] leading-5 text-ink-2">Use a dedicated API key with Spot trading permission only. Disable withdrawals and enable IP restrictions in Binance. Credentials are encrypted before storage; this connection does not enable automated orders.</p>
    </article>
    <article className="rounded-2xl border border-line/15 bg-surface/[.04] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><div className="flex items-center gap-2"><span className="text-base font-semibold text-ink">Binance USDⓈ-M Futures</span>{futuresStatus?.connected && <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-500">Connected</span>}</div><p className="mt-1 text-xs text-ink-2">{futuresStatus?.connected ? `API key ending ${futuresStatus.apiKeyLast4 || '••••'} verified. Trading automation is OFF.` : 'Connect a dedicated Binance Futures API key.'}</p></div>
        {futuresStatus?.connected && <button type="button" disabled={busy} onClick={() => { setBusy(true); void disconnectBinanceFutures().then(result => { setFuturesStatus({ connected: false, status: 'not_connected', tradingEnabled: false }); setMessage(result.note); }).catch(cause => setError(cause instanceof Error ? cause.message : 'Could not disconnect Binance Futures.')).finally(() => setBusy(false)); }} className="rounded-lg border border-line/20 px-3 py-2 text-xs font-semibold text-ink disabled:opacity-50"><Unplug className="mr-1 inline h-3.5 w-3.5"/>Disconnect</button>}
      </div>
      {!futuresStatus?.connected && <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-ink-2">Futures API key<input autoComplete="off" value={futuresApiKey} onChange={event => setFuturesApiKey(event.target.value)} className="mt-1 w-full rounded-lg border border-line/20 bg-surface px-3 py-2 text-sm text-ink" placeholder="Paste API key"/></label>
        <label className="block text-xs text-ink-2">Futures API secret<span className="mt-1 flex rounded-lg border border-line/20 bg-surface"><input autoComplete="new-password" type={showFuturesSecret ? 'text' : 'password'} value={futuresApiSecret} onChange={event => setFuturesApiSecret(event.target.value)} className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-ink outline-none" placeholder="Paste API secret"/><button type="button" onClick={() => setShowFuturesSecret(value => !value)} className="px-3 text-ink-2" aria-label={showFuturesSecret ? 'Hide API secret' : 'Show API secret'}>{showFuturesSecret ? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}</button></span></label>
        <div className="sm:col-span-2"><button type="button" disabled={busy || !futuresApiKey.trim() || !futuresApiSecret.trim()} onClick={() => { setBusy(true); setError(''); setMessage(''); void connectBinanceFutures(futuresApiKey, futuresApiSecret).then(result => { setFuturesStatus({ connected: true, status: 'connected', apiKeyLast4: result.apiKeyLast4, tradingEnabled: false }); setFuturesApiKey(''); setFuturesApiSecret(''); setMessage('Binance Futures account verified and encrypted. Trading automation remains OFF.'); }).catch(cause => setError(cause instanceof Error ? cause.message : 'Could not connect Binance Futures.')).finally(() => setBusy(false)); }} className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Verifying…' : 'Connect Binance Futures'}</button></div>
      </div>}
      <p className="mt-3 text-[11px] leading-5 text-ink-2">Use a dedicated key, disable withdrawals, restrict IP access and grant only the permissions needed for Futures account verification. No orders can be placed from this connection yet.</p>
    </article>
    <article className="rounded-2xl border border-dashed border-line/15 bg-surface/[.02] p-5">
      <p className="text-sm font-semibold text-ink">Other brokers</p>
      <p className="mt-1 text-xs text-ink-2">MT5 and OKX Futures are being connected through the same independent secure service. They remain unavailable until their account and order checks are complete.</p>
    </article>
  </section>;
}
