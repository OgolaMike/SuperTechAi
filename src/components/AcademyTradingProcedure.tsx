import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BookOpenCheck, CheckCircle2, ChevronDown, ClipboardCheck, RotateCcw, ShieldCheck, Target } from 'lucide-react';

const STORAGE_KEY = 'supertech-academy-trading-procedure-v1';

const PROCEDURE = [
  {
    title: 'Prepare before opening the chart',
    purpose: 'Start calm, focused and ready to follow rules—not to chase a move.',
    checks: [
      'Choose one market and a small watchlist. Do not jump between assets looking for excitement.',
      'Decide how long you can focus and avoid trading when tired, rushed, angry or distracted.',
      'Check the economic calendar and market conditions. Be cautious around major announcements and unusual volatility.',
    ],
    rule: 'If you cannot give the market your attention, do not trade.'
  },
  {
    title: 'Check whether the market is suitable',
    purpose: 'A good trader is selective. No setup is also a valid outcome.',
    checks: [
      'Confirm the market is open and your broker or exchange connection is healthy.',
      'Check the current spread, fees, liquidity and whether price is moving unusually fast.',
      'Avoid instruments you do not understand and avoid trading simply because an asset is moving.',
    ],
    rule: 'If costs, data or market conditions look abnormal, stand aside.'
  },
  {
    title: 'Read the bigger picture on H4',
    purpose: 'Use H4 to understand the broad direction before considering an entry.',
    checks: [
      'Open the H4 chart and decide whether the market is generally rising, falling or moving sideways.',
      'Mark the nearest important support and resistance areas.',
      'Ask whether price is trending, pulling back, ranging or showing signs of a possible change.',
    ],
    rule: 'Do not let a small short-term move make you ignore the bigger picture.'
  },
  {
    title: 'Wait for M15 confirmation',
    purpose: 'M15 is the lowest timeframe in the SuperTech AI Dual Engine procedure.',
    checks: [
      'Use M15 to inspect the setup and wait for the candle to close when confirmation depends on a closing price.',
      'Check whether M15 supports the H4 picture. If they conflict, wait or skip the trade.',
      'Do not chase a candle that has already made a large move. Wait for a fresh, understandable setup.',
    ],
    rule: 'Never drop to M1 or M5 to force a trade. If M15 is unclear, there is no trade.'
  },
  {
    title: 'Write the trade plan before entry',
    purpose: 'Know exactly what would make the idea valid and what would prove it wrong.',
    checks: [
      'Write the reason for the trade in one sentence and identify the confirmation you are waiting for.',
      'Choose the entry method and price area. Do not enter just because a signal appeared.',
      'Set a stop-loss at a logical invalidation point and identify a realistic target before entering.',
      'Check that the potential reward is worth the risk after spread, fees and possible slippage.',
    ],
    rule: 'If you cannot explain the entry, stop and target clearly, do not place the trade.'
  },
  {
    title: 'Calculate the risk and position size',
    purpose: 'Decide the amount you can lose before deciding how much to trade.',
    checks: [
      'Choose a small, affordable amount to risk. Beginners can use 0.5%–1% of account equity as an educational ceiling to study—not a guarantee or universal rule.',
      'Calculate position size from the distance to the stop-loss and the amount at risk. Do not choose size based on hoped-for profit.',
      'Include leverage, margin, fees and the possibility of slippage in your decision.',
      'Never use borrowed money, essential living money or money you cannot afford to lose.',
    ],
    rule: 'If the correct position size is too small for your preference, skip the trade. Never widen the stop to fit a larger position.'
  },
  {
    title: 'Execute and manage without improvising',
    purpose: 'Once in a trade, follow the plan instead of reacting emotionally to every price change.',
    checks: [
      'Check the symbol, direction, order type, size, entry, stop-loss and target before confirming.',
      'Never assume an alert means an order was placed or that an order was filled. Verify the actual broker or exchange status.',
      'Do not remove the stop-loss, move it farther away to avoid a loss, double down or add to a losing trade impulsively.',
      'If using automation, verify account connection, allowed assets, order rules and risk limits. Monitor execution.',
    ],
    rule: 'A planned loss is part of trading. Protect the account; do not turn a small loss into an uncontrolled one.'
  },
  {
    title: 'Record the result and review',
    purpose: 'Improve through evidence and repetition, not through memory or one lucky outcome.',
    checks: [
      'Record the date, asset, H4 context, M15 confirmation, entry, stop, target and risk.',
      'Save a chart screenshot and note whether you followed every rule.',
      'Record the result honestly, including fees. A winning trade that broke your rules is not a good process.',
      'Review a group of trades before changing the strategy. Practise on a demo account until you can follow the procedure consistently.',
    ],
    rule: 'Your goal as a beginner is to build a repeatable process—not to make money every day.'
  },
];

