import { useEffect, useMemo, useState } from 'react';
import { BrainCircuit, Sparkles, ShieldCheck, BookOpen, MessageCircle, Send, Compass, Target, Trash2, RefreshCw, Activity, GraduationCap, Wallet } from 'lucide-react';
import {
  askIndependentAI,
  clearIndependentAIHistory,
  fetchIndependentAIHistory,
  getIndependentAIProfile,
  saveIndependentAIProfile,
  type IndependentAIMessage,
} from '@/lib/independentApi';

type SignalContextItem = { symbol: string; timeframe: string; direction: 'BUY' | 'SELL'; signalEpoch: number; status: string; entry: number; stopLoss: number; tp1: number; tp2: number; tp3: number };
type Props = { signalsCount?: number; monitoredAssets?: string[]; signalContext?: SignalContextItem[] };

const starters = [
  { icon: Compass, title: 'My daily focus', prompt: 'Help me decide what to focus on in SuperTech AI today.' },
  { icon: Activity, title: 'Explain my market signals', prompt: 'Explain the current signal context in simple language. What is confirmed and what is still uncertain?' },
  { icon: ShieldCheck, title: 'Build trading discipline', prompt: 'Help me create a simple routine to avoid emotional trading and protect my capital.' },
  { icon: GraduationCap, title: 'Teach me something', prompt: 'Teach me one useful trading concept in simple steps, then give me a short practice exercise.' },
  { icon: Wallet, title: 'Understand my account', prompt: 'Guide me through the Account and membership areas. Do not assume you can see private balances.' },
  { icon: Target, title: 'Review my progress', prompt: 'Help me review my habits and choose one practical improvement for this week.' },
];

