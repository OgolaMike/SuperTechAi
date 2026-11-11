import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Copy, ExternalLink, Megaphone, Plus, Sparkles, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Campaign = {
  id: string;
  title: string;
  campaign_type: string;
  headline: string;
  details: string;
  event_date: string | null;
  event_time: string | null;
  venue: string | null;
  call_to_action: string;
  caption: string;
  status: string;
  created_at: string;
};

const TYPES = [
  ['product', 'Product promotion'],
  ['event', 'Event / webinar'],
  ['offer', 'Membership offer'],
  ['announcement', 'Company announcement'],
  ['education', 'Academy / education'],
  ['community', 'Community update'],
  ['trade-review', 'Trade review'],
] as const;

function makeCopy(form: { title: string; campaign_type: string; headline: string; details: string; event_date: string; event_time: string; venue: string; call_to_action: string }) {
  const event = form.campaign_type === 'event';
  const lines = [
    'SUPERTECH AI',
    form.headline.trim() || form.title.trim(),
    form.details.trim(),
    event ? [form.event_date, form.event_time, form.venue].filter(Boolean).join(' • ') : '',
    form.call_to_action.trim() || 'Discover SuperTech AI',
    '',
    'Hide the complexity. Deliver the intelligence.',
    'Be part of the AI revolution with SuperTech AI.',
    '',
    'Trading involves risk. No profits are guaranteed.',
  ].filter(Boolean);
  return lines.join('\n');
}

