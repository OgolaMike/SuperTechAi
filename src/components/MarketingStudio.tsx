import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Copy, Download, ExternalLink, Megaphone, Plus, Printer, Sparkles, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Campaign = {
  id: string; title: string; campaign_type: string; headline: string; details: string;
  event_date: string | null; event_time: string | null; venue: string | null;
  call_to_action: string; caption: string; status: string; created_at: string;
};
const TYPES = [
  ['product', 'Product promotion'], ['event', 'Event / webinar'], ['offer', 'Membership offer'],
  ['announcement', 'Company announcement'], ['education', 'Academy / education'],
  ['community', 'Community update'], ['trade-review', 'Trade review'],
] as const;
type FormState = { title:string; campaign_type:string; headline:string; details:string; event_date:string; event_time:string; venue:string; call_to_action:string };
const EMPTY: FormState = { title:'', campaign_type:'product', headline:'', details:'', event_date:'', event_time:'', venue:'', call_to_action:'' };

function autoWrite(f: FormState): FormState {
  const type = f.campaign_type;
  const presets: Record<string, {headline:string; details:string; cta:string; title:string}> = {
    product: { title:'SuperTech AI product campaign', headline:'See the market with greater clarity.', details:'Discover a smarter way to follow market signals, explore multiple markets and learn from clear trading insights with SuperTech AI.', cta:'Discover SuperTech AI' },
    event: { title:'SuperTech AI live event', headline:'You are invited.', details:'Join the SuperTech AI community for a focused session with practical insights, demonstrations and time for your questions. Add the confirmed event details before sharing.', cta:'Reserve your place' },
    offer: { title:'SuperTech AI membership offer', headline:'Your next step starts here.', details:'Explore SuperTech AI membership and discover the tools, market insights and learning resources available to members. Confirm the current price and offer terms before publishing.', cta:'Ask about membership' },
    announcement: { title:'SuperTech AI announcement', headline:'A new update from SuperTech AI.', details:'We are continually improving the SuperTech AI experience. Read the latest update and see what is new for our community.', cta:'Read the update' },
    education: { title:'SuperTech AI Academy', headline:'Learn. Understand. Improve.', details:'Build your market knowledge with learning sessions, selected trade breakdowns and clear explanations from the SuperTech AI Academy.', cta:'Explore the Academy' },
    community: { title:'SuperTech AI community update', headline:'Better insights. Stronger community.', details:'Connect with the SuperTech AI community, share ideas and keep learning together. Add the confirmed community details before publishing.', cta:'Join the community' },
    'trade-review': { title:'SuperTech AI trade breakdown', headline:'Understand the setup, not just the outcome.', details:'Explore a selected trade with its market context, entry, risk, targets and lessons. Past examples are educational and do not guarantee future results.', cta:'Explore the trade review' },
  };
  const p = presets[type] || presets.product;
  return { ...f, title:f.title.trim() || p.title, headline:f.headline.trim() || p.headline, details:f.details.trim() || p.details, call_to_action:f.call_to_action.trim() || p.cta };
}
function makeCopy(f: FormState) {
  const event = f.campaign_type === 'event';
  return ['SUPERTECH AI', f.headline.trim() || f.title.trim(), f.details.trim(),
    event ? [f.event_date, f.event_time, f.venue].filter(Boolean).join(' • ') : '',
    f.call_to_action.trim() || 'Discover SuperTech AI', '',
    'Hide the complexity. Deliver the intelligence.',
    'Be part of the AI revolution with SuperTech AI.',
    '', 'Trading involves risk. No profits are guaranteed.'].filter(Boolean).join('\n');
}
function xml(value: string) { return value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c] || c)); }
function wrap(value: string, limit: number) {
  const words = value.split(/\s+/); const lines:string[]=[]; let line='';
  for (const word of words) { if ((line + ' ' + word).trim().length > limit && line) { lines.push(line); line=word; } else line=(line+' '+word).trim(); }
  if (line) lines.push(line); return lines.slice(0,5);
}
function posterSvg(f: FormState, format: 'portrait'|'square'|'story') {
  const sizes = { portrait:[1080,1350], square:[1080,1080], story:[1080,1920] } as const;
  const [w,h] = sizes[format]; const titleLines = wrap(f.headline || 'Hide the complexity. Deliver the intelligence.', 22);
  const detailLines = wrap(f.details || 'Clear market insights, learning resources and a community built around better decisions.', 43);
  const dateLine = [f.event_date, f.event_time, f.venue].filter(Boolean).join('  •  ');
  const titleY = format === 'story' ? 620 : format === 'square' ? 390 : 470;
  const detailY = titleY + titleLines.length*94 + 45;
  const detailSvg = detailLines.map((line,i)=>'<text x="88" y="'+(detailY+i*48)+'" fill="#d6deec" font-size="31" font-family="Arial,sans-serif">'+xml(line)+'</text>').join('');
  const titleSvg = titleLines.map((line,i)=>'<text x="88" y="'+(titleY+i*94)+'" fill="#ffffff" font-size="76" font-weight="700" font-family="Arial,sans-serif">'+xml(line)+'</text>').join('');
  const dateY = Math.min(detailY+detailLines.length*48+65,h-330);
  return '<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#070b13"/><stop offset="1" stop-color="#14243c"/></linearGradient><linearGradient id="line" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#19c7ff"/><stop offset="1" stop-color="#d7ad54"/></linearGradient><radialGradient id="glow"><stop stop-color="#1678b8" stop-opacity=".38"/><stop offset="1" stop-color="#1678b8" stop-opacity="0"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#bg)"/><circle cx="'+(w-70)+'" cy="210" r="390" fill="url(#glow)"/><path d="M0 '+(h*.78)+' L'+(w*.28)+' '+(h*.58)+' L'+(w*.46)+' '+(h*.68)+' L'+(w*.7)+' '+(h*.42)+' L'+w+' '+(h*.5)+'" fill="none" stroke="#1ba9df" stroke-opacity=".22" stroke-width="5"/><path d="M88 120 H'+(w-88)+'" stroke="url(#line)" stroke-width="7"/><text x="88" y="205" fill="#ffffff" font-size="46" font-weight="700" letter-spacing="8" font-family="Arial,sans-serif">SUPERTECH AI</text><text x="88" y="275" fill="#e4b95d" font-size="23" letter-spacing="6" font-family="Arial,sans-serif">TRADING INTELLIGENCE</text>'+titleSvg+detailSvg+(dateLine?'<text x="88" y="'+dateY+'" fill="#e4b95d" font-size="27" font-weight="700" font-family="Arial,sans-serif">'+xml(dateLine.slice(0,85))+'</text>':'')+'<rect x="88" y="'+(h-245)+'" width="'+(w-176)+'" height="105" rx="18" fill="url(#line)"/><text x="130" y="'+(h-178)+'" fill="#07111c" font-size="35" font-weight="700" font-family="Arial,sans-serif">'+xml((f.call_to_action||'DISCOVER SUPERTECH AI').toUpperCase().slice(0,34))+'</text><text x="88" y="'+(h-86)+'" fill="#ffffff" font-size="24" font-family="Arial,sans-serif">Hide the complexity. Deliver the intelligence.</text><text x="'+(w-88)+'" y="'+(h-86)+'" text-anchor="end" fill="#aab7c9" font-size="18" font-family="Arial,sans-serif">Trading involves risk.</text></svg>';
}

