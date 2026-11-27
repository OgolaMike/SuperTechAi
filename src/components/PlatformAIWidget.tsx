import { useMemo, useState } from 'react';
import { BrainCircuit, Send, X, Sparkles } from 'lucide-react';
import { askIndependentAI } from '@/lib/independentApi';

type Props = { activeModule: string; monitoredAssets: string[]; signalsCount: number; contextSummary: string };

export function PlatformAIWidget({ activeModule, monitoredAssets, signalsCount, contextSummary }: Props) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const suggestions = useMemo(() => {
    if (['dashboard', 'super'].includes(activeModule)) return ['Explain the strongest current signal', 'What should I watch before acting?'];
    if (['analysis', 'strategies', 'break-retest'].includes(activeModule)) return ['Explain this strategy simply', 'What would invalidate this setup?'];
    if (['crypto', 'exchange-markets', 'deriv-market'].includes(activeModule)) return ['Summarize the market context', 'What risks should I check?'];
    if (activeModule === 'academy') return ['Teach me the next useful concept', 'Test my understanding'];
    if (['binance', 'okx', 'mt5', 'ctrader', 'connections', 'options', 'orders'].includes(activeModule)) return ['Explain the safety checks here', 'What is connected and what is not verified?'];
    if (['referrals', 'earnings', 'network', 'finance', 'smart-community'].includes(activeModule)) return ['Explain how this section works', 'What should I check next?'];
    return ['Guide me through this section', 'What is my next useful step?'];
  }, [activeModule]);
  const ask = async (raw: string) => {
    const prompt = raw.trim();
    if (!prompt || busy) return;
    setBusy(true); setError(''); setAnswer('');
    try {
      const result = await askIndependentAI({ question: prompt, assets: monitoredAssets.slice(0, 6), signalsCount, signalContext: [], activeModule, contextSummary });
      setAnswer(result.answer);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI is temporarily unavailable. Please try again.');
    } finally { setBusy(false); }
  };
  return <div className="fixed bottom-24 right-4 z-[70] sm:bottom-6 sm:right-6">
    {open && <section className="mb-3 flex w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-accent/30 bg-[#091321] text-slate-100 shadow-2xl shadow-black/40">
      <header className="flex items-center justify-between border-b border-white/10 bg-white/[.04] p-3">
        <div className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-300/10 text-cyan-300"><BrainCircuit className="h-5 w-5"/></span><div><p className="text-sm font-semibold">SuperTech AI</p><p className="text-[10px] text-slate-400">Helping with: {activeModule.replace(/-/g, ' ')}</p></div></div>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close AI assistant" className="rounded-lg p-2 text-slate-400 hover:bg-white/10"><X className="h-4 w-4"/></button>
      </header>
      <div className="max-h-64 space-y-3 overflow-y-auto p-3">
        <p className="text-xs leading-5 text-slate-300">Ask about this section. I use the app context available and won't claim to have executed trades or changed your account.</p>
        <div className="flex flex-wrap gap-2">{suggestions.map(item => <button key={item} type="button" onClick={() => { setQuestion(item); void ask(item); }} className="rounded-full border border-cyan-300/20 bg-cyan-300/[.06] px-3 py-2 text-left text-[11px] text-cyan-100 hover:bg-cyan-300/10">{item}</button>)}</div>
        {busy && <p className="animate-pulse text-xs text-cyan-200">Thinking about this section…</p>}
        {error && <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/[.06] p-3 text-xs text-rose-200">{error}</p>}
        {answer && <div className="whitespace-pre-wrap rounded-xl border border-white/10 bg-white/[.04] p-3 text-sm leading-6 text-slate-100">{answer}</div>}
      </div>
      <form onSubmit={event => { event.preventDefault(); void ask(question); }} className="flex gap-2 border-t border-white/10 p-3">
        <input value={question} onChange={event => setQuestion(event.target.value)} placeholder="Ask about this page…" maxLength={1200} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/50"/>
        <button type="submit" disabled={busy || !question.trim()} aria-label="Send question" className="rounded-xl bg-cyan-400 px-3 text-slate-950 disabled:opacity-40"><Send className="h-4 w-4"/></button>
      </form>
    </section>}
    <button type="button" onClick={() => setOpen(value => !value)} aria-label="Open SuperTech AI assistant" className="ml-auto flex h-14 w-14 items-center justify-center rounded-full border border-cyan-200/30 bg-gradient-to-br from-cyan-300 to-blue-500 text-slate-950 shadow-xl shadow-cyan-950/40 transition-transform hover:scale-105">
      {open ? <X className="h-6 w-6"/> : <><BrainCircuit className="h-6 w-6"/><Sparkles className="absolute mb-9 ml-9 h-3.5 w-3.5"/></>}
    </button>
  </div>;
}