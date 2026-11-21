import { useMemo, useState } from 'react';
import { BrainCircuit, Sparkles, ShieldAlert, BookOpen, MessageCircle, Send, Compass, Target } from 'lucide-react';

type Props = { signalsCount?: number; monitoredAssets?: string[] };

const starters = [
  { icon: Compass, title: 'What should I focus on?', prompt: 'What should I focus on today?' },
  { icon: ShieldAlert, title: 'Help me stay disciplined', prompt: 'Help me avoid emotional trading.' },
  { icon: BookOpen, title: 'Explain a signal simply', prompt: 'How do I read a signal without rushing?' },
];

function answerFor(question: string, assets: string[], goal: string) {
  const q = question.toLowerCase();
  if (q.includes('focus') || q.includes('today') || q.includes('market')) {
    return `Your focus today: wait for a clear setup instead of forcing a trade. You have ${assets.length} market${assets.length === 1 ? '' : 's'} on your watchlist (${assets.slice(0, 4).join(', ') || 'none selected'}). Check higher-timeframe direction first, then use a lower timeframe only to refine your timing. Your personal goal is: ${goal || 'trade patiently and protect your capital'}.`;
  }
  if (q.includes('disciplin') || q.includes('emotional') || q.includes('rush')) {
    return 'Discipline check: (1) Do not enter just because price is moving. (2) Decide your risk before entry. (3) Avoid increasing risk to recover a loss. (4) If the setup is unclear, WAIT is a valid decision. Protecting capital is part of progress.';
  }
  if (q.includes('signal') || q.includes('read') || q.includes('explain')) {
    return 'A signal is a possible opportunity—not a promise. Confirm which market and timeframe it belongs to, review the entry and stop level, and make sure the risk is acceptable. If price has already moved far from the entry, avoid chasing it. A signal can be valid and still lose.';
  }
  return `I can help you think this through. Keep your goal in mind (${goal || 'consistent, disciplined trading'}), check the relevant market and timeframe, and avoid making a decision before your entry, risk and exit plan are clear. For now, I am using your app context and guided insights; conversational AI responses are not yet connected to a live AI model.`;
}

