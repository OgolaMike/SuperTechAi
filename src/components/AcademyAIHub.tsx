import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { BookOpen, Bot, BrainCircuit, MessageCircle, RefreshCw, Send, Sparkles } from 'lucide-react';

type AiDiscussion = { id: string; title: string; category: string; discussion_prompt: string; context: string; talking_points: string[]; follow_up_questions: string[]; created_at: string };

type AiLesson = {
  id: string; slug: string; title: string; category: string; level: string;
  duration_minutes: number; content: {
    summary: string; objective: string; steps: string[]; narration: string;
    visual_prompt: string; quiz: { question: string; answers: string[]; correct: number; explanation: string };
  };
  created_at: string;
};

export function AcademyAIHub({ isAdmin }: { isAdmin: boolean }) {
  const [lessons, setLessons] = useState<AiLesson[]>([]);
  const [discussions, setDiscussions] = useState<AiDiscussion[]>([]);
  const [discussionTopic, setDiscussionTopic] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [topic, setTopic] = useState('');
  const [category, setCategory] = useState('Trading foundations');
  const [level, setLevel] = useState('Beginner');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [tradeStatus, setTradeStatus] = useState<{verified_closed_trades_available:number; sources:Record<string,number>; policy:string}|null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [lessonResult, discussionResult] = await Promise.all([
      supabase.functions.invoke('academy-ai', { body: { action: 'list-lessons' } }),
      supabase.functions.invoke('academy-ai', { body: { action: 'list-discussions' } }),
    ]);
    if (lessonResult.error) { setError('AI Academy lessons could not be loaded. Please refresh.'); return; }
    setLessons((lessonResult.data?.lessons || []) as AiLesson[]);
    if (!discussionResult.error) setDiscussions((discussionResult.data?.discussions || []) as AiDiscussion[]);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const generate = async () => {
    if (topic.trim().length < 4) return;
    setBusy('generate'); setError('');
    const { data, error } = await supabase.functions.invoke('academy-ai', { body: { action: 'generate-lesson', topic: topic.trim(), category, level } });
    if (error || data?.error) setError(data?.error || 'AI lesson generation failed. Please try again.');
    else { setTopic(''); await load(); setSelectedId(data.lesson.id); }
    setBusy('');
  };

  const generateCoreCurriculum = async () => {
    const curriculum = [
      ['How financial markets work','Trading foundations','Beginner'],
      ['Candlesticks, price action and market structure','Chart reading','Beginner'],
      ['Support, resistance and key price levels','Chart reading','Beginner'],
      ['Trend, pullbacks and breakouts','Chart reading','Intermediate'],
      ['Break and retest setups','Trading practice','Intermediate'],
      ['Momentum, ROC and market strength','Trading intelligence','Intermediate'],
      ['Risk management, position sizing and stop losses','Risk management','Beginner'],
      ['Multi-timeframe confirmation and confluence','Trading intelligence','Advanced'],
      ['Crypto markets, exchanges and volatility','Crypto','Intermediate'],
      ['Using SuperTech AI signals and automation safely','Automation','Advanced'],
    ];
    setBusy('curriculum'); setError('');
    for (let i = 0; i < curriculum.length; i++) {
      const [lessonTopic, lessonCategory, lessonLevel] = curriculum[i];
      const { data, error } = await supabase.functions.invoke('academy-ai', {
        body: { action: 'generate-lesson', topic: lessonTopic, category: lessonCategory, level: lessonLevel },
      });
      if (error || data?.error) {
        setError('Curriculum stopped at lesson ' + (i + 1) + ' of ' + curriculum.length + ': ' + (data?.error || 'AI generation failed. You can retry the remaining lessons.'));
        setBusy('');
        await load();
        return;
      }
    }
    await load();
    setBusy('');
  };

  const generateDiscussion = async () => {
    if (discussionTopic.trim().length < 4) return;
    setBusy('discussion'); setError('');
    const { data, error } = await supabase.functions.invoke('academy-ai', { body: { action: 'generate-discussion', topic: discussionTopic.trim(), category } });
    if (error || data?.error) setError(data?.error || 'AI discussion generation failed.');
    else { setDiscussionTopic(''); await load(); }
    setBusy('');
  };

  const ask = async () => {
    if (question.trim().length < 2) return;
    setBusy('ask'); setError(''); setAnswer('');
    const { data, error } = await supabase.functions.invoke('academy-ai', { body: { action: 'ask', question: question.trim(), lessonId: selectedId || null } });
    if (error || data?.error) setError(data?.error || 'Your AI tutor is unavailable. Please try again.');
    else { setAnswer(data.discussion.ai_response); setQuestion(''); }
    setBusy('');
  };

  const checkTrades = async () => {
    setBusy('trades'); setError('');
    const { data, error } = await supabase.functions.invoke('academy-ai', { body: { action: 'trade-status' } });
    if (error || data?.error) setError(data?.error || 'Trade history could not be checked.');
    else setTradeStatus(data);
    setBusy('');
  };

  const selected = lessons.find((lesson) => lesson.id === selectedId) || lessons[0];

  return (
    <section className="space-y-4 rounded-3xl border border-cyan-300/20 bg-surface/[0.035] p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/25 bg-cyan-300/10 text-cyan-300"><BrainCircuit className="h-6 w-6" /></div>
        <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">AI-powered learning</p><h2 className="mt-1 text-xl font-bold text-ink sm:text-2xl">Your Academy AI studio</h2><p className="mt-1 text-sm leading-6 text-ink-2">Lessons are written by AI, and your tutor explains each topic in simple language. Trade case studies are reserved for verified completed executions only.</p></div>
      </div>

      {isAdmin && <div className="rounded-2xl border border-accent/20 bg-canvas/40 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink"><Sparkles className="h-4 w-4 text-accent" /> Generate a new lesson</div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Lesson topic (e.g. Break and retest)" className="rounded-xl border border-line/10 bg-canvas px-3 py-2.5 text-sm text-ink sm:col-span-3" />
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-xl border border-line/10 bg-canvas px-3 py-2.5 text-sm text-ink"><option>Trading foundations</option><option>Chart reading</option><option>Risk management</option><option>Trading intelligence</option><option>Crypto</option><option>Automation</option><option>Advanced trading</option></select>
          <select value={level} onChange={(e) => setLevel(e.target.value)} className="rounded-xl border border-line/10 bg-canvas px-3 py-2.5 text-sm text-ink"><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select>
          <button onClick={() => void generate()} disabled={busy === 'generate' || topic.trim().length < 4} className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Sparkles className="h-4 w-4" />{busy === 'generate' ? 'Generating…' : 'Generate & publish'}</button>
          <button onClick={() => void generateCoreCurriculum()} disabled={!!busy} className="rounded-xl border border-accent/30 px-4 py-2.5 text-xs font-semibold text-accent disabled:opacity-50 sm:col-span-3">{busy === 'curriculum' ? 'Building the 10-lesson curriculum…' : 'Generate complete core curriculum (10 lessons)'}</button>
        </div>
      </div>}

      {isAdmin && <div className="rounded-2xl border border-accent/20 bg-canvas/40 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink"><MessageCircle className="h-4 w-4 text-accent" /> Create an AI-led discussion</div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row"><input value={discussionTopic} onChange={(e) => setDiscussionTopic(e.target.value)} placeholder="Discussion topic (e.g. When should a breakout be ignored?)" className="min-w-0 flex-1 rounded-xl border border-line/10 bg-canvas px-3 py-2.5 text-sm text-ink" /><button onClick={() => void generateDiscussion()} disabled={busy === 'discussion' || discussionTopic.trim().length < 4} className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy === 'discussion' ? 'Creating…' : 'Generate discussion'}</button></div>
      </div>}

      {error && <p role="status" className="rounded-xl border border-amber-400/20 p-3 text-xs text-amber-500">{error}</p>}

      <div className="rounded-2xl border border-line/10 bg-canvas/25 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink"><MessageCircle className="h-4 w-4 text-accent" /> AI-generated Academy discussions</div>
        {!discussions.length ? <p className="text-xs text-ink-3">New AI-led discussion topics will appear here.</p> : <div className="grid gap-3 sm:grid-cols-2">{discussions.map((item) => <article key={item.id} className="rounded-xl border border-line/10 bg-canvas/50 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-accent">{item.category}</p><h3 className="mt-1 text-sm font-semibold text-ink">{item.title}</h3><p className="mt-2 text-sm leading-5 text-ink-2">{item.discussion_prompt}</p><p className="mt-2 text-xs leading-5 text-ink-3">{item.context}</p><button onClick={() => { setQuestion(item.discussion_prompt); setAnswer(''); }} className="mt-3 text-xs font-semibold text-accent">Discuss this with AI tutor →</button></article>)}</div>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-2">
          <div className="flex items-center justify-between"><p className="text-sm font-semibold text-ink">AI-generated lessons</p><button onClick={() => void load()} className="inline-flex items-center gap-1 text-xs text-accent"><RefreshCw className="h-3 w-3" />Refresh</button></div>
          {!lessons.length ? <div className="rounded-xl border border-dashed border-line/15 p-4 text-sm text-ink-3">{isAdmin ? 'Generate the first lesson above. Published AI lessons will appear here for members.' : 'AI lessons are being prepared by the Academy team.'}</div> : lessons.map((lesson) => <button key={lesson.id} onClick={() => setSelectedId(lesson.id)} className={'w-full rounded-xl border p-3 text-left ' + ((selected?.id === lesson.id) ? 'border-accent/40 bg-accent/[0.07]' : 'border-line/10 bg-canvas/30')}><p className="text-xs text-ink-3">{lesson.category} · {lesson.level}</p><p className="mt-1 text-sm font-semibold text-ink">{lesson.title}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-ink-2">{lesson.content.summary}</p></button>)}
        </div>

        <div className="space-y-3">
          {selected ? <article className="rounded-2xl border border-line/10 bg-canvas/30 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent"><BookOpen className="h-4 w-4" /> AI lesson · {selected.duration_minutes} min</div>
            <h3 className="mt-2 text-lg font-bold text-ink">{selected.title}</h3>
            <p className="mt-2 text-sm leading-6 text-ink-2">{selected.content.summary}</p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-ink-3">What you will learn</p><p className="mt-1 text-sm leading-6 text-ink-2">{selected.content.objective}</p>
            <ol className="mt-3 space-y-2">{(selected.content.steps || []).map((step, i) => <li key={i} className="flex gap-2 text-sm leading-6 text-ink-2"><span className="font-bold text-accent">{i+1}.</span><span>{step}</span></li>)}</ol>
            {selected.content.quiz && <div className="mt-4 rounded-xl border border-line/10 p-3"><p className="text-sm font-semibold text-ink">{selected.content.quiz.question}</p><p className="mt-2 text-xs leading-5 text-ink-2">{selected.content.quiz.explanation}</p></div>}
          </article> : <div className="rounded-2xl border border-dashed border-line/15 p-4 text-sm text-ink-3">Choose an AI lesson to view its content.</div>}

          <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.035] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink"><Bot className="h-4 w-4 text-accent" /> Ask your AI tutor</div>
            <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={3} maxLength={1600} placeholder="Ask anything about this lesson or a trading concept…" className="mt-3 w-full rounded-xl border border-line/10 bg-canvas px-3 py-2.5 text-sm text-ink" />
            <button onClick={() => void ask()} disabled={busy === 'ask' || question.trim().length < 2} className="mt-2 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Send className="h-4 w-4" />{busy === 'ask' ? 'Thinking…' : 'Ask AI tutor'}</button>
            {answer && <div className="mt-3 rounded-xl border border-line/10 bg-canvas/60 p-3"><p className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-accent"><MessageCircle className="h-3.5 w-3.5" /> AI explanation</p><p className="whitespace-pre-wrap text-sm leading-6 text-ink-2">{answer}</p></div>}
          </div>
        </div>
      </div>

      {isAdmin && <div className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.035] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-semibold text-ink">Verified trade case studies</p><p className="mt-1 text-xs leading-5 text-ink-3">Only actual completed broker or exchange executions can be analysed. No manual or simulated results.</p></div><button onClick={() => void checkTrades()} disabled={busy === 'trades'} className="rounded-xl border border-line/15 px-3 py-2 text-xs font-semibold text-ink">{busy === 'trades' ? 'Checking…' : 'Check executed trades'}</button></div>
        {tradeStatus && <div className="mt-3 rounded-xl bg-canvas/50 p-3"><p className="text-sm font-semibold text-ink">{tradeStatus.verified_closed_trades_available} completed executions available</p><p className="mt-1 text-xs text-ink-3">cTrader: {tradeStatus.sources.ctrader} · Binance Futures: {tradeStatus.sources.binance_futures} · Binance Spot: {tradeStatus.sources.binance_spot} · MT5: {tradeStatus.sources.mt5_deals}</p>{tradeStatus.verified_closed_trades_available === 0 && <p className="mt-2 text-xs leading-5 text-amber-500">No verified completed trades are currently recorded. Trade breakdowns will appear automatically after actual execution history is connected.</p>}</div>}
      </div>}
    </section>
  );
}
