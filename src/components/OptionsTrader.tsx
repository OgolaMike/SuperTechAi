import { useMemo, useState } from 'react';
import { Activity, ArrowUpRight, CheckCircle2, Clock3, LockKeyhole, Wallet } from 'lucide-react';
import type { Asset, TfState } from '@/lib/sma';
import type { SuperSignal } from '@/lib/intelligence';
import type { ConfluenceResult } from '@/lib/strategyConfluence';

type AccountMode = 'demo' | 'real';
type ContractMode = 'touch' | 'no-touch' | 'both';
type Props = {
  assets: Asset[];
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
  return (
    <div className="grid grid-cols-2 gap-1 rounded-xl border border-line/15 bg-surface/[0.045] p-1">
      {options.map((option) => (
        <button key={option.value} type="button" onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${value === option.value ? 'bg-surface/[0.14] text-ink shadow-sm' : 'text-ink-2 hover:text-ink'}`}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function OptionsTrader({ assets, states, prices, superSignals, confluenceResults, nowEpoch, loaded }: Props) {
  const [account, setAccount] = useState<AccountMode>('demo');
  const [contract, setContract] = useState<ContractMode>('both');
  const [stake, setStake] = useState('1');
  const [automationEnabled, setAutomationEnabled] = useState(false);
  const connected = false;

  const opportunities = useMemo(() => {
    const signalBySymbol = new Map(superSignals.map((signal) => [signal.symbol, signal]));
    const assetBySymbol = new Map(assets.map((asset) => [asset.symbol, asset]));
    return confluenceResults
      .filter((result) => result.status === 'HIGH_CONFLUENCE' && result.direction)
      .map((result) => {
        const asset = assetBySymbol.get(result.symbol);
        const signal = signalBySymbol.get(result.symbol);
        return asset && signal && nowEpoch >= signal.signalEpoch && nowEpoch - signal.signalEpoch <= 8 * 14400
          ? { asset, signal, result, price: prices[result.symbol] ?? null }
          : null;
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => b.result.score - a.result.score);
  }, [assets, confluenceResults, nowEpoch, prices, superSignals]);

  const strategySignals = useMemo(
    () => confluenceResults.reduce((count, result) => count + result.assessments.filter((item) => item.status === 'SIGNAL').length, 0),
    [confluenceResults],
  );

  return (
    <section className="mt-6 space-y-5">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Deriv options</p>
        <h2 className="text-2xl font-semibold tracking-tight text-ink">Options Trader</h2>
        <p className="max-w-xl text-sm text-ink-2">One SuperTech AI brain. Touch and No Touch execution.</p>
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
        <p className="mt-4 text-sm leading-relaxed text-ink-2">Connect your Deriv account to enable automatic trading. Your existing SuperTech AI intelligence already supplies the market analysis.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-line/15 bg-surface/[0.04] p-4 sm:p-5">
          <label className="mb-2 block text-sm font-semibold text-ink">Account</label>
          <Choice value={account} onChange={setAccount} options={[{ value: 'demo', label: 'Demo' }, { value: 'real', label: 'Real' }]} />
          <p className="mt-2 text-xs text-ink-3">{account === 'demo' ? 'Practice with virtual funds.' : 'Real-money trading requires your explicit Deriv authorization.'}</p>

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
          <p className="mt-2 text-xs text-ink-3">The account currency and minimum stake will be checked automatically.</p>
        </div>

        <div className="space-y-4 rounded-2xl border border-line/15 bg-surface/[0.04] p-4 sm:p-5">
          <div>
            <p className="text-sm font-semibold text-ink">Markets</p>
            <p className="mt-1 text-sm text-ink-2">All eligible Deriv markets</p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-line/10 bg-surface/[0.035] p-3 text-xs text-ink-2">
            <Activity className="h-4 w-4 shrink-0 text-accent" />
            Market analysis is shared with the main SuperTech AI engine.
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
            <p className="mt-3 text-xs leading-relaxed text-ink-3">Use this switch to activate or deactivate automatic trading.</p>
          </div>
          <div className="rounded-xl border border-line/10 bg-surface/[0.035] p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-ink"><CheckCircle2 className="h-4 w-4 text-accent" /> Intelligence connected</div>
            <p className="mt-1 text-xs leading-relaxed text-ink-2">Trend, independent strategies and confluence are supplied by the existing SuperTech AI engines.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-line/15 bg-surface/[0.04] p-4">
          <div className="flex items-center gap-2 text-xs text-ink-2"><Activity className="h-4 w-4 text-accent" /> Deriv markets</div>
          <p className="mt-3 text-2xl font-semibold text-ink">{assets.length}</p>
        </div>
        <div className="rounded-2xl border border-line/15 bg-surface/[0.04] p-4">
          <div className="flex items-center gap-2 text-xs text-ink-2"><CheckCircle2 className="h-4 w-4 text-accent" /> Strategy signals</div>
          <p className="mt-3 text-2xl font-semibold text-ink">{strategySignals}</p>
        </div>
        <div className="rounded-2xl border border-line/15 bg-surface/[0.04] p-4">
          <div className="flex items-center gap-2 text-xs text-ink-2"><Clock3 className="h-4 w-4 text-accent" /> Qualified opportunities</div>
          <p className="mt-3 text-2xl font-semibold text-ink">{opportunities.length}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-line/15 bg-surface/[0.035] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-ink">Market opportunities</h3>
            <p className="mt-1 text-xs text-ink-2">Ranked using existing SuperTech AI confluence. These are analysis results, not executed contracts.</p>
          </div>
          <ArrowUpRight className="h-4 w-4 text-ink-3" />
        </div>
        {!loaded ? <p className="mt-4 text-sm text-ink-3">Connecting to market intelligence…</p> :
          opportunities.length === 0 ? <p className="mt-4 rounded-xl border border-dashed border-line/20 px-4 py-8 text-center text-sm text-ink-3">Waiting for a qualified market opportunity.</p> :
          <div className="mt-4 space-y-2">
            {opportunities.slice(0, 6).map(({ asset, signal, result, price }) => (
              <div key={asset.symbol} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line/10 bg-surface/[0.035] p-3">
                <div>
                  <p className="text-sm font-semibold text-ink">{asset.name}</p>
                  <p className="mt-1 text-xs text-ink-2">{result.direction} · {result.agreementCount} strategies agree · {result.score}/100 evidence score</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-ink">{price == null ? '—' : price.toFixed(asset.digits)}</p>
                  <p className="mt-1 text-[11px] text-ink-3">{signal.classification}</p>
                </div>
              </div>
            ))}
          </div>}
      </div>

      <div className="rounded-2xl border border-line/15 bg-surface/[0.035] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-ink">Recent trades</h3>
            <p className="mt-1 text-xs text-ink-2">Completed and active options trades will appear here.</p>
          </div>
          <ArrowUpRight className="h-4 w-4 text-ink-3" />
        </div>
        <div className="mt-4 rounded-xl border border-dashed border-line/20 px-4 py-8 text-center text-sm text-ink-3">No trades to display yet.</div>
      </div>
    </section>
  );
}
