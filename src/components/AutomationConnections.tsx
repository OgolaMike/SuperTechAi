import { useCallback, useEffect, useState } from 'react';
import {
  Activity, Bitcoin, Cable, CheckCircle2, Cloud, LockKeyhole,
  RefreshCw, ShieldAlert, Wallet, Wifi, WifiOff,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

type ConnectionCard = {
  id: 'binance' | 'okx' | 'ctrader' | 'mt5' | 'deriv';
  title: string;
  subtitle: string;
  status: 'connected' | 'not_connected' | 'attention' | 'not_available';
  detail: string;
  action: string;
  icon: typeof Bitcoin;
  liveReady: boolean;
};

type Props = { onOpen: (view: 'binance' | 'okx' | 'ctrader' | 'mt5') => void };

function connectionState(value: string | null | undefined): ConnectionCard['status'] {
  if (value === 'connected') return 'connected';
  if (value === 'error' || value === 'reauthorization_required') return 'attention';
  return 'not_connected';
}

export function AutomationConnections({ onOpen }: Props) {
  const [cards, setCards] = useState<ConnectionCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [spot, futures, okx, ctrader, mt5, workers] = await Promise.all([
        supabase.from('binance_spot_settings').select('connection_status').maybeSingle(),
        supabase.from('binance_futures_settings').select('connection_status').maybeSingle(),
        supabase.from('okx_futures_settings').select('connection_status').maybeSingle(),
        supabase.from('ctrader_connections').select('id,connection_status,environment,account_label').order('created_at', { ascending: false }),
        supabase.from('mt5_account_settings').select('bridge_status,last_seen_at,login,server').maybeSingle(),
        supabase.from('mt5_bridge_workers').select('worker_id,status,last_seen_at').eq('status', 'online'),
      ]);

      const failures = [spot.error, futures.error, okx.error, ctrader.error, mt5.error, workers.error].filter(Boolean);
      if (failures.length) throw new Error(failures[0]?.message ?? 'Could not load account connections.');

      const ctraderRows = ctrader.data ?? [];
      const ctraderConnected = ctraderRows.filter((row) => row.connection_status === 'connected').length;
      const mt5Online = mt5.data?.bridge_status === 'connected' &&
        (workers.data ?? []).some((worker) => !mt5.data?.last_seen_at ||
          new Date(worker.last_seen_at ?? 0).getTime() >= new Date(mt5.data.last_seen_at).getTime() - 120000);

      setCards([
        {
          id: 'binance', title: 'Binance', subtitle: 'Spot and USDⓈ-M Futures',
          status: connectionState(spot.data?.connection_status) === 'connected' ||
            connectionState(futures.data?.connection_status) === 'connected'
            ? 'connected'
            : connectionState(spot.data?.connection_status) === 'attention' ||
              connectionState(futures.data?.connection_status) === 'attention' ? 'attention' : 'not_connected',
          detail: `Spot: ${spot.data?.connection_status ?? 'not connected'} · Futures: ${futures.data?.connection_status ?? 'not connected'}`,
          action: 'Manage Binance', icon: Bitcoin, liveReady: true,
        },
        {
          id: 'okx', title: 'OKX', subtitle: 'USDT Perpetual Futures',
          status: connectionState(okx.data?.connection_status),
          detail: okx.data?.connection_status ?? 'Not connected',
          action: 'Manage OKX', icon: Activity, liveReady: true,
        },
        {
          id: 'ctrader', title: 'cTrader', subtitle: 'Broker accounts via secure authorisation',
          status: ctraderRows.length === 0 ? 'not_connected' :
            ctraderConnected > 0 ? 'connected' :
            ctraderRows.some((row) => row.connection_status === 'reauthorization_required' || row.connection_status === 'error') ? 'attention' : 'not_connected',
          detail: `${ctraderConnected} connected · ${ctraderRows.length} authorised account(s)`,
          action: 'Manage cTrader', icon: Cable, liveReady: false,
        },
        {
          id: 'mt5', title: 'MetaTrader 5', subtitle: 'Cloud-connected Windows trading terminal',
          status: mt5Online ? 'connected' : mt5.data?.bridge_status === 'error' ? 'attention' : 'not_connected',
          detail: mt5.data?.login ? `Account ${mt5.data.login} · ${mt5.data.server ?? 'Broker server'} · ${(workers.data ?? []).length} online worker(s)` : 'Pair an account and keep its secure worker online',
          action: 'Manage MT5', icon: Cloud, liveReady: false,
        },
        {
          id: 'deriv', title: 'Deriv', subtitle: 'Market data connected · account trading not yet linked',
          status: 'not_available', detail: 'Signal data is available. Secure account authorisation and trade execution are still to be built.',
          action: 'Market data only', icon: Wifi, liveReady: false,
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load connection status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const statusLabel = (status: ConnectionCard['status']) => ({
    connected: 'Connected',
    not_connected: 'Not connected',
    attention: 'Needs attention',
    not_available: 'Not yet available',
  })[status];

  return (
    <section className="mt-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">One mobile control centre</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Your trading connections</h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-2">
            Connect accounts once. SuperTech AI's cloud services handle supported automation while your phone remains the control centre.
          </p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-line/15 px-3 py-2 text-sm text-ink-2 transition hover:text-ink disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-300">{error}</div>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          const good = card.status === 'connected';
          const attention = card.status === 'attention';
          return (
            <article key={card.id} className="flex min-h-52 flex-col rounded-2xl border border-line/15 bg-surface/[0.04] p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-line/15 bg-surface/[0.07]">
                  <Icon className="h-5 w-5 text-accent" />
                </div>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${good ? 'border-emerald-500/25 text-emerald-400' : attention ? 'border-amber-500/25 text-amber-400' : 'border-line/15 text-ink-2'}`}>
                  {good ? <CheckCircle2 className="h-3.5 w-3.5" /> : attention ? <ShieldAlert className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                  {statusLabel(card.status)}
                </span>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-ink">{card.title}</h3>
              <p className="mt-1 text-xs text-ink-2">{card.subtitle}</p>
              <p className="mt-3 min-h-9 text-xs leading-relaxed text-ink-2">{card.detail}</p>
              <div className="mt-auto pt-4">
                {card.id === 'deriv' ? (
                  <span className="inline-flex items-center gap-2 text-xs text-ink-2"><LockKeyhole className="h-3.5 w-3.5" /> {card.action}</span>
                ) : (
                  <button type="button" onClick={() => onOpen(card.id)}
                    className="w-full rounded-xl border border-line/15 bg-surface/[0.06] px-3 py-2.5 text-sm font-medium text-ink transition hover:border-accent/40 hover:bg-surface/[0.1]">
                    {card.action}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <div className="rounded-2xl border border-line/10 bg-surface/[0.03] p-4">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <div>
            <p className="text-sm font-semibold text-ink">Connection does not mean trading is active</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-2">
              Each provider keeps its own permission checks, risk limits and emergency stop. A connected account is not proof that a live order can be placed. We verify account access separately, without placing a test trade.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
