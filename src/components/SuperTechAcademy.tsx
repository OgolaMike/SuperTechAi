import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { BookOpen, CheckCircle2, ChevronRight, Clock3, Copy, GraduationCap, PlayCircle, Search, ShieldCheck, Video, WandSparkles } from 'lucide-react';

type Lesson = {
  id: string; title: string; category: string; level: string; duration: string; summary: string;
  objective: string; steps: string[]; narration: string; visualPrompt: string;
  quiz: { question: string; answers: string[]; correct: number; explanation: string };
};

const LESSONS: Lesson[] = [
  { id: 'welcome', title: 'Welcome to SuperTechAi', category: 'Getting started', level: 'Beginner', duration: '3 min', summary: 'Understand what the platform does and where to begin.', objective: 'Know where to find the tools you need and what the platform can and cannot do.', steps: ['Open your Dashboard for the market overview and monitored assets.', 'Use the navigation bar to explore signals, crypto, orders, network and earnings.', 'Visit Academy whenever you need a guided explanation.', 'Remember that signals support decisions; they do not guarantee outcomes.'], narration: 'Welcome to SuperTechAi. Your platform brings market intelligence, trading signals, crypto monitoring, automation tools and member services into one place. Start with the Dashboard, explore each section at your own pace, and use the Academy whenever you need help. SuperTechAi helps you make more informed decisions. It does not remove market risk or guarantee profits.', visualPrompt: 'Show a premium dark navy fintech dashboard, cyan and subtle gold accents, a friendly professional narrator, readable captions and smooth UI transitions. Introduce market intelligence, signals, crypto monitoring, automation and member tools. End with: Learn the platform. Understand the risk. Make informed decisions.', quiz: { question: 'What is SuperTechAi designed to provide?', answers: ['Guaranteed profits', 'Trading intelligence and platform tools', 'A replacement for risk management'], correct: 1, explanation: 'SuperTechAi provides information and tools. Trading outcomes are never guaranteed.' } },
  { id: 'dashboard', title: 'Your Dashboard explained', category: 'Trading intelligence', level: 'Beginner', duration: '4 min', summary: 'Read the market overview, asset selector, live status and signal cards.', objective: 'Find key information without getting lost in technical details.', steps: ['Check the connection and market status at the top.', 'Choose the assets you want SuperTechAi to monitor.', 'Review signal direction, entry information and current status.', 'Open the chart snapshot to understand recent price movement.'], narration: 'The Dashboard is your starting point. First, check that market data is connected. Next, choose the assets you want to follow. Each signal card presents the current direction and important trade information. Open the chart snapshot to inspect recent price movement. A signal is a prompt to review the market, not an instruction to trade blindly.', visualPrompt: 'Create a screen-led tutorial using a fictional dark trading dashboard. Animate the status bar, asset selector, signal cards and chart snapshot. Use cursor highlights, cyan outlines and short captions. Do not invent live prices or performance claims.', quiz: { question: 'What should you check before relying on a signal?', answers: ['Connection status and chart context', 'Only the signal colour', 'Nothing else'], correct: 0, explanation: 'Check that data is connected and review chart context and risk.' } },
  { id: 'signals', title: 'Understanding Trading Signals', category: 'Trading intelligence', level: 'Beginner', duration: '5 min', summary: 'Learn BUY and SELL signals, confirmation and trade levels.', objective: 'Understand what a signal communicates before deciding whether it fits your plan.', steps: ['BUY indicates conditions may favour an upward move.', 'SELL indicates conditions may favour a downward move.', 'Review timeframe, entry, stop loss and take-profit information.', 'Wait for confirmation and use your own risk controls.'], narration: 'A BUY signal means the system has detected conditions that may favour an upward move. A SELL signal means conditions may favour a downward move. Neither is a promise. Before taking action, review the timeframe, entry area, stop loss and targets. Respect confirmation rules and never risk money you cannot afford to lose.', visualPrompt: 'Show simple animated BUY and SELL cards, candle-close confirmation, entry, stop-loss and take-profit markers. Keep language beginner-friendly. Show both winning and losing example paths so viewers understand uncertainty.', quiz: { question: 'Does a BUY or SELL signal guarantee the expected price move?', answers: ['Yes', 'No, it is a probability-based signal'], correct: 1, explanation: 'Signals can fail. Use risk controls and make your own informed decision.' } },
  { id: 'super', title: 'How Super Signal works', category: 'Trading intelligence', level: 'Intermediate', duration: '4 min', summary: 'Understand why agreement across all eight timeframes matters.', objective: 'Recognise a high-confluence alert and why confirmation still matters.', steps: ['Super Signal looks for agreement across eight timeframes.', 'The alert appears when all required timeframes align.', 'Review reversal context and the underlying chart before acting.', 'If conditions change, wait for a fresh setup instead of chasing price.'], narration: 'Super Signal highlights moments when all eight monitored timeframes point in the same direction. This agreement can provide stronger context than a single timeframe alone. It does not guarantee a successful trade. Check the chart, understand the broader move, and apply your risk plan.', visualPrompt: 'Animate eight timeframe tiles aligning, then show a Super Signal alert and a clean candlestick chart with higher-timeframe context and a risk checklist. Do not imply certainty or guaranteed win rates.', quiz: { question: 'What makes a Super Signal different?', answers: ['It uses one timeframe only', 'It requires agreement across eight timeframes', 'It removes trading risk'], correct: 1, explanation: 'The defining feature is agreement across all eight monitored timeframes.' } },
  { id: 'crypto', title: 'Crypto Watchlist and market movers', category: 'Crypto', level: 'Beginner', duration: '4 min', summary: 'Explore Binance assets, top gainers, losers and alerts.', objective: 'Find crypto opportunities without confusing market movement with a confirmed setup.', steps: ['Open Crypto to view monitored assets and market movers.', 'Use gainers and losers as a discovery list, not an automatic trade list.', 'Open an asset to review its chart and available analysis.', 'Add assets to your monitored list when you want them on your Dashboard.'], narration: 'The Crypto section helps you discover what is moving. Top gainers and losers show movement, not a guaranteed opportunity. Open an asset to inspect its chart and analysis. Add symbols you want to monitor, then review any signal and your risk settings before considering a trade.', visualPrompt: 'Show a dark watchlist, green and red market mover rows, asset detail charts and the distinction between price movement and a confirmed signal. Use fictional sample data and never claim future returns.', quiz: { question: 'Does appearing among top gainers automatically mean an asset is a BUY?', answers: ['Yes', 'No, review its analysis and risk first'], correct: 1, explanation: 'A price mover is a discovery cue, not a trade recommendation by itself.' } },
  { id: 'automation', title: 'Trading automation and pending orders', category: 'Automation', level: 'Advanced', duration: '6 min', summary: 'Understand connected accounts, automation controls and order monitoring.', objective: 'Know the difference between an analysis signal and an executed order.', steps: ['Read connection and account status before enabling automation.', 'Review configured assets, order rules and risk limits.', 'Use Pending Orders to inspect queued opportunities and their status.', 'Monitor execution and account exposure; pause automation if anything looks wrong.'], narration: 'Automation can help carry out a defined plan, but it makes configuration and monitoring more important. A signal is analysis. A pending order is an instruction waiting for its conditions. An executed order is a live position. Check your connection, allowed assets, risk limits and order details before enabling automation. Monitor activity regularly.', visualPrompt: 'Explain a trading automation control panel, connection status, allowed assets, risk limit, pending order queue and execution status. Show a pre-flight checklist and pause control. Never imply risk-free automation.', quiz: { question: 'What is the difference between a pending order and an executed order?', answers: ['They are identical', 'A pending order is waiting for conditions; executed means a trade opened', 'A pending order is a completed profit'], correct: 1, explanation: 'A pending order has not necessarily opened a position yet.' } },
  { id: 'network', title: 'Referrals and your network', category: 'Membership', level: 'Beginner', duration: '5 min', summary: 'Find your referral link and understand how your network grows.', objective: 'Share your invitation correctly and distinguish real members from open positions.', steps: ['Open My Referrals to find your personal referral link.', 'Share the link with someone who wants to join.', 'After payment confirmation, the member becomes active.', 'Open Network to explore the structure and available positions.'], narration: 'Your referral link helps new members register under your invitation. Share the correct link and let the person complete membership payment. Once payment is confirmed, the member becomes active and appears in the network. Open positions are spaces for future members; they are not people or confirmed sales.', visualPrompt: 'Show a referral link journey: share link, registration, payment confirmation, active member and network tree updating. Distinguish empty positions from actual members. Do not promise earnings.', quiz: { question: 'When should a new member appear as an active paid member?', answers: ['As soon as the link is shared', 'After membership payment is confirmed', 'When they view the network page'], correct: 1, explanation: 'Sharing a link is not a sale. Payment must be confirmed.' } },
  { id: 'wallet', title: 'Earnings, wallet and withdrawals', category: 'Membership', level: 'Intermediate', duration: '5 min', summary: 'Understand balances, your TRC20 wallet and withdrawal procedures.', objective: 'Know where earnings are shown and how to keep payout details accurate.', steps: ['Open My Earnings to review balances and transaction history.', 'Save the correct USDT TRC20 payout address in wallet settings.', 'Review any withdrawal fee and net payout before submitting.', 'Check withdrawal status and transaction reference after processing.'], narration: 'Your Earnings area shows balances recorded for your member account. Keep your USDT TRC20 payout wallet accurate and secure. Before submitting a withdrawal, review the amount, fee and net payout. A submitted request does not always mean the blockchain transfer is complete. Check the final status and transaction reference.', visualPrompt: 'Show a sample earnings ledger, masked example TRC20 address, withdrawal amount, fee and net payout confirmation. Never display real wallet credentials, private keys or member data. Explain that a submitted request and a confirmed blockchain transfer are different states.', quiz: { question: 'Should you share your wallet private key to receive a payout?', answers: ['Yes', 'No, only provide the public TRC20 receiving address'], correct: 1, explanation: 'Never share a private key or recovery phrase. A receiving address is public.' } },
];