export function PersonalAIExperience({ signalsCount = 0, monitoredAssets = [] }: Props) {
  const [goal, setGoal] = useState(() => localStorage.getItem('supertech-ai-member-goal') ?? 'Build consistent trading habits and protect my capital');
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<{ role: 'assistant' | 'member'; text: string }[]>([]);
  const [saved, setSaved] = useState(false);
  const recent = useMemo(() => monitoredAssets.slice(0, 6), [monitoredAssets]);

  const saveGoal = () => {
    localStorage.setItem('supertech-ai-member-goal', goal.trim());
    setSaved(true);
  };
  const ask = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setMessages((prev) => [...prev, { role: 'member', text: trimmed }, { role: 'assistant', text: answerFor(trimmed, recent, goal) }]);
    setQuestion('');
  };

  return (
    <main className="mt-7 space-y-5">
      <section className="relative overflow-hidden rounded-3xl border border-accent/25 bg-gradient-to-br from-accent/[0.14] via-surface/[0.04] to-surface/[0.015] p-5 shadow-lg sm:p-7">
        <div className="absolute -right-14 -top-14 h-48 w-48 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-accent/25 bg-accent/10"><BrainCircuit className="h-6 w-6 text-accent" /></div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-accent">Your personal intelligence</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-3xl">Welcome to your trading companion.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-2">A space for your goals, market focus, signal guidance and trading discipline. Your watchlist and personal goal shape the guidance shown here.</p>
          </div>
        </div>
        <div className="relative mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-line/10 bg-canvas/50 p-3.5"><p className="text-xs text-ink-3">Markets you're watching</p><p className="mt-1 text-xl font-bold text-ink">{monitoredAssets.length}</p></div>
          <div className="rounded-2xl border border-line/10 bg-canvas/50 p-3.5"><p className="text-xs text-ink-3">Current signal count</p><p className="mt-1 text-xl font-bold text-ink">{signalsCount}</p></div>
          <div className="col-span-2 rounded-2xl border border-line/10 bg-canvas/50 p-3.5 sm:col-span-1"><p className="text-xs text-ink-3">Companion status</p><p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-amber-400"><Sparkles className="h-4 w-4" /> Guided beta</p></div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
        <div className="rounded-2xl border border-line/15 bg-surface/[0.035] p-4 sm:p-5">
          <div className="flex items-center gap-2"><Target className="h-4 w-4 text-accent" /><h2 className="text-base font-semibold text-ink">Your personal goal</h2></div>
          <p className="mt-1 text-sm text-ink-2">This stays on this device for now and helps tailor guided responses.</p>
          <textarea value={goal} onChange={(e) => { setGoal(e.target.value); setSaved(false); }} rows={3} maxLength={240} className="mt-3 w-full resize-y rounded-xl border border-line/15 bg-canvas/60 p-3 text-sm text-ink outline-none focus:border-accent/50" placeholder="What are you working toward?"/>
          <button type="button" onClick={saveGoal} className="mt-3 rounded-xl border border-accent/25 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent">{saved ? 'Goal saved ✓' : 'Save my goal'}</button>
          <div className="mt-5 rounded-xl border border-line/10 bg-canvas/40 p-3"><p className="text-xs font-semibold text-ink-3">YOUR WATCHLIST</p><div className="mt-2 flex flex-wrap gap-2">{recent.length ? recent.map((asset) => <span key={asset} className="rounded-full border border-line/15 px-2.5 py-1 text-xs text-ink-2">{asset}</span>) : <span className="text-xs text-ink-3">Choose markets on your dashboard to personalize your space.</span>}</div></div>
        </div>
        <div className="rounded-2xl border border-line/15 bg-surface/[0.035] p-4 sm:p-5">
          <h2 className="text-base font-semibold text-ink">A few ways I can guide you</h2>
          <div className="mt-3 space-y-2">{starters.map(({ icon: Icon, title, prompt }) => <button key={title} onClick={() => ask(prompt)} className="flex w-full items-center gap-3 rounded-xl border border-line/10 bg-canvas/40 p-3 text-left transition hover:border-accent/25"><Icon className="h-4 w-4 shrink-0 text-accent"/><span className="text-sm font-medium text-ink">{title}</span></button>)}</div>
          <p className="mt-3 text-xs text-ink-3">Guided answers are informational, not trade instructions or guarantees.</p>
        </div>
      </section>

      <section className="rounded-2xl border border-line/15 bg-surface/[0.035] p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2"><MessageCircle className="h-4 w-4 text-accent"/><h2 className="font-semibold text-ink">Talk through a decision</h2></div>
        <div className="max-h-80 space-y-3 overflow-y-auto rounded-xl bg-canvas/30 p-3">
          {messages.length === 0 && <div className="py-5 text-center text-sm text-ink-3">Ask a question or choose one of the guidance prompts above. This beta currently uses guided, local responses rather than a connected generative AI model.</div>}
          {messages.map((message, index) => <div key={index} className={`max-w-[92%] rounded-2xl p-3 text-sm leading-relaxed ${message.role === 'member' ? 'ml-auto bg-accent/10 text-ink' : 'mr-auto border border-line/10 bg-surface/[0.08] text-ink-2'} }>{message.text}</div>)}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); ask(question); }} className="mt-3 flex items-end gap-2"><textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={2} maxLength={500} placeholder="Ask your trading companion…" className="min-w-0 flex-1 resize-none rounded-xl border border-line/15 bg-canvas/60 p-3 text-sm text-ink outline-none focus:border-accent/50"/><button type="submit" disabled={!question.trim()} aria-label="Send question" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-canvas disabled:opacity-40"><Send className="h-4 w-4"/></button></form>
      </section>
    </main>
  );
}