export function AcademyTradingProcedure() {
  const [done, setDone] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(0);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (Array.isArray(saved)) setDone(saved.filter((item): item is string => typeof item === 'string'));
    } catch { /* Start with a clean checklist if local progress is unavailable. */ }
  }, []);

  const allChecks = useMemo(() => PROCEDURE.flatMap((step, stepIndex) => step.checks.map((_, checkIndex) => stepIndex + ':' + checkIndex)), []);
  const progress = Math.round(allChecks.filter((key) => done.includes(key)).length / allChecks.length * 100);

  const toggle = (key: string) => {
    setDone((current) => {
      const next = current.includes(key) ? current.filter((item) => item !== key) : [...current, key];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const reset = () => {
    setDone([]);
    localStorage.removeItem(STORAGE_KEY);
    setExpanded(0);
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-cyan-300/20 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white shadow-xl">
      <div className="border-b border-white/10 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/25 bg-cyan-300/10 text-cyan-200"><BookOpenCheck className="h-6 w-6" /></div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200">Beginner field guide</p>
              <h2 className="mt-1 text-xl font-bold sm:text-2xl">Your Trading Procedure</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-300">A simple routine to follow before, during and after every trade. Work through the steps in order. You do not have to trade every day.</p>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-slate-400">Checklist progress</p>
            <p className="mt-1 text-xl font-bold text-cyan-200">{progress}%</p>
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300 transition-all" style={{ width: progress + '%' }} /></div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-400">Your checklist is saved on this device.</p>
          <button onClick={reset} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-cyan-300/30 hover:text-white"><RotateCcw className="h-3.5 w-3.5" /> Reset checklist</button>
        </div>
      </div>

      <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[0.72fr_1.28fr]">
        <div className="space-y-2">
          {PROCEDURE.map((step, index) => {
            const count = step.checks.filter((_, checkIndex) => done.includes(index + ':' + checkIndex)).length;
            return <button key={step.title} onClick={() => setExpanded(index)} className={'w-full rounded-xl border p-3 text-left transition ' + (expanded === index ? 'border-cyan-300/40 bg-cyan-300/[0.08]' : 'border-white/10 bg-white/[0.025] hover:border-white/20')}>
              <div className="flex items-center gap-3">
                <span className={'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold ' + (count === step.checks.length ? 'border-emerald-300/40 bg-emerald-300/10 text-emerald-200' : 'border-white/15 text-cyan-100')}>{count === step.checks.length ? <CheckCircle2 className="h-4 w-4" /> : String(index + 1).padStart(2, '0')}</span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-white">{step.title}</span><span className="mt-1 block text-[10px] text-slate-400">{count}/{step.checks.length} completed</span></span>
                <ChevronDown className={'h-4 w-4 shrink-0 text-slate-400 transition ' + (expanded === index ? 'rotate-180' : '')} />
              </div>
            </button>;
          })}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:p-5">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200"><Target className="h-4 w-4" /> Step {String(expanded + 1).padStart(2, '0')} of {PROCEDURE.length}</div>
          <h3 className="mt-2 text-lg font-bold text-white">{PROCEDURE[expanded].title}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-300">{PROCEDURE[expanded].purpose}</p>
          <div className="mt-4 space-y-3">
            {PROCEDURE[expanded].checks.map((check, index) => {
              const key = expanded + ':' + index;
              return <label key={key} className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-slate-950/50 p-3 hover:border-cyan-300/25">
                <input type="checkbox" checked={done.includes(key)} onChange={() => toggle(key)} className="mt-0.5 h-4 w-4 shrink-0 accent-cyan-300" />
                <span className={'text-sm leading-6 ' + (done.includes(key) ? 'text-slate-500 line-through' : 'text-slate-200')}>{check}</span>
              </label>;
            })}
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
            <div><p className="text-[10px] font-bold uppercase tracking-wider text-amber-100">Remember</p><p className="mt-1 text-xs leading-5 text-slate-200">{PROCEDURE[expanded].rule}</p></div>
          </div>
          <div className="mt-4 flex flex-wrap justify-between gap-2">
            <button onClick={() => setExpanded((value) => Math.max(0, value - 1))} disabled={expanded === 0} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 disabled:opacity-30">Previous step</button>
            <button onClick={() => setExpanded((value) => Math.min(PROCEDURE.length - 1, value + 1))} disabled={expanded === PROCEDURE.length - 1} className="rounded-lg bg-cyan-300 px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-30">Next step</button>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10 bg-black/20 p-4 sm:p-5">
        <div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-cyan-200" /><p className="text-xs leading-5 text-slate-300"><strong className="text-white">Beginner rule:</strong> practise this procedure on a demo account first. Trading involves risk, losses are possible, and no signal, checklist or AI tool guarantees a result. If any essential check fails, do not take the trade.</p></div>
      </div>
    </section>
  );
}
