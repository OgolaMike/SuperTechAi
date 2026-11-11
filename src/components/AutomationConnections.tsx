import { useCallback, useEffect, useState } from 'react';
import {
  Activity, Bitcoin, Cable, CheckCircle2, Cloud, LockKeyhole,
  RefreshCw, ShieldAlert, Wifi, WifiOff,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

type ProviderStatus = 'connected' | 'connecting' | 'not_connected' | 'attention' | 'not_available';

type AutomationStatusResponse = {
  providers: {
    binance: {
      status: ProviderStatus;
      spotStatus: string;
      futuresStatus: string;
      spotCheckedAt: string | null;
      futuresCheckedAt: string | null;
      accountLabel: string | null;
    };
    okx: {
      status: ProviderStatus;
      accountLabel: string | null;
      accountMode: string | null;
      demoTrading: boolean | null;
      lastCheckedAt: string | null;
    };
    ctrader: {
      status: ProviderStatus;
      connectedAccounts: number;
      totalAccounts: number;
    };
    mt5: {
      status: ProviderStatus;
      onlineWorkers: number;
      loginSuffix: string | null;
      server: string | null;
      lastSeenAt: string | null;
    };
    deriv: { status: 'not_available' };
  };
};

type ConnectionCard = {
  id: 'binance' | 'okx' | 'ctrader' | 'mt5' | 'deriv';
  title: string;
  subtitle: string;
  status: ProviderStatus;
  detail: string;
  action: string;
  icon: typeof Bitcoin;
};

type Props = { onOpen: (view: 'binance' | 'okx' | 'ctrader' | 'mt5') => void };

function openConnection(id: ConnectionCard['id'], onOpen: Props['onOpen']) {
  switch (id) {
    case 'binance':
    case 'okx':
    case 'ctrader':
    case 'mt5':
      onOpen(id);
      return;
    case 'deriv':
      return;
  }
}

function statusLabel(status: ProviderStatus) {
  return ({
    connected: 'Connected',
    connecting: 'Connecting',
    not_connected: 'Not connected',
    attention: 'Needs attention',
    not_available: 'Not yet available',
  })[status];
}

function safeProviderStatus(value: unknown): ProviderStatus {
  return value === 'connected' || value === 'connecting' || value === 'attention' || value === 'not_available'
    ? value
    : 'not_connected';
}

export function AutomationConnections({ onOpen }: Props) {
  const [cards, setCards] = useState<ConnectionCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: invokeError } =
        await supabase.functions.invoke<AutomationStatusResponse>('automation-status', {
          method: 'GET',
        });

      if (invokeError) throw new Error('Could not load secure account status.');
      if (!data?.providers) throw new Error('Account status response was incomplete.');

      const providers = data.providers;
      const binance = providers.binance;
      const okx = providers.okx;
      const ctrader = providers.ctrader;
      const mt5 = providers.mt5;

      setCards([
        {
          id: 'binance',
          title: 'Binance',
          subtitle: 'Spot and USDⓈ-M Futures',
          status: safeProviderStatus(binance.status),
          detail: `Spot: ${binance.spotStatus} · Futures: ${binance.futuresStatus}${binance.accountLabel ? ` · ${binance.accountLabel}` : ''}`,
          action: 'Manage Binance',
          icon: Bitcoin,
        },
        {
          id: 'okx',
          title: 'OKX',
          subtitle: 'USDT Perpetual Futures',
          status: safeProviderStatus(okx.status),
          detail: [okx.accountLabel, okx.accountMode, okx.demoTrading === null ? null : okx.demoTrading ? 'Demo account' : 'Live account']
            .filter(Boolean).join(' · ') || 'Account status checked securely',
          action: 'Manage OKX',
          icon: Activity,
        },
        {
          id: 'ctrader',
          title: 'cTrader',
          subtitle: 'Broker accounts via secure authorisation',
          status: safeProviderStatus(ctrader.status),
          detail: `${ctrader.connectedAccounts} connected · ${ctrader.totalAccounts} authorised account(s)`,
          action: 'Manage cTrader',
          icon: Cable,
        },
        {
          id: 'mt5',
          title: 'MetaTrader 5',
          subtitle: 'Windows terminal bridge',
          status: safeProviderStatus(mt5.status),
          detail: mt5.loginSuffix
            ? `Account ••••${mt5.loginSuffix} · ${mt5.server ?? 'Broker server'} · ${mt5.onlineWorkers} active worker(s)`
            : mt5.onlineWorkers > 0
            ? `${mt5.onlineWorkers} active worker(s)`
            : 'Pair an account and keep its secure worker online',
          action: 'Manage MT5',
          icon: Cloud,
        },
        {
          id: 'deriv',
          title: 'Deriv',
          subtitle: 'Market data connected · account trading not yet linked',
          status: 'not_available',
          detail: 'Signal data is available. Secure account authorisation and trade execution are still to be built.',
          action: 'Market data only',
          icon: Wifi,
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load connection status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <section className="mt-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">One mobile control centre</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Your trading connections</h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-2">
            Connect accounts once. Supported cloud services keep running while your phone remains the control centre.
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
          const connecting = card.status === 'connecting';
          return (
            <article key={card.id} className="flex min-h-52 flex-col rounded-2xl border border-line/15 bg-surface/[0.04] p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-line/15 bg-surface/[0.07]">
                  <Icon className="h-5 w-5 text-accent" />
                </div>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${good ? 'border-emerald-500/25 text-emerald-400' : attention ? 'border-amber-500/25 text-amber-400' : connecting ? 'border-sky-500/25 text-sky-400' : 'border-line/15 text-ink-2'}`}>
                  {good ? <CheckCircle2 className="h-3.5 w-3.5" /> : attention ? <ShieldAlert className="h-3.5 w-3.5" /> : connecting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <WifiOff className="h-3.5 w-3.5" />}
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
                  <button type="button" onClick={() => openConnection(card.id, onOpen)}
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
              Each provider keeps its own permission checks, risk limits and emergency stop. A connected account is not proof that a live order can be placed. Account access is checked without placing a test trade.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
