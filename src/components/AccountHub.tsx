import { useState } from 'react';
import { Network, Users, Wallet } from 'lucide-react';
import { FinancePanel } from '@/components/FinancePanel';
import { NetworkPanel } from '@/components/NetworkPanel';

type AccountTab = 'referrals' | 'network' | 'earnings';

const tabs: { id: AccountTab; label: string; icon: typeof Users }[] = [
  { id: 'referrals', label: 'Referrals', icon: Users },
  { id: 'network', label: 'My Network', icon: Network },
  { id: 'earnings', label: 'Earnings', icon: Wallet },
];

export function AccountHub() {
  const [tab, setTab] = useState<AccountTab>('referrals');

  return (
    <section className="mt-8 space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Your membership · your growth</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">My Account</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-2">Manage your invitations, follow your network and keep track of your earnings in one place.</p>
      </div>
      <div className="grid grid-cols-3 gap-2 rounded-2xl border border-line/10 bg-surface/[0.035] p-1.5">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" onClick={() => setTab(id)} aria-pressed={tab === id}
            className={`flex min-w-0 items-center justify-center gap-2 rounded-xl px-2 py-3 text-xs font-semibold transition-colors sm:text-sm ${tab === id ? 'bg-surface/[0.14] text-ink shadow-sm' : 'text-ink-2 hover:bg-surface/[0.06]'}`}>
            <Icon className="h-4 w-4 shrink-0" /><span className="truncate">{label}</span>
          </button>
        ))}
      </div>
      {tab === 'referrals' && <FinancePanel initialTab="referrals" />}
      {tab === 'network' && <NetworkPanel />}
      {tab === 'earnings' && <FinancePanel initialTab="wallet" />}
    </section>
  );
}
