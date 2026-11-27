import { useEffect, useMemo, useState } from 'react';
import { IndependentPushSettings } from '@/components/IndependentPushSettings';
import {
  Activity, ArrowDownRight, ArrowUpRight, Bell, Bot, CandlestickChart,
  CheckCircle2, ChevronDown, CircleDollarSign, Clock3, Coins, LayoutDashboard,
  LogOut, Menu, Radio, ShieldCheck, Signal, Sparkles, TrendingUp, Wallet, X,
} from 'lucide-react';

type Props = { email: string; onSignOut: () => Promise<void> };
type Tick = { quote: number; epoch: number };
type Market = { symbol: string; label: string; kind: string; digits: number };

const MARKETS: Market[] = [
  { symbol: 'R_100', label: 'Volatility 100', kind: 'Synthetic', digits: 2 },
  { symbol: 'R_75', label: 'Volatility 75', kind: 'Synthetic', digits: 2 },
  { symbol: 'R_50', label: 'Volatility 50', kind: 'Synthetic', digits: 2 },
  { symbol: 'frxEURUSD', label: 'EUR / USD', kind: 'Forex', digits: 5 },
  { symbol: 'frxGBPUSD', label: 'GBP / USD', kind: 'Forex', digits: 5 },
  { symbol: 'frxXAUUSD', label: 'Gold', kind: 'Commodities', digits: 2 },
];

const NAV = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'signals', label: 'Trading Signals', icon: Signal },
  { id: 'super', label: 'Super Signal', icon: Sparkles },
  { id: 'crypto', label: 'Crypto Watchlist', icon: Coins },
  { id: 'options', label: 'Options Trader', icon: CandlestickChart },
  { id: 'orders', label: 'Pending Orders', icon: Clock3 },
  { id: 'history', label: 'Event History', icon: Activity },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'referrals', label: 'Referrals', icon: Wallet },
  { id: 'finance', label: 'Financial Dashboard', icon: CircleDollarSign },
  { id: 'health', label: 'Service Health', icon: Radio },
] as const;

type Page = typeof NAV[number]['id'];

