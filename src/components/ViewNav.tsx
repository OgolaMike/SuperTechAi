import { Bell, Coins, Database, LayoutDashboard, ListOrdered, Sparkles, Users, Cable, Wallet, UserRoundPlus, Landmark, Bitcoin, Network, GraduationCap, Activity, Gavel } from 'lucide-react';

export type View = 'dashboard' | 'super' | 'crypto' | 'records' | 'orders' | 'alerts' | 'admin' | 'mt5' | 'referrals' | 'earnings' | 'finance' | 'binance' | 'binance-futures' | 'network' | 'academy' | 'governance';

const VIEWS: { id: View; label: string; icon: typeof LayoutDashboard; adminOnly?: boolean }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'governance', label: 'Owners Centre', icon: Gavel, adminOnly: true },
  { id: 'academy', label: 'Academy', icon: GraduationCap },
  { id: 'records', label: 'Signals', icon: Database },
  { id: 'orders', label: 'Pending Orders', icon: ListOrdered },
  { id: 'mt5', label: 'Connect MT5', icon: Cable },
  { id: 'binance', label: 'Binance Spot', icon: Bitcoin },
  { id: 'binance-futures', label: 'Binance Futures', icon: Activity },
  { id: 'crypto', label: 'Crypto', icon: Coins },
  { id: 'super', label: 'Super Signal', icon: Sparkles },
  { id: 'alerts', label: 'Alerts', icon: Bell },
  { id: 'network', label: 'Network', icon: Network },
  { id: 'referrals', label: 'My Referrals', icon: UserRoundPlus },
  { id: 'earnings', label: 'My Earnings', icon: Wallet },
  { id: 'finance', label: 'Finance Admin', icon: Landmark, adminOnly: true },
  { id: 'admin', label: 'Members', icon: Users, adminOnly: true },
];

type Props = {
  view: View;
  isAdmin: boolean;
  onChange: (view: View) => void;
};

export function ViewNav({ view, isAdmin, onChange }: Props) {
  return (
    <nav className="flex w-full max-w-full flex-wrap rounded-xl border border-line/10 bg-surface/[0.03] p-1 sm:w-auto" aria-label="Sections">
      {VIEWS.filter(({ adminOnly }) => !adminOnly || isAdmin).map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          aria-current={view === id ? 'page' : undefined}
          className={`flex min-w-0 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-center text-sm font-medium transition-all duration-200 sm:px-4 ${
            view === id ? 'glow-ring bg-surface/[0.09] text-ink' : 'text-ink-2 hover:text-ink'
          }`}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