type AcademyVideo = {
  id: string; lesson_id: string; lesson_title: string; status: 'pending' | 'processing' | 'completed' | 'failed';
  video_url?: string | null; thumbnail_url?: string | null; failure_reason?: string | null; created_at: string;
};

async function academyVideoRequest(payload: Record<string, unknown>) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Please sign in again to use Academy video production.');
  const { data, error } = await supabase.functions.invoke('academy-videos', {
    body: payload,
    headers: { Authorization: 'Bearer ' + token },
  });
  if (error) {
    const context = (error as { context?: Response }).context;
    const detail = context ? await context.clone().json().catch(() => null) : null;
    throw new Error(typeof detail?.error === 'string' ? detail.error : error.message || 'Academy video service is unavailable.');
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

const CATEGORIES = ['All lessons', 'Getting started', 'Trading intelligence', 'Crypto', 'Automation', 'Membership'];
function makeBrief(lesson: Lesson) {
  return [
    'SUPERTECHAI ACADEMY — AI VIDEO PRODUCTION BRIEF',
    'Lesson: ' + lesson.title,
    'Audience: ' + lesson.level + ' SuperTechAi members',
    'Target duration: ' + lesson.duration,
    'Format: 16:9 landscape, 1080p, professional screen-led explainer.',
    'Brand: premium dark navy fintech interface, electric cyan highlights, subtle gold details, crisp white captions.',
    'Voice: warm, confident, clear English narrator; simple language; moderate pace.',
    'Accuracy: demonstrate only the described feature; use fictional sample data; never invent live performance statistics or promise profits.',
    '',
    'VISUAL DIRECTION:', lesson.visualPrompt, '',
    'NARRATION SCRIPT:', lesson.narration, '',
    'ON-SCREEN LEARNING STEPS:', ...lesson.steps.map((step, index) => (index + 1) + '. ' + step),
    '', 'ENDING: “SuperTechAi — Understand the tools. Make informed decisions. Always manage risk.”',
  ].join('\n');
}

export function SuperTechAcademy({ isAdmin }: { isAdmin: boolean }) {
  const [category, setCategory] = useState('All lessons');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('welcome');
  const [completed, setCompleted] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('supertech-academy-completed') ?? '[]'); } catch { return []; }
  });
  const [answer, setAnswer] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [studio, setStudio] = useState(false);
  const [videos, setVideos] = useState<AcademyVideo[]>([]);
  const [videoBusy, setVideoBusy] = useState(false);
  const [videoError, setVideoError] = useState('');
  const [videoNotice, setVideoNotice] = useState('');

  useEffect(() => {
    let active = true;
    academyVideoRequest({ action: isAdmin ? 'jobs' : 'list' })
      .then((result) => { if (active) setVideos(Array.isArray(result.videos) ? result.videos : []); })
      .catch((error) => { if (active) setVideoError(error instanceof Error ? error.message : 'Could not load Academy videos.'); });
    return () => { active = false; };
  }, [isAdmin]);

  const generateVideo = async () => {
    setVideoBusy(true); setVideoError(''); setVideoNotice('');
    try {
      const prompt = makeBrief(selected) + '\n\nPRODUCTION REQUIREMENTS: Create a complete, polished 3–5 minute training video, not a short teaser. Preserve the lesson narration and teach every listed step. Use a friendly professional presenter, clear English narration, scene-by-scene screen demonstrations, captions, transitions, and the SuperTechAi dark navy, electric cyan and subtle gold visual identity. Landscape 16:9. Never invent platform performance or promise profits.';
      const result = await academyVideoRequest({ action: 'create', lessonId: selected.id, lessonTitle: selected.title, prompt });
      if (result.video) setVideos((current) => [result.video, ...current.filter((item) => item.id !== result.video.id)]);
      setVideoNotice('Video submitted to HeyGen. Rendering happens in the background; check its status shortly.');
    } catch (error) {
      setVideoError(error instanceof Error ? error.message : 'Could not start video generation.');
    } finally { setVideoBusy(false); }
  };

  const refreshVideo = async (videoId: string) => {
    setVideoBusy(true); setVideoError('');
    try {
      const result = await academyVideoRequest({ action: 'refresh', videoId });
      if (result.video) setVideos((current) => current.map((item) => item.id === result.video.id ? result.video : item));
      if (result.video?.status === 'completed') setVideoNotice('Your lesson video is ready for members.');
      else if (result.video?.status === 'failed') setVideoError(result.video.failure_reason || 'HeyGen could not complete this video.');
      else setVideoNotice('HeyGen is still rendering this lesson. Check again in a little while.');
    } catch (error) { setVideoError(error instanceof Error ? error.message : 'Could not refresh video status.'); }
    finally { setVideoBusy(false); }
  };

  const checkProvider = async () => {
    setVideoBusy(true); setVideoError(''); setVideoNotice('');
    try {
      const result = await academyVideoRequest({ action: 'health' });
      setVideoNotice(result.configured ? 'HeyGen is connected and its API key was accepted.' : 'HeyGen connection could not be verified.');
    } catch (error) { setVideoError(error instanceof Error ? error.message : 'HeyGen connection check failed.'); }
    finally { setVideoBusy(false); }
  };

  const selectedVideo = videos.find((video) => video.lesson_id === selected.id && video.status === 'completed' && video.video_url);
  const filtered = useMemo(() => LESSONS.filter((lesson) =>
    (category === 'All lessons' || lesson.category === category) &&
    (lesson.title.toLowerCase().includes(query.toLowerCase()) || lesson.summary.toLowerCase().includes(query.toLowerCase()))
  ), [category, query]);
  const selected = LESSONS.find((lesson) => lesson.id === selectedId) ?? LESSONS[0];
  const progress = Math.round(completed.length / LESSONS.length * 100);
  const markComplete = () => {
    const next = completed.includes(selected.id) ? completed : [...completed, selected.id];
    setCompleted(next);
    localStorage.setItem('supertech-academy-completed', JSON.stringify(next));
  };
  const copyBrief = async () => {
    const brief = makeBrief(selected);
    try {
      await navigator.clipboard.writeText(brief);
    } catch {
      const area = document.createElement('textarea');
      area.value = brief; document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  };

  return (
    <main className="mt-8 space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-cyan-300/20 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 shadow-2xl sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative grid gap-7 lg:grid-cols-[1.4fr_0.6fr] lg:items-center">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200"><GraduationCap className="h-4 w-4" /> SuperTechAi Academy</div>
            <h1 className="max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-4xl">Learn the platform. Understand the intelligence.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Short, practical lessons for your Dashboard, signals, crypto, automation, referrals and earnings.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button onClick={() => { setSelectedId('welcome'); setAnswer(null); }} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-cyan-200"><PlayCircle className="h-4 w-4" /> Start learning</button>
              <button onClick={() => setStudio(!studio)} className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"><WandSparkles className="h-4 w-4" /> AI video studio</button>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-5">
            <div className="flex items-center justify-between text-sm text-slate-300"><span>Your learning progress</span><span className="font-semibold text-cyan-200">{progress}%</span></div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300" style={{ width: progress + '%' }} /></div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-black/20 p-3"><p className="text-2xl font-bold text-white">{completed.length}/{LESSONS.length}</p><p className="text-xs text-slate-400">Lessons completed</p></div>
              <div className="rounded-xl bg-black/20 p-3"><p className="text-2xl font-bold text-white">{LESSONS.length}</p><p className="text-xs text-slate-400">Lessons available</p></div>
            </div>
          </div>
        </div>
      </section>

      {studio && <section className="rounded-2xl border border-cyan-300/20 bg-surface/[0.04] p-5">
        <div className="flex items-start gap-3"><WandSparkles className="mt-1 h-5 w-5 text-accent" /><div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">AI video production studio</p>
          <h2 className="mt-1 text-xl font-semibold text-ink">Turn this lesson into a branded video</h2>
          <p className="mt-2 text-sm leading-6 text-ink-2">Generate a narrated lesson with HeyGen, then publish the finished video for members to watch inside Academy.</p>
          {isAdmin && <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={generateVideo} disabled={videoBusy} className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><WandSparkles className="h-4 w-4" /> {videoBusy ? 'Working…' : 'Generate selected lesson'}</button>
            <button onClick={checkProvider} disabled={videoBusy} className="inline-flex items-center gap-2 rounded-xl border border-line/15 px-4 py-2.5 text-sm font-semibold text-ink-2 disabled:opacity-50">Check HeyGen connection</button>
            <button onClick={copyBrief} className="inline-flex items-center gap-2 rounded-xl border border-line/15 px-4 py-2.5 text-sm font-semibold text-ink-2"><Copy className="h-4 w-4" /> {copied ? 'Brief copied' : 'Copy production brief'}</button>
          </div>}
          {videoNotice && <p className="mt-3 rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-3 text-xs text-emerald-500">{videoNotice}</p>}
          {videoError && <p className="mt-3 rounded-lg border border-rose-400/20 bg-rose-400/5 p-3 text-xs text-rose-400">{videoError}</p>}
          {isAdmin && <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-3">Video production queue</p>
            {videos.length === 0 && <p className="text-xs text-ink-3">No Academy videos generated yet.</p>}
            {videos.map((video) => <div key={video.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line/10 p-3">
              <div className="min-w-0"><p className="text-sm font-medium text-ink">{video.lesson_title}</p><p className="text-xs capitalize text-ink-3">{video.status}</p></div>
              {video.status !== 'completed' && video.status !== 'failed' && <button onClick={() => refreshVideo(video.id)} disabled={videoBusy} className="rounded-lg border border-accent/30 px-3 py-1.5 text-xs font-semibold text-accent disabled:opacity-50">Check status</button>}
              {video.status === 'completed' && video.video_url && <a href={video.video_url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-accent">Open video</a>}
            </div>)}
          </div>}
          {!isAdmin && <p className="mt-3 text-xs text-ink-3">Completed teaching videos appear here when published by the Academy team.</p>}
        </div></div>
      </section>}

      <section className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-4">
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a lesson..." className="w-full rounded-xl border border-line/15 bg-surface/[0.04] py-3 pl-10 pr-3 text-sm text-ink outline-none focus:border-accent/60" /></div>
          <div className="flex gap-2 overflow-x-auto pb-1">{CATEGORIES.map((item) => <button key={item} onClick={() => setCategory(item)} className={'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ' + (category === item ? 'border-accent/50 bg-accent/10 text-accent' : 'border-line/10 text-ink-2')}>{item}</button>)}</div>
          <div className="space-y-2">{filtered.map((lesson) => <button key={lesson.id} onClick={() => { setSelectedId(lesson.id); setAnswer(null); }} className={'w-full rounded-2xl border p-4 text-left transition ' + (selected.id === lesson.id ? 'border-accent/50 bg-accent/[0.07]' : 'border-line/10 bg-surface/[0.025] hover:border-accent/30')}>
            <div className="flex items-start gap-3"><div className={'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ' + (completed.includes(lesson.id) ? 'bg-emerald-400/10 text-emerald-400' : 'bg-accent/10 text-accent')}>{completed.includes(lesson.id) ? <CheckCircle2 className="h-5 w-5" /> : <PlayCircle className="h-5 w-5" />}</div>
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-xs text-ink-3">Lesson {LESSONS.findIndex((item) => item.id === lesson.id) + 1}</span><span className="rounded-full bg-surface/10 px-2 py-0.5 text-[10px] text-ink-3">{lesson.level}</span></div><p className="mt-1 font-semibold text-ink">{lesson.title}</p><p className="mt-1 text-xs leading-5 text-ink-2">{lesson.summary}</p><div className="mt-2 flex items-center gap-1 text-[11px] text-ink-3"><Clock3 className="h-3 w-3" /> {lesson.duration}</div></div><ChevronRight className="mt-2 h-4 w-4 shrink-0 text-ink-3" />
            </div></button>)}{filtered.length === 0 && <p className="rounded-xl border border-dashed border-line/20 p-5 text-sm text-ink-3">No lessons match that search.</p>}</div>
        </div>
        <article className="min-w-0 overflow-hidden rounded-2xl border border-line/10 bg-surface/[0.035]">
          <div className="relative flex min-h-48 items-center justify-center overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-7 text-center">
            <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle at 25% 20%, rgba(34,211,238,.4), transparent 35%), radial-gradient(circle at 80% 80%, rgba(251,191,36,.2), transparent 35%)' }} />
            <div className="relative max-w-md"><div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/30 bg-cyan-300/10 text-cyan-200"><Video className="h-7 w-7" /></div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Academy lesson</p><h2 className="mt-2 text-2xl font-bold text-white">{selected.title}</h2><p className="mt-2 text-sm text-slate-300">{selected.duration} · {selected.level}</p><p className="mt-3 text-xs text-slate-400">Guided lesson and video-production script</p></div>
          </div>
          {selectedVideo?.video_url && <div className="border-b border-line/10 bg-black p-2"><video className="aspect-video w-full rounded-xl" controls preload="metadata" poster={selectedVideo.thumbnail_url || undefined} src={selectedVideo.video_url}>Your browser does not support video playback.</video></div>}
          <div className="space-y-5 p-5 sm:p-6">
            <div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-accent">What you will learn</p><p className="mt-2 text-sm leading-6 text-ink-2">{selected.objective}</p></div>
            <div className="space-y-3">{selected.steps.map((step, index) => <div key={step} className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-accent/30 text-xs font-semibold text-accent">{index + 1}</span><p className="pt-0.5 text-sm leading-6 text-ink-2">{step}</p></div>)}</div>
            <div className="rounded-xl border border-line/10 bg-surface/[0.035] p-4"><div className="flex items-center gap-2 text-sm font-semibold text-ink"><BookOpen className="h-4 w-4 text-accent" /> Knowledge check</div><p className="mt-3 text-sm font-medium text-ink">{selected.quiz.question}</p><div className="mt-3 space-y-2">{selected.quiz.answers.map((option, index) => <button key={option} onClick={() => setAnswer(index)} className={'w-full rounded-lg border px-3 py-2.5 text-left text-sm ' + (answer === index ? (index === selected.quiz.correct ? 'border-emerald-400/50 bg-emerald-400/10 text-ink' : 'border-rose-400/50 bg-rose-400/10 text-ink') : 'border-line/10 text-ink-2 hover:border-accent/30')}>{option}</button>)}</div>{answer !== null && <p className={'mt-3 text-xs leading-5 ' + (answer === selected.quiz.correct ? 'text-emerald-400' : 'text-rose-400')}>{answer === selected.quiz.correct ? 'Correct. ' : 'Not quite. '}{selected.quiz.explanation}</p>}</div>
            <div className="flex flex-wrap gap-3"><button onClick={markComplete} disabled={completed.includes(selected.id) || answer !== selected.quiz.correct} className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"><CheckCircle2 className="h-4 w-4" /> {completed.includes(selected.id) ? 'Lesson completed' : 'Mark lesson complete'}</button><button onClick={copyBrief} className="inline-flex items-center gap-2 rounded-xl border border-line/15 px-4 py-2.5 text-sm font-semibold text-ink-2 hover:text-ink"><Copy className="h-4 w-4" /> Copy AI video brief</button></div>
            <div className="flex items-start gap-2 border-t border-line/10 pt-4 text-xs leading-5 text-ink-3"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" /> Trading involves risk. Lessons are educational and do not promise returns or replace independent judgement.</div>
          </div>
        </article>
      </section>
    </main>
  );
}