export function IndependentWorkspace({ email, onSignOut }: Props) {
  const [page, setPage] = useState<Page>('overview');
  const [market, setMarket] = useState(MARKETS[0]);
  const [ticks, setTicks] = useState<Tick[]>([]);
  const [connection, setConnection] = useState<'connecting' | 'live' | 'offline'>('connecting');
  const [menuOpen, setMenuOpen] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let retry: number | undefined;
    let stopped = false;
    const connect = () => {
      if (stopped) return;
      setConnection('connecting');
      socket = new WebSocket('wss://ws.derivws.com/websockets/v3?app_id=1089');
      socket.onopen = () => socket?.send(JSON.stringify({ ticks: market.symbol, subscribe: 1 }));
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data)) as { tick?: { quote: number; epoch: number }; error?: { message?: string } };
          if (data.tick) {
            setTicks((previous) => [...previous, { quote: data.tick!.quote, epoch: data.tick!.epoch }].slice(-80));
            setLastUpdate(data.tick.epoch);
            setConnection('live');
          }
          if (data.error) setConnection('offline');
        } catch { setConnection('offline'); }
      };
      socket.onerror = () => setConnection('offline');
      socket.onclose = () => {
        if (!stopped) {
          setConnection('offline');
          retry = window.setTimeout(connect, 3500);
        }
      };
    };
    setTicks([]);
    connect();
    return () => {
      stopped = true;
      if (retry) window.clearTimeout(retry);
      socket?.close();
    };
  }, [market.symbol]);

  const price = ticks[ticks.length - 1]?.quote;
  const previous = ticks[ticks.length - 2]?.quote;
  const delta = price !== undefined && previous !== undefined ? price - previous : 0;
  const up = delta >= 0;
  const chartPath = useMemo(() => {
    if (ticks.length < 2) return '';
    const values = ticks.map((tick) => tick.quote);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    return values.map((value, index) => `${index === 0 ? 'M' : 'L'} ${(index / (values.length - 1)) * 100} ${92 - ((value - min) / span) * 82}`).join(' ');
  }, [ticks]);

  const title = NAV.find((item) => item.id === page)?.label ?? 'Overview';
  const formatPrice = (value?: number) => value === undefined ? 'Waiting for feed' : value.toFixed(market.digits);

  return (
    <div className="min-h-screen bg-[#070b13] text-slate-100">
      <div className="pointer-events-none fixed inset-0 overflow-hidden"><div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-cyan-500/[0.07] blur-[110px]" /><div className="absolute -right-40 top-1/3 h-96 w-96 rounded-full bg-amber-400/[0.045] blur-[120px]" /></div>
      <div className="relative mx-auto flex min-h-screen max-w-[1600px]">
        <aside className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-white/[0.07] bg-[#090e18] p-5 transition-transform lg:sticky lg:translate-x-0 ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="flex items-center gap-3 px-2 py-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl border border-cyan-300/30 bg-cyan-300/10 text-cyan-200"><Sparkles size={22} /></div>
            <div><p className="text-[15px] font-black tracking-[0.12em]">SUPERTECH <span className="text-cyan-300">AI</span></p><p className="mt-0.5 text-[10px] uppercase tracking-[0.22em] text-slate-500">Intelligent trading</p></div>
            <button className="ml-auto rounded-lg p-2 text-slate-400 lg:hidden" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X size={18} /></button>
          </div>
          <div className="my-6 rounded-2xl border border-cyan-300/15 bg-gradient-to-br from-cyan-300/[0.09] to-transparent p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200">Member workspace</p>
            <p className="mt-2 truncate text-sm font-semibold">{email}</p>
            <p className="mt-1 text-[11px] text-slate-500">Independent Appwrite account</p>
          </div>
          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600">Workspace</p>
          <nav className="flex-1 space-y-1 overflow-y-auto">
            {NAV.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => { setPage(id); setMenuOpen(false); }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[13px] font-medium transition ${page === id ? 'border border-cyan-300/20 bg-cyan-300/[0.10] text-cyan-100 shadow-[0_0_24px_-14px_rgba(103,232,249,.55)]' : 'text-slate-400 hover:bg-white/[0.04] hover:text-white'}`}><Icon size={17} /><span>{label}</span>{page === id && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-cyan-300" />}</button>)}
          </nav>
          <div className="mt-5 border-t border-white/[0.07] pt-4">
            <p className="mb-3 px-2 text-[10px] text-slate-600">Be part of the AI revolution.</p>
            <button onClick={() => void onSignOut()} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-400 hover:bg-white/[0.05] hover:text-white"><LogOut size={17} /> Sign out</button>
          </div>
        </aside>
        {menuOpen && <button aria-label="Close navigation" onClick={() => setMenuOpen(false)} className="fixed inset-0 z-30 bg-black/60 lg:hidden" />}
        <main className="min-w-0 flex-1 px-4 pb-10 pt-4 sm:px-7 lg:px-9 lg:pt-7">
          <header className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3"><button onClick={() => setMenuOpen(true)} className="rounded-xl border border-white/10 p-2.5 text-slate-300 lg:hidden"><Menu size={19} /></button><div><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">SuperTech AI / Workspace</p><h1 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">{title}</h1></div></div>
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-3 py-2 text-[11px]"><span className={`h-2 w-2 rounded-full ${connection === 'live' ? 'bg-emerald-400 shadow-[0_0_10px_#34d399]' : connection === 'connecting' ? 'animate-pulse bg-amber-300' : 'bg-rose-400'}`} />{connection === 'live' ? 'Market feed live' : connection === 'connecting' ? 'Connecting' : 'Feed offline'}</div>
          </header>

          {page === 'overview' && <>
            <section className="mt-7 overflow-hidden rounded-[28px] border border-cyan-300/15 bg-gradient-to-br from-[#102333] via-[#0c1725] to-[#11131d] p-5 shadow-[0_25px_80px_-45px_rgba(34,211,238,.25)] sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-5"><div className="max-w-2xl"><div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/[0.08] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200"><ShieldCheck size={13} /> Independent member terminal</div><h2 className="mt-5 text-3xl font-black leading-tight tracking-tight sm:text-5xl">Hide the noise.<br /><span className="bg-gradient-to-r from-cyan-200 via-white to-amber-200 bg-clip-text text-transparent">See the opportunity.</span></h2><p className="mt-4 max-w-xl text-sm leading-6 text-slate-400">Market intelligence, strategy signals and automated trading connections in one focused workspace.</p></div><div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-[10px] uppercase tracking-widest text-slate-500">Workspace status</p><p className="mt-2 flex items-center gap-2 text-sm font-semibold text-emerald-300"><CheckCircle2 size={16} /> Account secured</p><p className="mt-1 text-xs text-slate-500">Email verified · Appwrite</p></div></div>
            </section>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label="Live market price" value={formatPrice(price)} note={market.label} icon={TrendingUp} />
              <Metric label="Market connection" value={connection === 'live' ? 'Connected' : connection === 'connecting' ? 'Connecting' : 'Offline'} note="Public Deriv market feed" icon={Radio} />
              <Metric label="Strategy engine" value="Awaiting API" note="No simulated signals shown" icon={Bot} />
              <Metric label="Member access" value="Verified" note="Independent Appwrite identity" icon={ShieldCheck} />
            </div>
            <section className="mt-6 grid gap-5 xl:grid-cols-[1.6fr_1fr]">
              <div className="rounded-3xl border border-white/[0.08] bg-[#0c1420] p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Live market monitor</p><h3 className="mt-1 text-lg font-bold">Price movement</h3></div><div className="relative"><select value={market.symbol} onChange={(event) => setMarket(MARKETS.find((item) => item.symbol === event.target.value) ?? MARKETS[0])} className="appearance-none rounded-xl border border-white/10 bg-[#111d2b] py-2 pl-3 pr-9 text-xs text-slate-200 outline-none focus:border-cyan-300/40">{MARKETS.map((item) => <option key={item.symbol} value={item.symbol}>{item.label}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-2.5 text-slate-500" size={14} /></div></div>
                <div className="mt-6 flex flex-wrap items-end justify-between gap-4"><div><p className="font-mono text-3xl font-bold tracking-tight">{formatPrice(price)}</p><p className={`mt-2 flex items-center gap-1 text-xs font-semibold ${up ? 'text-emerald-400' : 'text-rose-400'}`}>{up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{delta === 0 ? 'Waiting for next tick' : `${delta > 0 ? '+' : ''}${delta.toFixed(market.digits)} latest movement`}</p></div><span className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] text-slate-500">{market.kind} · live ticks</span></div>
                <div className="mt-5 h-48 overflow-hidden rounded-2xl bg-gradient-to-b from-cyan-300/[0.06] to-transparent p-2"><svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full"><defs><linearGradient id="price-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#67e8f9" stopOpacity=".25" /><stop offset="100%" stopColor="#67e8f9" stopOpacity="0" /></linearGradient></defs>{chartPath && <><path d={`${chartPath} L 100 100 L 0 100 Z`} fill="url(#price-fill)" /><path d={chartPath} fill="none" stroke="#67e8f9" strokeWidth="1.5" vectorEffect="non-scaling-stroke" /></>}</svg>{ticks.length < 2 && <div className="grid h-full place-items-center text-xs text-slate-600">{connection === 'live' ? 'Collecting live price ticks…' : 'Waiting for market connection…'}</div>}</div>
                <div className="mt-3 flex justify-between text-[10px] text-slate-600"><span>{ticks.length} live ticks collected</span><span>{lastUpdate ? new Date(lastUpdate * 1000).toLocaleTimeString() : 'No update yet'}</span></div>
              </div>
              <div className="rounded-3xl border border-white/[0.08] bg-[#0c1420] p-5 sm:p-6"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Your platform</p><h3 className="mt-1 text-lg font-bold">Workspace modules</h3><div className="mt-4 space-y-2">{NAV.slice(1).map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setPage(id)} className="flex w-full items-center gap-3 rounded-xl border border-white/[0.055] bg-white/[0.02] px-3 py-3 text-left text-xs text-slate-300 transition hover:border-cyan-300/20 hover:bg-cyan-300/[0.04]"><Icon size={15} className="text-cyan-300" />{label}<span className="ml-auto text-[10px] text-slate-600">Open</span></button>)}</div></div>
            </section>
          </>}

          {page === 'notifications' ? <section className="mt-7 rounded-3xl border border-white/[0.08] bg-[#0c1420] p-5 sm:p-7"><div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.08] text-cyan-200"><Bell size={22} /></div><h2 className="mt-5 text-2xl font-bold">Notifications</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Register this Android device for secure Appwrite-backed push alerts and send a real delivery test.</p><IndependentPushSettings /></section> : page !== 'overview' && <section className="mt-7 rounded-3xl border border-white/[0.08] bg-[#0c1420] p-6 sm:p-8"><div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.08] text-cyan-200"><Sparkles size={22} /></div><h2 className="mt-5 text-2xl font-bold">{title}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{pageDescription(page)}</p><div className="mt-6 rounded-2xl border border-amber-300/15 bg-amber-300/[0.045] p-4"><p className="text-sm font-semibold text-amber-100">Secure integration required</p><p className="mt-1 text-xs leading-5 text-slate-400">This module is present in the independent workspace. Its live records and actions will appear after the Appwrite tables and authenticated API services are connected. No sample trades, balances, referrals or signals are fabricated.</p></div><button onClick={() => setPage('overview')} className="mt-5 rounded-xl border border-white/10 px-4 py-2.5 text-xs font-semibold text-slate-300 hover:bg-white/[0.05]">Back to overview</button></section>}
          <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-5 text-[10px] text-slate-600"><span>SUPERTECH AI · Be part of the AI revolution.</span><span>Signed in securely · Appwrite</span></footer>
        </main>
      </div>
    </div>
  );
}

function Metric({ label, value, note, icon: Icon }: { label: string; value: string; note: string; icon: typeof Activity }) {
  return <div className="rounded-2xl border border-white/[0.08] bg-[#0c1420] p-4"><div className="flex items-center justify-between"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p><Icon size={16} className="text-cyan-300" /></div><p className="mt-3 text-xl font-bold tracking-tight">{value}</p><p className="mt-1 text-[11px] text-slate-500">{note}</p></div>;
}

function pageDescription(page: Page) {
  const descriptions: Record<Page, string> = {
    overview: 'Your market overview.',
    signals: 'Live strategy signals will be listed here with clear BUY or SELL direction, entry, protection and target levels.',
    super: 'The strongest opportunity is shown when independent strategies and the selected timeframes agree.',
    crypto: 'Your crypto watchlist, market movers and exchange opportunities will be connected to the independent market service.',
    options: 'Deriv Options automation will use the SuperTech AI trend-end engine and a simple account connection flow.',
    orders: 'Review qualifying pending-order opportunities, their entry conditions, protection and target before execution.',
    history: 'A complete record of signal events, strategy decisions and automation activity.',
    notifications: 'Manage signal alerts, price notifications and important account updates.',
    referrals: 'Your personal invitation link, member network and referral activity.',
    finance: 'A clear view of membership, earnings, withdrawals and financial activity.',
    health: 'Live status of authentication, market feeds, strategy services, notifications and connected brokers.',
  };
  return descriptions[page];
}
