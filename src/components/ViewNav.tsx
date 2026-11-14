import { useState } from 'react';
import {
  Activity, BarChart3, Bell, Bot, Cable, ChevronUp,
  GraduationCap, Gavel, Landmark, LayoutDashboard, Link2, ListOrdered,
  Megaphone, MoreHorizontal, Repeat2, Sparkles, Users,
  UserRoundPlus, X,
} from 'lucide-react';

export type View = 'dashboard' | 'ctrader' | 'super' | 'crypto' | 'deriv-market' | 'exchange-markets' | 'records' | 'orders' | 'alerts' | 'admin' | 'mt5' | 'referrals' | 'earnings' | 'finance' | 'binance' | 'okx' | 'network' | 'academy' | 'governance' | 'break-retest' | 'strategies' | 'marketing' | 'connections';

type NavItem = { id: View; label: string; mobileLabel?: string; icon: typeof LayoutDashboard; adminOnly?: boolean };

const PRIMARY: NavItem[] = [
  { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
  { id: 'super', label: 'Super Signals', icon: Sparkles },
  { id: 'crypto', label: 'Crypto Market', mobileLabel: 'Crypto', icon: BarChart3 },
  { id: 'deriv-market', label: 'Deriv Market', mobileLabel: 'Deriv', icon: Activity },
  { id: 'exchange-markets', label: 'Exchange Markets', mobileLabel: 'Exchanges', icon: BarChart3 },
  { id: 'binance', label: 'Automated Trading', mobileLabel: 'Automate', icon: Bot },
  { id: 'referrals', label: 'Account', icon: UserRoundPlus },
];

const MORE_GROUPS: { title: string; items: NavItem[] }[] = [
  { title: 'Intelligence', items: [
    { id: 'strategies', label: 'Strategies', icon: BarChart3 },
    { id: 'break-retest', label: 'Break & Retest', icon: Repeat2 },
    { id: 'orders', label: 'Pending Orders', icon: ListOrdered },
    { id: 'academy', label: 'Academy', icon: GraduationCap },
  ] },
  { title: 'Trading connections', items: [
    { id: 'connections', label: 'Connections', icon: Link2 },
    { id: 'ctrader', label: 'Connect cTrader', icon: Cable },
    { id: 'mt5', label: 'Connect MT5', icon: Cable },
    { id: 'okx', label: 'OKX Futures', icon: Activity },
  ] },
  { title: 'Your space', items: [
    { id: 'alerts', label: 'Alerts & service health', icon: Bell },
  ] },
  { title: 'Owner tools', items: [
    { id: 'governance', label: 'Owners Centre', icon: Gavel, adminOnly: true },
    { id: 'marketing', label: 'Marketing Studio', icon: Megaphone, adminOnly: true },
    { id: 'finance', label: 'Finance Admin', icon: Landmark, adminOnly: true },
    { id: 'admin', label: 'Members', icon: Users, adminOnly: true },
  ] },
];


const preloadCache = new Map<View, Promise<unknown>>();

function preloadView(view: View): void {
  if (preloadCache.has(view)) return;
  const loaders: Partial<Record<View, () => Promise<unknown>>> = {
    dashboard: () => import('@/components/DashboardView'),
    ctrader: () => import('@/components/CTraderAutoTrading'),
    super: () => import('@/components/SuperSignalPanel'),
    crypto: () => import('@/components/CryptoMovers'),
    'deriv-market': () => import('@/components/DerivMarket'),
    'exchange-markets': () => import('@/components/ExchangeMarkets'),
    records: () => import('@/components/RecordsPanel'),
    orders: () => import('@/components/PendingOrdersPanel'),
    alerts: () => Promise.all([import('@/components/NotificationSettings'), import('@/components/ServiceHealth')]),
    admin: () => import('@/components/AdminPanel'),
    mt5: () => import('@/components/Mt5AutoTrading'),
    referrals: () => import('@/components/AccountHub'),
    earnings: () => import('@/components/AccountHub'),
    finance: () => import('@/components/FinancePanel'),
    binance: () => Promise.all([import('@/components/BinanceSpotAutomation'), import('@/components/BinanceFuturesAutomation')]),
    okx: () => import('@/components/OKXFuturesAutomation'),
    network: () => import('@/components/NetworkPanel'),
    academy: () => import('@/components/SuperTechAcademy'),
    governance: () => import('@/components/GovernancePanel'),
    'break-retest': () => import('@/components/BreakRetestPanel'),
    marketing: () => import('@/components/MarketingStudio'),
    connections: () => import('@/components/AutomationConnections'),
  };
  const load = loaders[view];
  if (!load) return;
  const pending = load().catch((error) => {
    preloadCache.delete(view);
    throw error;
  });
  preloadCache.set(view, pending);
  void pending.catch(() => undefined);
}

type Props = { view: View; isAdmin: boolean; onChange: (view: View) => void };

export function ViewNav({ view, isAdmin, onChange }: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const accountViews: View[] = ['referrals', 'earnings', 'network'];
  const tradeViews: View[] = ['binance', 'ctrader', 'mt5', 'okx', 'orders'];
  const primaryActive = (id: View) => id === 'referrals'
    ? accountViews.includes(view)
    : id === 'binance' ? tradeViews.includes(view) : view === id;
  const moreItems = MORE_GROUPS.flatMap((group) => group.items).filter((item) => !item.adminOnly || isAdmin);
  const isMoreActive = moreItems.some((item) => item.id === view) && !PRIMARY.some((item) => primaryActive(item.id));

  const choose = (id: View) => {
    onChange(id);
    setMoreOpen(false);
  };

  return (
    <>
      <nav className="hidden w-full items-center gap-1 rounded-2xl border border-line/10 bg-surface/[0.035] p-1.5 lg:flex lg:w-auto" aria-label="Main navigation">
        {PRIMARY.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" onPointerEnter={() => preloadView(id)} onFocus={() => preloadView(id)} onClick={() => choose(id)} aria-current={primaryActive(id) ? 'page' : undefined}
            className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 ${primaryActive(id) ? 'glow-ring bg-surface/[0.12] text-ink shadow-sm' : 'text-ink-2 hover:bg-surface/[0.07] hover:text-ink'}`}>
            <Icon className="h-4 w-4 shrink-0" /><span>{label}</span>
          </button>
        ))}
        <div className="relative">
          <button type="button" onClick={() => setMoreOpen((open) => !open)} aria-expanded={moreOpen}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${isMoreActive || moreOpen ? 'bg-surface/[0.12] text-ink' : 'text-ink-2 hover:bg-surface/[0.07] hover:text-ink'}`}>
            <MoreHorizontal className="h-4 w-4" /> More <ChevronUp className={`h-3.5 w-3.5 transition-transform ${moreOpen ? '' : 'rotate-180'}`} />
          </button>
          {moreOpen && <div className="absolute left-0 top-full z-50 mt-2 w-72 rounded-2xl border border-line/15 bg-canvas p-3 shadow-2xl">
            {MORE_GROUPS.map((group) => {
              const items = group.items.filter((item) => !item.adminOnly || isAdmin);
              return items.length ? <div key={group.title} className="mb-3 last:mb-0">
                <p className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-3">{group.title}</p>
                <div className="grid gap-1">{items.map(({ id, label: itemLabel, icon: ItemIcon }) => (
                  <button key={id} type="button" onPointerEnter={() => preloadView(id)} onFocus={() => preloadView(id)} onClick={() => choose(id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${view === id ? 'bg-surface/[0.12] text-ink' : 'text-ink-2 hover:bg-surface/[0.07] hover:text-ink'}`}>
                    <ItemIcon className="h-4 w-4" />{itemLabel}
                  </button>
                ))}</div>
              </div> : null;
            })}
          </div>}
        </div>
      </nav>

      <nav className="fixed inset-x-0 bottom-0 z-[60] border-t border-line/15 bg-canvas/95 px-2 pb-[max(env(safe-area-inset-bottom),0.45rem)] pt-2 shadow-[0_-12px_36px_rgba(0,0,0,0.18)] backdrop-blur-xl lg:hidden" aria-label="Main navigation">
        <div className="mx-auto grid max-w-xl grid-cols-7 gap-1">
          {PRIMARY.map(({ id, label, mobileLabel, icon: Icon }) => (
            <button key={id} type="button" onClick={() => choose(id)} aria-current={primaryActive(id) ? 'page' : undefined}
              className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-semibold transition-colors ${primaryActive(id) ? 'text-accent' : 'text-ink-3'}`}>
              <span className={`flex h-8 w-10 items-center justify-center rounded-xl ${primaryActive(id) ? 'bg-accent/10' : ''}`}><Icon className="h-[19px] w-[19px]" /></span>
              <span className="truncate">{mobileLabel ?? label}</span>
            </button>
          ))}
          <button type="button" onClick={() => setMoreOpen((open) => !open)} aria-expanded={moreOpen}
            className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-semibold ${isMoreActive || moreOpen ? 'text-accent' : 'text-ink-3'}`}>
            <span className={`flex h-8 w-10 items-center justify-center rounded-xl ${isMoreActive || moreOpen ? 'bg-accent/10' : ''}`}><MoreHorizontal className="h-[19px] w-[19px]" /></span>
            <span>More</span>
          </button>
        </div>
        {moreOpen && <div className="absolute inset-x-3 bottom-full mb-2 max-h-[65vh] overflow-y-auto rounded-2xl border border-line/15 bg-canvas p-4 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-ink">All services</p>
            <button type="button" onClick={() => setMoreOpen(false)} aria-label="Close services" className="rounded-lg p-1.5 text-ink-2 hover:bg-surface/[0.08]"><X className="h-4 w-4" /></button>
          </div>
          {MORE_GROUPS.map((group) => {
            const items = group.items.filter((item) => !item.adminOnly || isAdmin);
            return items.length ? <div key={group.title} className="mb-4 last:mb-0">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-3">{group.title}</p>
              <div className="grid grid-cols-2 gap-2">{items.map(({ id, label: itemLabel, icon: ItemIcon }) => (
                <button key={id} type="button" onPointerEnter={() => preloadView(id)} onFocus={() => preloadView(id)} onClick={() => choose(id)} className={`flex min-h-12 items-center gap-2 rounded-xl border border-line/10 px-3 py-2 text-left text-xs font-medium ${view === id ? 'bg-surface/[0.12] text-ink' : 'bg-surface/[0.035] text-ink-2'}`}>
                  <ItemIcon className="h-4 w-4 shrink-0" /><span>{itemLabel}</span>
                </button>
              ))}</div>
            </div> : null;
          })}
        </div>}
      </nav>
    </>
  );
}