export function PersonalAIExperience({ signalsCount = 0, monitoredAssets = [], signalContext = [] }: Props) {
  const [goal, setGoal] = useState('Build consistent trading habits and protect my capital');
  const [memoryOptIn, setMemoryOptIn] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<IndependentAIMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [serviceStatus, setServiceStatus] = useState<'unchecked' | 'checking' | 'connected' | 'unavailable'>('unchecked');
  const recent = useMemo(() => monitoredAssets.slice(0, 6), [monitoredAssets]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { profile } = await getIndependentAIProfile();
        if (cancelled) return;
        setGoal(profile.goal);
        setMemoryOptIn(profile.memoryOptIn);
        if (profile.memoryOptIn) {
          const { history } = await fetchIndependentAIHistory();
          if (!cancelled) setMessages(history);
        }
      } catch (err) {
        if (!cancelled) setProfileMessage(err instanceof Error ? err.message : 'Your AI preferences could not be loaded.');
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const savePreferences = async () => {
    const cleanGoal = goal.trim().slice(0, 240);
    if (!cleanGoal) {
      setProfileMessage('Please enter a personal goal first.');
      return;
    }
    setProfileSaving(true);
    setProfileMessage('');
    try {
      const { profile } = await saveIndependentAIProfile({ goal: cleanGoal, memoryOptIn });
      setGoal(profile.goal);
      setMemoryOptIn(profile.memoryOptIn);
      if (!profile.memoryOptIn) setMessages([]);
      else {
        const { history } = await fetchIndependentAIHistory();
        setMessages(history);
      }
      setProfileMessage(profile.memoryOptIn
        ? 'Your goal and chat memory are saved privately to your Appwrite account.'
        : 'Your goal is saved. Cross-session chat memory is off and previously saved chat history has been cleared.');
    } catch (err) {
      setProfileMessage(err instanceof Error ? err.message : 'Could not save your preferences.');
    } finally {
      setProfileSaving(false);
    }
  };

  const ask = async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed || loading) return;
    const userMessage: IndependentAIMessage = { role: 'user', content: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setQuestion('');
    setError('');
    setLoading(true);
    setServiceStatus('checking');
    try {
      const result = await askIndependentAI({
        question: trimmed,
        assets: recent,
        signalsCount,
        signalContext: signalContext.slice(0, 10) as unknown as Array<Record<string, unknown>>,
      });
      setMessages((prev) => [...prev, { role: 'assistant', content: result.answer }]);
      setServiceStatus('connected');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The AI service could not respond.';
      setServiceStatus('unavailable');
      setError(message);
      setMessages((prev) => [...prev, { role: 'assistant', content: 'I could not reach the AI service just now. Your question is still here—please try again shortly.' }]);
    } finally {
      setLoading(false);
    }
  };

  const clearHistory = async () => {
    try {
      await clearIndependentAIHistory();
      setMessages([]);
      setProfileMessage('Your saved conversation history has been cleared.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not clear saved history.');
    }
  };

  return (
    <main className="mt-6 space-y-5 sm:mt-7">
      <section className="relative isolate overflow-hidden rounded-[1.75rem] border border-accent/25 bg-gradient-to-br from-accent/[.16] via-surface/[.07] to-canvas p-5 shadow-xl sm:p-7">
        <div className="pointer-events-none absolute -right-16 -top-20 -z-10 h-64 w-64 rounded-full bg-accent/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 -z-10 h-48 w-48 rounded-full bg-sky-400/10 blur-3xl" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-accent/30 bg-accent/10 shadow-inner"><BrainCircuit className="h-6 w-6 text-accent" /></div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[.24em] text-accent">SuperTech intelligence</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-3xl">Your AI Companion</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-2">One intelligent guide across your markets, signals, strategies, learning and SuperTech AI account. Ask naturally. Get clear explanations and practical next steps.</p>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-line/15 bg-canvas/60 px-3 py-1.5 text-xs text-ink-2">
            <span className={'h-2 w-2 rounded-full ' + (serviceStatus === 'connected' ? 'bg-emerald-400' : serviceStatus === 'checking' ? 'animate-pulse bg-amber-300' : serviceStatus === 'unavailable' ? 'bg-rose-400' : 'bg-ink-3')} />
            {serviceStatus === 'connected' ? 'AI responded' : serviceStatus === 'checking' ? 'Thinking' : serviceStatus === 'unavailable' ? 'Service unavailable' : 'Ready when you are'}
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-2xl border border-line/10 bg-canvas/55 p-3"><p className="text-[11px] text-ink-3">Markets watched</p><p className="mt-1 text-xl font-bold text-ink">{monitoredAssets.length}</p></div>
          <div className="rounded-2xl border border-line/10 bg-canvas/55 p-3"><p className="text-[11px] text-ink-3">Signal snapshot</p><p className="mt-1 text-xl font-bold text-ink">{signalsCount}</p></div>
          <div className="rounded-2xl border border-line/10 bg-canvas/55 p-3"><p className="text-[11px] text-ink-3">Your focus</p><p className="mt-1 truncate text-sm font-semibold text-ink">{goal ? 'Personalized' : 'Not set'}</p></div>
          <div className="rounded-2xl border border-line/10 bg-canvas/55 p-3"><p className="text-[11px] text-ink-3">Private memory</p><p className="mt-1 text-sm font-semibold text-ink">{memoryOptIn ? 'On' : 'Off'}</p></div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[.82fr_1.18fr]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-line/15 bg-surface/[.04] p-4 sm:p-5">
            <div className="flex items-center gap-2"><Target className="h-4 w-4 text-accent" /><h2 className="font-semibold text-ink">Your personal focus</h2></div>
            <p className="mt-1 text-xs leading-relaxed text-ink-3">Tell your companion what you are working toward. This helps shape its guidance.</p>
            <textarea value={goal} onChange={(e) => setGoal(e.target.value)} maxLength={240} rows={3} className="mt-3 w-full resize-y rounded-xl border border-line/15 bg-canvas/60 p-3 text-sm text-ink outline-none focus:border-accent/50" placeholder="What would you like to achieve?" />
            <label className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-ink-2"><input type="checkbox" checked={memoryOptIn} onChange={(e) => setMemoryOptIn(e.target.checked)} className="mt-0.5 accent-current" /> Save my chat history privately to my account so the companion can remember our conversations across sessions.</label>
            <button type="button" onClick={() => void savePreferences()} disabled={profileLoading || profileSaving} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm font-semibold text-accent disabled:opacity-50">{profileSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}{profileLoading ? 'Loading…' : profileSaving ? 'Saving…' : 'Save my preferences'}</button>
            {profileMessage && <p role="status" className="mt-2 text-xs leading-relaxed text-ink-3">{profileMessage}</p>}
          </div>
          <div className="rounded-2xl border border-line/15 bg-surface/[.04] p-4 sm:p-5">
            <h2 className="font-semibold text-ink">Your SuperTech AI world</h2>
            <p className="mt-1 text-xs text-ink-3">Your companion can guide you through the main areas of the platform.</p>
            <div className="mt-3 flex flex-wrap gap-2">{['Signals & Analysis', 'Crypto & Deriv', 'Automation', 'Academy', 'Account & Network'].map((item) => <span key={item} className="rounded-full border border-line/15 bg-canvas/50 px-2.5 py-1.5 text-[11px] text-ink-2">{item}</span>)}</div>
            <div className="mt-4 flex flex-wrap gap-2">{recent.length ? recent.map((asset) => <span key={asset} className="rounded-lg bg-accent/[.08] px-2 py-1 text-[11px] font-medium text-ink-2">{asset}</span>) : <span className="text-xs text-ink-3">Choose markets on your Dashboard to add focus.</span>}</div>
          </div>
        </div>

        <div className="rounded-2xl border border-line/15 bg-surface/[.04] p-4 sm:p-5">
          <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-accent" /><h2 className="font-semibold text-ink">Start with a question</h2></div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {starters.map(({ icon: Icon, title, prompt }) => <button key={title} type="button" onClick={() => void ask(prompt)} disabled={loading} className="group flex min-h-[76px] items-center gap-3 rounded-xl border border-line/10 bg-canvas/45 p-3 text-left transition hover:border-accent/30 hover:bg-accent/[.06] disabled:opacity-50"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/[.09]"><Icon className="h-4 w-4 text-accent" /></span><span className="text-sm font-medium leading-snug text-ink">{title}</span></button>)}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-ink-3">Ask about a signal, a strategy, a lesson, a connection or how to use any part of the platform.</p>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-line/15 bg-surface/[.04]">
        <div className="flex flex-wrap items-center gap-2 border-b border-line/10 px-4 py-3 sm:px-5">
          <MessageCircle className="h-4 w-4 text-accent" /><h2 className="font-semibold text-ink">Conversation</h2>
          <span className="text-[11px] text-ink-3">{memoryOptIn ? 'Private memory enabled' : 'This session only'}</span>
          <button type="button" onClick={() => { setMessages([]); if (memoryOptIn) void clearHistory(); }} className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-ink-3 hover:bg-canvas/60 hover:text-ink"><Trash2 className="h-3.5 w-3.5" />Clear</button>
        </div>
        <div className="max-h-[min(58vh,560px)] min-h-48 space-y-3 overflow-y-auto bg-canvas/20 p-4 sm:p-5">
          {messages.length === 0 && <div className="mx-auto flex max-w-sm flex-col items-center py-8 text-center"><div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-accent/20 bg-accent/[.08]"><BrainCircuit className="h-6 w-6 text-accent" /></div><p className="mt-3 text-sm font-semibold text-ink">What would you like to understand?</p><p className="mt-1 text-xs leading-relaxed text-ink-3">Your companion is ready to help you make sense of the platform and the information available to it.</p></div>}
          {messages.map((message, index) => <div key={index} className={'max-w-[94%] whitespace-pre-wrap rounded-2xl px-3.5 py-3 text-sm leading-relaxed sm:max-w-[85%] ' + (message.role === 'user' ? 'ml-auto bg-accent/15 text-ink' : 'mr-auto border border-line/10 bg-surface/[.08] text-ink-2')}>{message.content}</div>)}
          {loading && <div className="mr-auto flex items-center gap-2 rounded-2xl border border-line/10 bg-surface/[.08] px-3.5 py-3 text-xs text-ink-3"><Sparkles className="h-3.5 w-3.5 animate-pulse text-accent" />Thinking through your question…</div>}
          {error && <p role="alert" className="text-xs text-amber-400">{error}</p>}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); void ask(question); }} className="flex items-end gap-2 border-t border-line/10 bg-surface/[.03] p-3 sm:p-4">
          <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={2} maxLength={1200} placeholder="Ask your AI Companion anything…" className="min-w-0 flex-1 resize-none rounded-xl border border-line/15 bg-canvas/65 p-3 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-accent/50" />
          <button type="submit" disabled={!question.trim() || loading} aria-label="Send message" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-canvas shadow-lg transition hover:brightness-110 disabled:opacity-40"><Send className="h-4 w-4" /></button>
        </form>
      </section>
      <p className="flex items-start gap-2 px-1 text-[11px] leading-relaxed text-ink-3"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />The companion explains information and supports learning. It does not place trades, control accounts or guarantee outcomes. Market context can be delayed or incomplete.</p>
    </main>
  );
}
