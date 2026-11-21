import { useEffect, useMemo, useState } from 'react';
import { BrainCircuit, Sparkles, ShieldAlert, BookOpen, MessageCircle, Send, Compass, Target } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type SignalContextItem = { symbol: string; timeframe: string; direction: 'BUY' | 'SELL'; signalEpoch: number; status: string; entry: number; stopLoss: number; tp1: number; tp2: number; tp3: number };
type Props = { signalsCount?: number; monitoredAssets?: string[]; signalContext?: SignalContextItem[] };

const starters = [
  { icon: Compass, title: 'What should I focus on?', prompt: 'What should I focus on today?' },
  { icon: ShieldAlert, title: 'Help me stay disciplined', prompt: 'Help me avoid emotional trading.' },
  { icon: BookOpen, title: 'Explain a signal simply', prompt: 'How do I read a signal without rushing?' },
];

export function PersonalAIExperience({ signalsCount = 0, monitoredAssets = [], signalContext = [] }: Props) {
  const [goal, setGoal] = useState(() => localStorage.getItem('supertech-ai-member-goal') ?? 'Build consistent trading habits and protect my capital');
  const [memoryOptIn, setMemoryOptIn] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileMessage, setProfileMessage] = useState('');
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<{ role: 'assistant' | 'member'; text: string }[]>([]);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [serviceStatus, setServiceStatus] = useState<'unchecked' | 'checking' | 'connected' | 'unavailable'>('unchecked');
  const recent = useMemo(() => monitoredAssets.slice(0, 6), [monitoredAssets]);

  useEffect(() => {
    let cancelled = false;
    const loadProfile = async () => {
      try {
        const { data: authData } = await supabase.auth.getUser();
        if (!authData.user) return;
        const { data, error: profileError } = await supabase
          .from('member_ai_profiles')
          .select('goal, memory_opt_in')
          .eq('user_id', authData.user.id)
          .maybeSingle();
        if (profileError) throw profileError;
        if (!cancelled && data) {
          setGoal(data.goal);
          setMemoryOptIn(data.memory_opt_in);
          localStorage.setItem('supertech-ai-member-goal', data.goal);
        }
      } catch (err) {
        if (!cancelled) setProfileMessage(err instanceof Error ? err.message : 'Could not load your saved AI preferences.');
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    };
    void loadProfile();
    return () => { cancelled = true; };
  }, []);

  const saveGoal = async () => {
    const cleanGoal = goal.trim().slice(0, 240);
    if (!cleanGoal) {
      setProfileMessage('Please enter a goal before saving.');
      return;
    }
    setProfileMessage('');
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw new Error('Please sign in again before saving your preferences.');
      if (memoryOptIn) {
        const { error: saveError } = await supabase.from('member_ai_profiles').upsert({
          user_id: authData.user.id,
          goal: cleanGoal,
          memory_opt_in: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
        if (saveError) throw saveError;
      } else {
        const { error: deleteError } = await supabase.from('member_ai_profiles').delete().eq('user_id', authData.user.id);
        if (deleteError) throw deleteError;
      }
      localStorage.setItem('supertech-ai-member-goal', cleanGoal);
      setGoal(cleanGoal);
      setSaved(true);
      setProfileMessage(memoryOptIn ? 'Your goal is saved privately and will follow you across devices.' : 'Your goal is saved on this device only. Persistent AI memory is off.');
    } catch (err) {
      setProfileMessage(err instanceof Error ? err.message : 'Could not save your AI preferences. Please try again.');
      setSaved(false);
    }
  };
  const ask = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const history = messages.map((message) => ({
      role: message.role === 'member' ? 'user' : 'assistant',
      content: message.text,
    }));
    setMessages((prev) => [...prev, { role: 'member', text: trimmed }]);
    setQuestion('');
    setError('');
    setLoading(true);
    setServiceStatus('checking');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('personal-ai', {
        body: { question: trimmed, goal, assets: recent, signalsCount, signalContext, history },
      });
      if (invokeError) throw invokeError;
      if (!data?.answer) throw new Error(data?.error || 'No answer received. Please try again.');
      setServiceStatus('connected');
      setMessages((prev) => [...prev, { role: 'assistant', text: data.answer }]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not connect to your AI companion. Try again.';
      setServiceStatus('unavailable');
      setError(message);
      setMessages((prev) => [...prev, { role: 'assistant', text: 'I couldn’t reach my AI service right now. Please try again shortly.' }]);
    } finally {
      setLoading(false);
    }
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
          <div className="col-span-2 rounded-2xl border border-line/10 bg-canvas/50 p-3.5 sm:col-span-1"><p className="text-xs text-ink-3">AI companion</p><p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-ink"><Sparkles className="h-4 w-4 text-accent" />{serviceStatus === 'checking' ? 'Connecting…' : serviceStatus === 'connected' ? 'Connected' : serviceStatus === 'unavailable' ? 'Temporarily unavailable' : 'Not yet checked'}</p><p className="mt-1 text-[11px] text-ink-3">{serviceStatus === 'connected' ? 'Your last request received a response.' : serviceStatus === 'unavailable' ? 'Your last request could not reach the AI service.' : 'Service status is confirmed when you send a message.'}</p></div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
        <div className="rounded-2xl border border-line/15 bg-surface/[0.035] p-4 sm:p-5">
          <div className="flex items-center gap-2"><Target className="h-4 w-4 text-accent" /><h2 className="text-base font-semibold text-ink">Your personal goal</h2></div>
          <p className="mt-1 text-sm text-ink-2">Choose whether your goal stays on this device or is saved privately to your account for use across devices.</p>
          <textarea value={goal} onChange={(e) => { setGoal(e.target.value); setSaved(false); }} rows={3} maxLength={240} className="mt-3 w-full resize-y rounded-xl border border-line/15 bg-canvas/60 p-3 text-sm text-ink outline-none focus:border-accent/50" placeholder="What are you working toward?"/>
          <label className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-ink-2"><input type="checkbox" checked={memoryOptIn} onChange={(e) => { setMemoryOptIn(e.target.checked); setSaved(false); }} className="mt-0.5 accent-current"/> Save my goal privately to my SuperTech AI account so it is available across my devices. I can turn this off and remove the saved profile at any time.</label>
          <button type="button" onClick={() => void saveGoal()} disabled={profileLoading} className="mt-3 rounded-xl border border-accent/25 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent disabled:opacity-50">{profileLoading ? 'Loading preferences…' : saved ? 'Preferences saved ✓' : 'Save my preferences'}</button>
          {profileMessage && <p role="status" className="mt-2 text-xs text-ink-3">{profileMessage}</p>}
          <div className="mt-5 rounded-xl border border-line/10 bg-canvas/40 p-3"><p className="text-xs font-semibold text-ink-3">YOUR WATCHLIST</p><div className="mt-2 flex flex-wrap gap-2">{recent.length ? recent.map((asset) => <span key={asset} className="rounded-full border border-line/15 px-2.5 py-1 text-xs text-ink-2">{asset}</span>) : <span className="text-xs text-ink-3">Choose markets on your dashboard to personalize your space.</span>}</div></div>
        </div>
        <div className="rounded-2xl border border-line/15 bg-surface/[0.035] p-4 sm:p-5">
          <h2 className="text-base font-semibold text-ink">A few ways I can guide you</h2>
          <div className="mt-3 space-y-2">{starters.map(({ icon: Icon, title, prompt }) => <button key={title} onClick={() => void ask(prompt)} className="flex w-full items-center gap-3 rounded-xl border border-line/10 bg-canvas/40 p-3 text-left transition hover:border-accent/25"><Icon className="h-4 w-4 shrink-0 text-accent"/><span className="text-sm font-medium text-ink">{title}</span></button>)}</div>
          <p className="mt-3 text-xs text-ink-3">AI guidance is informational, not trade instructions or guarantees.</p>
        </div>
      </section>

      <section className="rounded-2xl border border-line/15 bg-surface/[0.035] p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2"><MessageCircle className="h-4 w-4 text-accent"/><h2 className="font-semibold text-ink">Talk with your AI companion</h2></div>
        <div className="max-h-80 space-y-3 overflow-y-auto rounded-xl bg-canvas/30 p-3">
          {messages.length === 0 && <div className="py-5 text-center text-sm text-ink-3">Ask a question or choose a prompt. Your companion uses your goal, watchlist and this conversation to respond.</div>}
          {messages.map((message, index) => <div key={index} className={'max-w-[92%] rounded-2xl p-3 text-sm leading-relaxed ' + (message.role === 'member' ? 'ml-auto bg-accent/10 text-ink' : 'mr-auto border border-line/10 bg-surface/[0.08] text-ink-2')}>{message.text}</div>)}
        </div>
        {loading && <p className="mt-2 text-xs text-ink-3 animate-pulse">Your companion is thinking…</p>}
        {error && <p className="mt-2 text-xs text-amber-400">{error}</p>}
        <form onSubmit={(e) => { e.preventDefault(); void ask(question); }} className="mt-3 flex items-end gap-2"><textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={2} maxLength={500} placeholder="Ask your trading companion…" className="min-w-0 flex-1 resize-none rounded-xl border border-line/15 bg-canvas/60 p-3 text-sm text-ink outline-none focus:border-accent/50"/><button type="submit" disabled={!question.trim() || loading} aria-label="Send question" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-canvas disabled:opacity-40"><Send className="h-4 w-4"/></button></form>
      </section>
    </main>
  );
}
