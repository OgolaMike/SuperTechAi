import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock3, Link2, RefreshCw, Unplug } from 'lucide-react';
import {
  disconnectCTraderConnection,
  getCTraderConnectionStatus,
  refreshCTraderConnection,
  startCTraderConnection,
  type CTraderConnectionStatus,
} from '@/lib/independentApi';

export function IndependentBrokerConnections() {
  const [status, setStatus] = useState<CTraderConnectionStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadStatus = useCallback(async () => {
    try {
      const result = await getCTraderConnectionStatus();
      setStatus(result);
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
            <button type="button" onClick={() => void refresh()} disabled={busy} className="rounded-lg border border-line/20 px-3 py-2 text-xs font-semibold text-ink disabled:opacity-50">Refresh access</button>
            <button type="button" onClick={() => void disconnect()} disabled={busy} className="rounded-lg border border-line/20 px-3 py-2 text-xs font-semibold text-ink disabled:opacity-50"><Unplug className="mr-1 inline h-3.5 w-3.5"/>Disconnect</button>
          </> : <button type="button" onClick={() => void connect()} disabled={busy} className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Link2 className="mr-1 inline h-4 w-4"/>{busy ? 'Please wait…' : 'Connect cTrader'}</button>}
        </div>
      </div>
      {status?.connected && <div className="mt-4 flex items-start gap-2 rounded-xl border border-line/10 bg-surface/[.035] p-3 text-xs text-ink-2"><Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-accent"/><span>{status.tokenExpiresAt ? `Access authorization expiry: ${new Date(status.tokenExpiresAt).toLocaleString()}.` : 'Authorization is saved.'} Account discovery is the next broker step. Trading remains disabled.</span></div>}
      {message && <p className="mt-3 flex items-start gap-2 text-xs text-emerald-500"><CheckCircle2 className="h-4 w-4 shrink-0"/>{message}</p>}
      {error && <p role="alert" className="mt-3 text-xs text-rose-400">{error}</p>}
    </article>
    <article className="rounded-2xl border border-dashed border-line/15 bg-surface/[.02] p-5">
      <p className="text-sm font-semibold text-ink">Other brokers</p>
      <p className="mt-1 text-xs text-ink-2">MT5, Binance Spot, Binance Futures, OKX Futures and Deriv Options are being connected through the same independent secure service. They remain unavailable until their account and order checks are complete.</p>
    </article>
  </section>;
}
