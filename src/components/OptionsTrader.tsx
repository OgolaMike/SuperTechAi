import { useState } from 'react';
import { Activity, ArrowUpRight, CheckCircle2, Clock3, LockKeyhole, Wallet } from 'lucide-react';

type AccountMode = 'demo' | 'real';
type ContractMode = 'touch' | 'no-touch' | 'both';

function Choice<T extends string>({ value, options, onChange }: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-xl border border-line/15 bg-surface/[0.045] p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${value === option.value ? 'bg-surface/[0.14] text-ink shadow-sm' : 'text-ink-2 hover:text-ink'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function OptionsTrader() {
  const [account, setAccount] = useState<AccountMode>('demo');
  const [contract, setContract] = useState<ContractMode>('both');
  const [stake, setStake] = useState('1');
  const [automationEnabled, setAutomationEnabled] = useState(false);
  const connected = false;

  return (
    <section className="mt-6 space-y-5">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Deriv options</p>
        <h2 className="text-2xl font-semibold tracking-tight text-ink">Options Trader</h2>
        <p className="max-w-xl text-sm text-ink-2">Let SuperTech AI find and manage Touch and No Touch opportunities automatically.</p>
      </header>

      <div className="rounded-2xl border border-line/15 bg-surface/[0.04] p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-line/15 bg-surface/[0.07]">
              <Wallet className="h-5 w-5 text-accent" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">Deriv account</p>
              <p className="text-xs text-ink-2">Not connected</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/25 px-2.5 py-1 text-[11px] font-medium text-amber-400">
            <LockKeyhole className="h-3.5 w-3.5" /> Setup required
          </span>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-ink-2">Connect your Deriv account to enable automatic trading. No trades can be placed until the secure account connection is complete.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-line/15 bg-surface/[0.04] p-4 sm:p-5">
          <label className="mb-2 block text-sm font-semibold text-ink">Account</label>
          <Choice
            value={account}
            onChange={setAccount}
            options={[{ value: 'demo', label: 'Demo' }, { value: 'real', label: 'Real' }]}
          />
          <p className="mt-2 text-xs text-ink-3">{account === 'demo' ? 'Practice with virtual funds.' : 'Real-money account. Trading will require explicit account authorization.'}</p>

          <div className="mb-2 mt-5 text-sm font-semibold text-ink">Trading type</div>
          <div className="grid grid-cols-3 gap-1 rounded-xl border border-line/15 bg-surface/[0.045] p-1">
            {([
              { value: 'touch', label: 'Touch' },
              { value: 'no-touch', label: 'No Touch' },
              { value: 'both', label: 'Both' },
            ] as Array<{ value: ContractMode; label: string }>).map((option) => (
              <button key={option.value} type="button" onClick={() => setContract(option.value)} aria-pressed={contract === option.value}
                className={`rounded-lg px-2 py-2.5 text-xs font-semibold transition-colors sm:text-sm ${contract === option.value ? 'bg-surface/[0.14] text-ink shadow-sm' : 'text-ink-2 hover:text-ink'}`}>
                {option.label}
              </button>
            ))}
          </div>

          <label htmlFor="options-stake" className="mb-2 mt-5 block text-sm font-semibold text-ink">Stake per trade</label>
          <div className="flex items-center gap-2 rounded-xl border border-line/15 bg-surface/[0.045] px-3 py-2.5">
            <span className="text-sm text-ink-2">$</span>
            <input id="options-stake" type="number" min="0.35" step="0.01" inputMode="decimal" value={stake}
              onChange={(event) => setStake(event.target.value)} className="w-full bg-transparent text-base font-semibold text-ink outline-none" />
          </div>
          <p className="mt-2 text-xs text-ink-3">The final minimum and currency will be checked against your Deriv account.</p>
        </div>

        <div className="space-y-4 rounded-2xl border border-line/15 bg-surface/[0.04] p-4 sm:p-5">
          <div>
            <p className="text-sm font-semibold text-ink">Market selection</p>
            <p className="mt-1 text-sm text-ink-2">All eligible Deriv markets</p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-line/10 bg-surface/[0.035] p-3 text-xs text-ink-2">
            <Activity className="h-4 w-4 shrink-0 text-accent" />
            SuperTech AI selects suitable markets automatically.
          </div>
          <div className="border-t border-line/10 pt-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">Auto Trading</p>
                <p className="mt-1 text-xs text-ink-2">{automationEnabled ? 'Automation is on' : 'Automation is off'}</p>
              </div>
              <button type="button" role="switch" aria-checked={automationEnabled} disabled={!connected}
                onClick={() => setAutomationEnabled((enabled) => !enabled)}
                className={`relative h-7 w-12 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${automationEnabled ? 'bg-emerald-500' : 'bg-surface/[0.2]'}`}
                aria-label="Toggle automatic trading">
                <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${automationEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-ink-3">Connect your Deriv account before turning automation on. The same switch will activate or deactivate trading.</p>
          </div>
          <div className="rounded-xl border border-line/10 bg-surface/[0.035] p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-ink"><CheckCircle2 className="h-4 w-4 text-accent" /> Simple by design</div>
            <p className="mt-1 text-xs leading-relaxed text-ink-2">Analysis, contract choice, expiry and trade monitoring are handled by SuperTech AI.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Today's trades", value: '—', icon: Activity },
          { label: "Today's profit", value: '—', icon: Wallet },
          { label: 'Open contracts', value: '—', icon: Clock3 },
        ].map((item) => {
          const Icon = item.icon;
          return <div key={item.label} className="rounded-2xl border border-line/15 bg-surface/[0.04] p-4">
            <div className="flex items-center gap-2 text-xs text-ink-2"><Icon className="h-4 w-4 text-accent" />{item.label}</div>
            <p className="mt-3 text-2xl font-semibold text-ink">{item.value}</p>
          </div>;
        })}
      </div>

      <div className="rounded-2xl border border-line/15 bg-surface/[0.035] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-ink">Recent trades</h3>
            <p className="mt-1 text-xs text-ink-2">Your completed and active options trades will appear here.</p>
          </div>
          <ArrowUpRight className="h-4 w-4 text-ink-3" />
        </div>
        <div className="mt-4 rounded-xl border border-dashed border-line/20 px-4 py-8 text-center text-sm text-ink-3">
          No trades to display yet.
        </div>
      </div>
    </section>
  );
}