export function MarketingStudio() {
  const [items, setItems] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({
    title: '', campaign_type: 'product', headline: '', details: '',
    event_date: '', event_time: '', venue: '', call_to_action: '',
  });
  const caption = useMemo(() => makeCopy(form), [form]);

  async function load() {
    setLoading(true);
    const { data, error: loadError } = await supabase.from('marketing_campaigns')
      .select('*').order('created_at', { ascending: false }).limit(50);
    if (loadError) setError(loadError.message);
    else setItems((data || []) as Campaign[]);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function save() {
    if (!form.title.trim() || !form.headline.trim()) {
      setError('Add a campaign name and headline before saving.');
      return;
    }
    setSaving(true); setError(''); setNotice('');
    const { data, error: saveError } = await supabase.from('marketing_campaigns').insert({
      title: form.title.trim(), campaign_type: form.campaign_type,
      headline: form.headline.trim(), details: form.details.trim(),
      event_date: form.event_date || null, event_time: form.event_time || null,
      venue: form.venue.trim() || null, call_to_action: form.call_to_action.trim(),
      caption, status: 'draft',
    }).select().single();
    if (saveError) setError(saveError.message);
    else { setItems((current) => [data as Campaign, ...current]); setNotice('Campaign draft saved.'); }
    setSaving(false);
  }

  async function remove(id: string) {
    const { error: deleteError } = await supabase.from('marketing_campaigns').delete().eq('id', id);
    if (deleteError) setError(deleteError.message);
    else setItems((current) => current.filter((item) => item.id !== id));
  }

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setNotice('Campaign copy copied.'); }
    catch { setError('Clipboard access is unavailable in this browser.'); }
  }

  return (
    <section className="mt-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Admin workspace</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Marketing Studio</h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-2">Prepare consistent campaigns, event flyers and social captions for SuperTech AI.</p>
        </div>
        <span className="rounded-full border border-accent/30 px-3 py-1.5 text-xs font-medium text-accent">Canva-ready workflow</span>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_.95fr]">
        <div className="rounded-2xl border border-line/15 bg-surface/[0.04] p-5">
          <div className="mb-5 flex items-center gap-2"><Megaphone className="h-5 w-5 text-accent" /><h3 className="font-semibold text-ink">New campaign</h3></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm text-ink-2 sm:col-span-2">Campaign name
              <input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="e.g. November member webinar" className="mt-1 w-full rounded-xl border border-line/20 bg-canvas px-3 py-2.5 text-ink outline-none focus:border-accent" />
            </label>
            <label className="text-sm text-ink-2">Campaign type
              <select value={form.campaign_type} onChange={e=>setForm({...form,campaign_type:e.target.value})} className="mt-1 w-full rounded-xl border border-line/20 bg-canvas px-3 py-2.5 text-ink outline-none focus:border-accent">
                {TYPES.map(([value,label])=><option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="text-sm text-ink-2">Main headline
              <input value={form.headline} onChange={e=>setForm({...form,headline:e.target.value})} placeholder="Your campaign headline" className="mt-1 w-full rounded-xl border border-line/20 bg-canvas px-3 py-2.5 text-ink outline-none focus:border-accent" />
            </label>
            <label className="text-sm text-ink-2 sm:col-span-2">What should people know?
              <textarea value={form.details} onChange={e=>setForm({...form,details:e.target.value})} rows={3} placeholder="Describe the product, announcement, learning session or event. Use confirmed facts." className="mt-1 w-full rounded-xl border border-line/20 bg-canvas px-3 py-2.5 text-ink outline-none focus:border-accent" />
            </label>
            {form.campaign_type === 'event' && <>
              <label className="text-sm text-ink-2">Event date
                <input type="date" value={form.event_date} onChange={e=>setForm({...form,event_date:e.target.value})} className="mt-1 w-full rounded-xl border border-line/20 bg-canvas px-3 py-2.5 text-ink" />
              </label>
              <label className="text-sm text-ink-2">Event time
                <input type="time" value={form.event_time} onChange={e=>setForm({...form,event_time:e.target.value})} className="mt-1 w-full rounded-xl border border-line/20 bg-canvas px-3 py-2.5 text-ink" />
              </label>
              <label className="text-sm text-ink-2 sm:col-span-2">Venue / online link
                <input value={form.venue} onChange={e=>setForm({...form,venue:e.target.value})} placeholder="Venue or meeting link" className="mt-1 w-full rounded-xl border border-line/20 bg-canvas px-3 py-2.5 text-ink" />
              </label>
            </>}
            <label className="text-sm text-ink-2 sm:col-span-2">Call to action
              <input value={form.call_to_action} onChange={e=>setForm({...form,call_to_action:e.target.value})} placeholder="Register now / Learn more / Join us" className="mt-1 w-full rounded-xl border border-line/20 bg-canvas px-3 py-2.5 text-ink" />
            </label>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button onClick={()=>void save()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-canvas disabled:opacity-50"><Plus className="h-4 w-4" />{saving?'Saving…':'Save campaign draft'}</button>
            <button onClick={()=>void copy(caption)} className="inline-flex items-center gap-2 rounded-xl border border-line/20 px-4 py-2.5 text-sm font-medium text-ink"><Copy className="h-4 w-4" />Copy campaign copy</button>
          </div>
          {error && <p role="alert" className="mt-3 text-sm text-rose-400">{error}</p>}
          {notice && <p role="status" className="mt-3 text-sm text-emerald-400">{notice}</p>}
        </div>

        <div className="rounded-2xl border border-line/15 bg-surface/[0.04] p-5">
          <div className="mb-4 flex items-center gap-2"><Sparkles className="h-5 w-5 text-accent" /><h3 className="font-semibold text-ink">Live copy preview</h3></div>
          <div className="min-h-64 whitespace-pre-wrap rounded-xl border border-accent/20 bg-[#090d15] p-5 text-sm leading-7 text-white">{caption}</div>
          <p className="mt-3 text-xs leading-5 text-ink-2">This copy is ready to place into a Canva flyer, story, post or event invitation. Confirm every date, price, link and contact detail before publishing.</p>
          <a href="https://www.canva.com/" target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-xl border border-accent/30 px-4 py-2.5 text-sm font-semibold text-accent"><ExternalLink className="h-4 w-4" />Open Canva</a>
          <div className="mt-3 flex items-start gap-2 text-xs text-ink-2"><CalendarDays className="mt-0.5 h-4 w-4 shrink-0" />For event flyers, date, time and venue appear only when supplied.</div>
        </div>
      </div>

      <div className="rounded-2xl border border-line/15 bg-surface/[0.04] p-5">
        <h3 className="mb-4 font-semibold text-ink">Saved campaigns</h3>
        {loading ? <p className="text-sm text-ink-2">Loading campaigns…</p> : items.length === 0 ? <p className="text-sm text-ink-2">No campaign drafts yet. Create your first one above.</p> :
          <div className="space-y-3">{items.map(item=><div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line/10 p-3">
            <div><p className="font-medium text-ink">{item.title}</p><p className="text-xs text-ink-2">{item.campaign_type} · {new Date(item.created_at).toLocaleString()}</p></div>
            <div className="flex gap-2"><button onClick={()=>void copy(item.caption)} aria-label="Copy campaign copy" className="rounded-lg border border-line/20 p-2 text-ink-2 hover:text-ink"><Copy className="h-4 w-4" /></button><button onClick={()=>void remove(item.id)} aria-label="Delete campaign" className="rounded-lg border border-line/20 p-2 text-rose-400"><Trash2 className="h-4 w-4" /></button></div>
          </div>)}</div>}
      </div>
    </section>
  );
}
