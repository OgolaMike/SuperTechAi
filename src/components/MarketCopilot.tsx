import { useEffect, useMemo, useState } from 'react';
import { Bot, Send, Sparkles, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { TIMEFRAMES, isStale, type Asset, type TfState } from '@/lib/sma';

type Message = { role: 'user' | 'assistant'; content: string };
type Props = {
  assets: Asset[];
  states: Record<string, Record<number, TfState>>;
  prices: Record<string, number>;
  selectedSymbols: string[];
};

const SUGGESTIONS = [
  'What is happening in my monitored markets?',
  'Explain the latest crossover signals in simple language.',
  'Are any of my current signals stale or unavailable?',
];

export function MarketCopilot({ assets, states, prices, selectedSymbols }: Props) {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const loadHistory = async () => {
      try {
        const { data, error: loadError } = await supabase.functions.invoke('academy-ai', {
          body: { action: 'list-market-assistant' },
        });
        if (!active) return;
        if (loadError || data?.error) {
          setError(data?.error || 'Your saved conversation could not be loaded.');
          return;
        }
        if (Array.isArray(data?.messages)) {
          const restored = data.messages.filter((item: unknown): item is Message => {
            if (!item || typeof item !== 'object') return false;
            const row = item as Record<string, unknown>;
            return (row.role === 'user' || row.role === 'assistant') && typeof row.content === 'string';
          });
          setMessages(restored.slice(-40));
        }
      } catch {
        if (active) setError('Your saved conversation could not be loaded. You can still start a new question.');
      } finally {
        if (active) setHistoryLoading(false);
      }
    };
    void loadHistory();
    return () => { active = false; };
  }, []);

  const marketSnapshot = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    const assetMap = new Map(assets.map((asset) => [asset.symbol, asset]));
    return selectedSymbols.map((symbol) => {
      const asset = assetMap.get(symbol);
      const readings = TIMEFRAMES.map((timeframe) => {
        const state = states[symbol]?.[timeframe.granularity];
        if (!state) return { timeframe: timeframe.label, status: 'not loaded' };
        if (isStale(state, now)) return { timeframe: timeframe.label, status: 'stale' };
        const signal = state.latestSignal;
        return {
          timeframe: timeframe.label,
          status: signal ? 'confirmed signal' : 'no confirmed signal',
          direction: signal?.direction ?? null,
          signalTime: signal?.signalEpoch ?? null,
          entry: signal?.levels.entry ?? null,
          stopLoss: signal?.levels.stopLoss ?? null,
          target: signal?.levels.tp3 ?? null,
        };
      });
      return {
        symbol,
        name: asset?.name ?? symbol,
        exchange: asset?.exchange ?? 'unknown',
        price: prices[symbol] ?? null,
        readings,
      };
    });
  }, [assets, states, prices, selectedSymbols]);

  const send = async (value = question) => {
    const prompt = value.trim();
    if (!prompt || busy) return;
    const nextMessages: Message[] = [...messages, { role: 'user', content: prompt }];
    setMessages(nextMessages);
    setQuestion('');
    setBusy(true);
    setError('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('academy-ai', {
        body: {
          action: 'market-assistant',
          question: prompt,
          marketSnapshot,
          history: messages.slice(-8),
        },
      });
      const answer = data?.discussion?.ai_response;
      if (invokeError || data?.error || typeof answer !== 'string' || !answer.trim()) {
        setMessages(messages);
        setQuestion(prompt);
        setError(data?.error || 'Your assistant is unavailable right now. Please try again.');
      } else {
        setMessages([...nextMessages, { role: 'assistant', content: answer }]);
      }
    } catch {
      setMessages(messages);
      setQuestion(prompt);
      setError('Your assistant could not connect. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-6 space-y-5">
      <header className="relative overflow-hidden rounded-3xl border border-accent/25 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 text-white shadow-xl sm:p-8">
        <div className="pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full bg-cyan-300/10 blur-3xl" />
        <div className="relative flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-200/20 bg-cyan-200/10 text-cyan-100"><Bot className="h-6 w-6" /></div>
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-cyan-100"><Sparkles className="h-3.5 w-3.5" /> SuperTech AI Copilot</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Ask your market assistant.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Get clear explanations based on the latest market readings available to your account. It will tell you when information is missing or out of date.</p>
          </div>
        </div>
        <div className="relative mt-5 flex items-center gap-2 text-xs text-slate-300"><ShieldCheck className="h-4 w-4 text-emerald-300" /> Your market snapshot is limited to your monitored assets. Never share broker passwords or API secrets.</div>
      </header>

      <div className="rounded-2xl border border-line/15 bg-surface/[0.035] p-4 sm:p-5">
        {historyLoading ? (
          <p className="py-8 text-center text-sm text-ink-3">Restoring your previous conversation…</p>
        ) : messages.length === 0 ? (
          <div className="space-y-3 py-2">
            <p className="text-sm font-semibold text-ink">Try asking</p>
            {SUGGESTIONS.map((suggestion) => (
              <button key={suggestion} type="button" disabled={busy} onClick={() => void send(suggestion)} className="block w-full rounded-xl border border-line/15 bg-canvas/50 px-4 py-3 text-left text-sm text-ink-2 transition hover:border-accent/35 hover:text-ink disabled:opacity-50">{suggestion}</button>
            ))}
          </div>
        ) : (
          <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1" aria-live="polite">
            {messages.map((message, index) => (
              <div key={index} className={message.role === 'user' ? 'ml-6 rounded-2xl rounded-br-md bg-accent/10 p-4 text-sm text-ink' : 'mr-6 rounded-2xl rounded-bl-md border border-line/15 bg-canvas/60 p-4 text-sm leading-6 text-ink-2'}>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-ink-3">{message.role === 'user' ? 'You' : 'SuperTech AI'}</p>
                <p className="whitespace-pre-wrap">{message.content}</p>
              </div>
            ))}
            {busy && <p className="text-sm text-ink-3">Your assistant is checking the available market information…</p>}
          </div>
        )}
        {error && <p role="alert" className="mt-3 rounded-xl border border-rose-400/20 bg-rose-400/5 p-3 text-sm text-rose-300">{error}</p>}
        <form className="mt-5 flex items-end gap-2 border-t border-line/10 pt-4" onSubmit={(event) => { event.preventDefault(); void send(); }}>
          <textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows={2} maxLength={1600} placeholder="Ask about your signals, markets or the platform…" className="min-h-12 min-w-0 flex-1 resize-y rounded-xl border border-line/15 bg-canvas px-3 py-3 text-sm text-ink outline-none focus:border-accent/50" />
          <button type="submit" disabled={busy || !question.trim()} className="flex h-12 shrink-0 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"><Send className="h-4 w-4" /><span className="hidden sm:inline">Ask</span></button>
        </form>
        <p className="mt-3 text-[11px] leading-5 text-ink-3">Answers are informational, not financial advice. The assistant cannot execute trades. Always verify the chart and manage risk.</p>
      </div>
    </section>
  );
}