export function MarketingStudio() {
  const [items,setItems] = useState<Campaign[]>([]); const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false); const [generating,setGenerating] = useState(false); const [error,setError] = useState(''); const [notice,setNotice] = useState('');
  const [form,setForm] = useState<FormState>(EMPTY); const [format,setFormat] = useState<'portrait'|'square'|'story'>('portrait');
  const caption = useMemo(()=>makeCopy(form),[form]);
  const svg = useMemo(()=>posterSvg(form,format),[form,format]);
  async function load() {
    setLoading(true); const {data,error:loadError}=await supabase.from('marketing_campaigns').select('*').order('created_at',{ascending:false}).limit(50);
    if(loadError) setError(loadError.message); else setItems((data||[]) as Campaign[]); setLoading(false);
  }
  useEffect(()=>{void load();},[]);
  async function generateWithAI() {
    setGenerating(true); setError(''); setNotice('');
    const { data, error: aiError } = await supabase.functions.invoke('marketing-ai', { body: form });
    if (aiError) {
      let message = aiError.message || 'AI campaign generation failed.';
      try { const context = (aiError as any).context; if (context?.json) { const body = await context.json(); message = body.error || message; } } catch {}
      setError(message);
    } else if (data?.campaign) {
      setForm(current => ({ ...current, ...data.campaign }));
      setNotice('AI campaign created. Review the details, then download or save it.');
    } else setError(data?.error || 'AI returned no campaign. Please try again.');
    setGenerating(false);
  }
  async function save() {
    if(!form.title.trim()||!form.headline.trim()){setError('Add a campaign name and headline before saving.');return;}
    setSaving(true);setError('');setNotice('');
    const {data,error:saveError}=await supabase.from('marketing_campaigns').insert({
      title:form.title.trim(),campaign_type:form.campaign_type,headline:form.headline.trim(),details:form.details.trim(),
      event_date:form.event_date||null,event_time:form.event_time||null,venue:form.venue.trim()||null,
      call_to_action:form.call_to_action.trim(),caption,status:'draft'
    }).select().single();
    if(saveError)setError(saveError.message);else{setItems(current=>[data as Campaign,...current]);setNotice('Campaign draft saved.');}
    setSaving(false);
  }
  async function remove(id:string) {
    const {error:deleteError}=await supabase.from('marketing_campaigns').delete().eq('id',id);
    if(deleteError)setError(deleteError.message);else setItems(current=>current.filter(item=>item.id!==id));
  }
  async function copy(text:string) {
    try{await navigator.clipboard.writeText(text);setNotice('Campaign copy copied.');}
    catch{setError('Clipboard access is unavailable in this browser.');}
  }
  function download() {
    const blob=new Blob([svg],{type:'image/svg+xml;charset=utf-8'});const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=(form.title.trim()||'supertech-ai-campaign').toLowerCase().replace(/[^a-z0-9]+/g,'-')+'-'+format+'.svg';
    document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);setNotice('Flyer downloaded as a high-resolution SVG. You can also import it into Canva.');
  }
  function printPdf() {
    const w=window.open('','_blank','noopener,noreferrer'); if(!w){setError('Allow pop-ups to create a PDF.');return;}
    w.document.write('<!doctype html><html><head><title>SuperTech AI Flyer</title><style>@page{size:auto;margin:0}html,body{margin:0;padding:0}svg{display:block;width:100%;height:auto;max-height:100vh;object-fit:contain}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}</style></head><body>'+svg+'</body></html>');
    w.document.close();w.focus();w.print();
  }
  const update=(key:keyof FormState,value:string)=>setForm(current=>({...current,[key]:value}));
  return <section className="mt-8 space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Admin workspace</p><h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Marketing Studio</h2><p className="mt-2 max-w-2xl text-sm text-ink-2">Use AI to write campaign copy and create branded flyers ready to download or import into Canva.</p></div><span className="rounded-full border border-accent/30 px-3 py-1.5 text-xs font-medium text-accent">AI + auto-design</span></div>
    <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
      <div className="rounded-2xl border border-line/15 bg-surface/[0.04] p-5">
        <div className="mb-5 flex items-center gap-2"><Sparkles className="h-5 w-5 text-accent"/><h3 className="font-semibold text-ink">Campaign assistant</h3></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm text-ink-2 sm:col-span-2">Campaign name<input value={form.title} onChange={e=>update('title',e.target.value)} placeholder="e.g. November member webinar" className="mt-1 w-full rounded-xl border border-line/20 bg-canvas px-3 py-2.5 text-ink"/></label>
          <label className="text-sm text-ink-2">Campaign type<select value={form.campaign_type} onChange={e=>update('campaign_type',e.target.value)} className="mt-1 w-full rounded-xl border border-line/20 bg-canvas px-3 py-2.5 text-ink">{TYPES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
          <label className="text-sm text-ink-2">Headline<input value={form.headline} onChange={e=>update('headline',e.target.value)} placeholder="Main message" className="mt-1 w-full rounded-xl border border-line/20 bg-canvas px-3 py-2.5 text-ink"/></label>
          <label className="text-sm text-ink-2 sm:col-span-2">Brief or key information<textarea value={form.details} onChange={e=>update('details',e.target.value)} rows={4} placeholder="What are we promoting? Who is it for? What should they know?" className="mt-1 w-full rounded-xl border border-line/20 bg-canvas px-3 py-2.5 text-ink"/></label>
          {form.campaign_type==='event'&&<><label className="text-sm text-ink-2">Event date<input type="date" value={form.event_date} onChange={e=>update('event_date',e.target.value)} className="mt-1 w-full rounded-xl border border-line/20 bg-canvas px-3 py-2.5 text-ink"/></label><label className="text-sm text-ink-2">Event time<input type="time" value={form.event_time} onChange={e=>update('event_time',e.target.value)} className="mt-1 w-full rounded-xl border border-line/20 bg-canvas px-3 py-2.5 text-ink"/></label><label className="text-sm text-ink-2 sm:col-span-2">Venue or online link<input value={form.venue} onChange={e=>update('venue',e.target.value)} placeholder="Add confirmed venue or meeting link" className="mt-1 w-full rounded-xl border border-line/20 bg-canvas px-3 py-2.5 text-ink"/></label></>}
          <label className="text-sm text-ink-2 sm:col-span-2">Call to action<input value={form.call_to_action} onChange={e=>update('call_to_action',e.target.value)} placeholder="Register now / Discover more / Join us" className="mt-1 w-full rounded-xl border border-line/20 bg-canvas px-3 py-2.5 text-ink"/></label>
        </div>
        <div className="mt-5 flex flex-wrap gap-3"><button onClick={()=>void generateWithAI()} disabled={generating} className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-canvas disabled:opacity-60"><Sparkles className="h-4 w-4"/>{generating ? "Writing…" : "Create with AI"}</button><button onClick={()=>setForm(autoWrite(form))} className="inline-flex items-center gap-2 rounded-xl border border-line/20 px-4 py-2.5 text-sm font-medium text-ink"><Sparkles className="h-4 w-4"/>Use quick template</button><button onClick={()=>void save()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl border border-line/20 px-4 py-2.5 text-sm font-medium text-ink"><Plus className="h-4 w-4"/>{saving?'Saving…':'Save draft'}</button><button onClick={()=>void copy(caption)} className="inline-flex items-center gap-2 rounded-xl border border-line/20 px-4 py-2.5 text-sm text-ink"><Copy className="h-4 w-4"/>Copy text</button></div>
        {error&&<p role="alert" className="mt-3 text-sm text-rose-400">{error}</p>}{notice&&<p role="status" className="mt-3 text-sm text-emerald-400">{notice}</p>}
      </div>
      <div className="rounded-2xl border border-line/15 bg-surface/[0.04] p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold text-ink">Finished flyer preview</h3><select value={format} onChange={e=>setFormat(e.target.value as typeof format)} className="rounded-lg border border-line/20 bg-canvas px-3 py-2 text-sm text-ink"><option value="portrait">Portrait flyer</option><option value="square">Square post</option><option value="story">Story / status</option></select></div>
        <div className="mx-auto max-h-[680px] overflow-auto rounded-xl bg-[#070b13] shadow-2xl" style={{maxWidth:format==='square'?'420px':'360px'}}><div dangerouslySetInnerHTML={{__html:svg}} /></div>
        <div className="mt-4 flex flex-wrap gap-3"><button onClick={download} className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-canvas"><Download className="h-4 w-4"/>Download flyer</button><button onClick={printPdf} className="inline-flex items-center gap-2 rounded-xl border border-line/20 px-4 py-2.5 text-sm text-ink"><Printer className="h-4 w-4"/>Save as PDF</button><a href="https://www.canva.com/d/R1ccVYq3_C7Kg3K" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-accent/30 px-4 py-2.5 text-sm text-accent"><ExternalLink className="h-4 w-4"/>Open Canva template</a></div>
        <p className="mt-3 text-xs leading-5 text-ink-2">Download a vector flyer directly, print to PDF, or import the SVG into Canva for further editing. Check all dates, prices, links and claims before publishing.</p>
      </div>
    </div>
    <div className="rounded-2xl border border-line/15 bg-surface/[0.04] p-5"><h3 className="mb-4 font-semibold text-ink">Saved campaigns</h3>{loading?<p className="text-sm text-ink-2">Loading campaigns…</p>:items.length===0?<p className="text-sm text-ink-2">No campaign drafts yet.</p>:<div className="space-y-3">{items.map(item=><div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line/10 p-3"><div><p className="font-medium text-ink">{item.title}</p><p className="text-xs text-ink-2">{item.campaign_type} · {new Date(item.created_at).toLocaleString()}</p></div><div className="flex gap-2"><button onClick={()=>void copy(item.caption)} aria-label="Copy campaign copy" className="rounded-lg border border-line/20 p-2 text-ink-2"><Copy className="h-4 w-4"/></button><button onClick={()=>void remove(item.id)} aria-label="Delete campaign" className="rounded-lg border border-line/20 p-2 text-rose-400"><Trash2 className="h-4 w-4"/></button></div></div>)}</div>}</div>
    <div className="flex items-start gap-2 text-xs text-ink-2"><CalendarDays className="mt-0.5 h-4 w-4 shrink-0"/>For events, provide the confirmed date, time and venue. The assistant never invents event details, prices or performance claims.</div>
  </section>;
}
