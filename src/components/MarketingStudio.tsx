import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Copy, Download, Plus, Printer, Sparkles, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Campaign = {
  id: string; title: string; campaign_type: string; headline: string; details: string;
  event_date: string | null; event_time: string | null; venue: string | null;
  call_to_action: string; caption: string; creative_url: string | null; status: string; created_at: string;
};
const TYPES = [
  ['product', 'Product promotion'], ['event', 'Event / webinar'], ['offer', 'Membership offer'],
  ['announcement', 'Company announcement'], ['education', 'Academy / education'],
  ['community', 'Community update'], ['trade-review', 'Trade review'],
] as const;
type FormState = { title:string; campaign_type:string; headline:string; details:string; event_date:string; event_time:string; venue:string; call_to_action:string };
const EMPTY: FormState = { title:'', campaign_type:'product', headline:'', details:'', event_date:'', event_time:'', venue:'', call_to_action:'' };

function autoWrite(f: FormState): FormState {
  const presets: Record<string, {headline:string; details:string; cta:string; title:string}> = {
    product: { title:'SuperTech AI product campaign', headline:'See the market with greater clarity.', details:'Discover a smarter way to follow market signals, explore multiple markets and learn from clear trading insights with SuperTech AI.', cta:'Discover SuperTech AI' },
    event: { title:'SuperTech AI live event', headline:'You are invited.', details:'Join the SuperTech AI community for a focused session with practical insights, demonstrations and time for your questions. Add confirmed event details before sharing.', cta:'Reserve your place' },
    offer: { title:'SuperTech AI membership offer', headline:'Your next step starts here.', details:'Explore SuperTech AI membership and discover the tools, market insights and learning resources available to members. Confirm current price and offer terms before publishing.', cta:'Ask about membership' },
    announcement: { title:'SuperTech AI announcement', headline:'A new update from SuperTech AI.', details:'We are continually improving the SuperTech AI experience. Read the latest update and see what is new for our community.', cta:'Read the update' },
    education: { title:'SuperTech AI Academy', headline:'Learn. Understand. Improve.', details:'Build your market knowledge with learning sessions, selected trade breakdowns and clear explanations from the SuperTech AI Academy.', cta:'Explore the Academy' },
    community: { title:'SuperTech AI community update', headline:'Better insights. Stronger community.', details:'Connect with the SuperTech AI community, share ideas and keep learning together.', cta:'Join the community' },
    'trade-review': { title:'SuperTech AI trade breakdown', headline:'Understand the setup, not just the outcome.', details:'Explore a selected trade with its market context, entry, risk, targets and lessons. Past examples are educational and do not guarantee future results.', cta:'Explore the trade review' },
  };
  const p = presets[f.campaign_type] || presets.product;
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
  const dateLine = [f.event_date, f.event_time, f.venue].filter(Boolean).join(' • ');
  const titleY = format === 'story' ? 620 : format === 'square' ? 390 : 470;
  const detailY = titleY + titleLines.length*94 + 45;
  const detailSvg = detailLines.map((line,i)=>'<text x="88" y="'+(detailY+i*48)+'" fill="#d6deec" font-size="31" font-family="Arial,sans-serif">'+xml(line)+'</text>').join('');
  const titleSvg = titleLines.map((line,i)=>'<text x="88" y="'+(titleY+i*94)+'" fill="#ffffff" font-size="76" font-weight="700" font-family="Arial,sans-serif">'+xml(line)+'</text>').join('');
  const dateY = Math.min(detailY+detailLines.length*48+65,h-330);
  return '<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#070b13"/><stop offset="1" stop-color="#14243c"/></linearGradient><linearGradient id="line" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#19c7ff"/><stop offset="1" stop-color="#d7ad54"/></linearGradient><radialGradient id="glow"><stop stop-color="#1678b8" stop-opacity=".38"/><stop offset="1" stop-color="#1678b8" stop-opacity="0"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#bg)"/><circle cx="'+(w-70)+'" cy="210" r="390" fill="url(#glow)"/><path d="M0 '+(h*.78)+' L'+(w*.28)+' '+(h*.58)+' L'+(w*.46)+' '+(h*.68)+' L'+(w*.7)+' '+(h*.42)+' L'+w+' '+(h*.5)+'" fill="none" stroke="#1ba9df" stroke-opacity=".22" stroke-width="5"/><path d="M88 120 H'+(w-88)+'" stroke="url(#line)" stroke-width="7"/><text x="88" y="205" fill="#ffffff" font-size="46" font-weight="700" letter-spacing="8" font-family="Arial,sans-serif">SUPERTECH AI</text><text x="88" y="275" fill="#e4b95d" font-size="23" letter-spacing="6" font-family="Arial,sans-serif">TRADING INTELLIGENCE</text>'+titleSvg+detailSvg+(dateLine?'<text x="88" y="'+dateY+'" fill="#e4b95d" font-size="27" font-weight="700" font-family="Arial,sans-serif">'+xml(dateLine.slice(0,85))+'</text>':'')+'<rect x="88" y="'+(h-245)+'" width="'+(w-176)+'" height="105" rx="18" fill="url(#line)"/><text x="130" y="'+(h-178)+'" fill="#07111c" font-size="35" font-weight="700" font-family="Arial,sans-serif">'+xml((f.call_to_action||'DISCOVER SUPERTECH AI').toUpperCase().slice(0,34))+'</text><text x="88" y="'+(h-86)+'" fill="#ffffff" font-size="24" font-family="Arial,sans-serif">Hide the complexity. Deliver the intelligence.</text><text x="'+(w-88)+'" y="'+(h-86)+'" text-anchor="end" fill="#aab7c9" font-size="18" font-family="Arial,sans-serif">Trading involves risk.</text></svg>';
}

export function MarketingStudio() {
  const [items,setItems] = useState<Campaign[]>([]);
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [generating,setGenerating] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [form,setForm] = useState<FormState>(EMPTY);
  const [format,setFormat] = useState<'portrait'|'square'|'story'>('portrait');
  const [aiCaption,setAiCaption] = useState('');
  const [creativeUrl,setCreativeUrl] = useState('');
  const caption = useMemo(()=>aiCaption || makeCopy(form),[form,aiCaption]);
  const svg = useMemo(()=>posterSvg(form,format),[form,format]);

  async function load() {
    setLoading(true);
    const {data,error:loadError}=await supabase.from('marketing_campaigns').select('*').order('created_at',{ascending:false}).limit(50);
    if(loadError) setError(loadError.message); else setItems((data||[]) as Campaign[]);
    setLoading(false);
  }
  useEffect(()=>{void load();},[]);

  async function generateWithAI(automatic = false) {
    setGenerating(true); setError(''); setNotice('');
    const { data, error: aiError } = await supabase.functions.invoke('marketing-ai', {
      body: automatic ? { auto_mode:true } : form,
    });
    if (aiError) {
      let message = aiError.message || 'AI campaign generation failed.';
      try { const context = (aiError as any).context; if (context?.json) { const body = await context.json(); message = body.error || message; } } catch {}
      setError(message);
    } else if (data?.campaign) {
      setForm(current => ({ ...current, ...data.campaign }));
      setAiCaption(data.campaign.caption || '');
      const sources = data.sources_used || {};
      const used = Object.entries(sources).filter(([,count])=>Number(count)>0).map(([name,count])=>name.replaceAll('_',' ')+' '+count).join(', ');
      setNotice(automatic
        ? 'Flyer created from current SuperTech AI information.'+(used ? ' Sources: '+used+'.' : ' Using the evergreen product introduction.')
        : 'AI campaign created. Review the details, then download or save it.');
    } else setError(data?.error || 'AI returned no campaign. Please try again.');
    setGenerating(false);
  }

  async function generateArtwork() {
    if (!form.headline.trim()) { setError('Generate or enter a campaign headline first.'); return; }
    setGenerating(true); setError(''); setNotice('');
    const { data, error: imageError } = await supabase.functions.invoke('marketing-image', {
      body: { headline: form.headline, details: form.details, campaign_type: form.campaign_type, format },
    });
    if (imageError || !data?.image_url) {
      let message = data?.error || imageError?.message || 'AI artwork generation failed.';
      try { const context = (imageError as any)?.context; if (context?.json) { const body = await context.json(); message = body.error || message; } } catch {}
      setError(message);
    } else {
      setCreativeUrl(data.image_url);
      setNotice('Original AI artwork is ready. Your campaign wording is overlaid separately for clear, accurate text.');
    }
    setGenerating(false);
  }

  async function save() {
    if(!form.title.trim()||!form.headline.trim()){setError('Add a campaign name and headline before saving.');return;}
    setSaving(true);setError('');setNotice('');
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) { setError('Please sign in again before saving this campaign.'); setSaving(false); return; }
    const {data,error:saveError}=await supabase.from('marketing_campaigns').insert({
      user_id:authData.user.id,creative_url:creativeUrl||null,
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
  async function download() {
    const baseName=(form.title.trim()||'supertech-ai-campaign').toLowerCase().replace(/[^a-z0-9]+/g,'-');
    if (!creativeUrl) {
      const blob=new Blob([svg],{type:'image/svg+xml;charset=utf-8'});
      const url=URL.createObjectURL(blob); const a=document.createElement('a');
      a.href=url; a.download=baseName+'-'+format+'.svg'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      setNotice('Vector flyer downloaded. Generate AI artwork to create a finished PNG campaign image.'); return;
    }
    try {
      const image = new Image(); image.crossOrigin = 'anonymous';
      await new Promise<void>((resolve,reject)=>{ image.onload=()=>resolve(); image.onerror=()=>reject(new Error('Could not load the generated artwork for download.')); image.src=creativeUrl; });
      const [width,height] = format==='square' ? [1080,1080] : format==='story' ? [1080,1920] : [1080,1350];
      const canvas=document.createElement('canvas'); canvas.width=width; canvas.height=height;
      const ctx=canvas.getContext('2d'); if(!ctx) throw new Error('Image export is not available in this browser.');
      const scale=Math.max(width/image.width,height/image.height); const dw=image.width*scale; const dh=image.height*scale;
      ctx.drawImage(image,(width-dw)/2,(height-dh)/2,dw,dh);
      const shade=ctx.createLinearGradient(0,0,0,height); shade.addColorStop(0,'rgba(3,8,18,.72)'); shade.addColorStop(.48,'rgba(3,8,18,.18)'); shade.addColorStop(1,'rgba(3,8,18,.82)'); ctx.fillStyle=shade; ctx.fillRect(0,0,width,height);
      const margin=88; ctx.fillStyle='#ffffff'; ctx.font='700 44px Arial'; ctx.fillText('SUPERTECH AI',margin,145);
      ctx.fillStyle='#e4b95d'; ctx.font='600 22px Arial'; ctx.fillText('TRADING INTELLIGENCE',margin,190);
      const wrapText=(text:string,maxWidth:number,font:string)=>{ctx.font=font;const lines:string[]=[];let line='';for(const word of text.split(/\s+/)){const test=(line+' '+word).trim();if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=word;}else line=test;}if(line)lines.push(line);return lines;};
      let y=format==='story'?650:format==='square'?390:470;
      ctx.fillStyle='#fff';ctx.font='700 74px Arial';
      for(const line of wrapText(form.headline||'Hide the complexity. Deliver the intelligence.',width-margin*2,'700 74px Arial').slice(0,4)){ctx.fillText(line,margin,y);y+=88;}
      y+=30;ctx.fillStyle='#d6deec';ctx.font='32px Arial';
      for(const line of wrapText(form.details||'Clear market insights and learning resources.',width-margin*2,'32px Arial').slice(0,6)){ctx.fillText(line,margin,y);y+=48;}
      const eventLine=[form.event_date,form.event_time,form.venue].filter(Boolean).join(' • ');
      if(eventLine){y+=28;ctx.fillStyle='#e4b95d';ctx.font='700 26px Arial';ctx.fillText(eventLine.slice(0,70),margin,Math.min(y,height-340));}
      const ctaY=height-245;ctx.fillStyle='#d7ad54';ctx.fillRect(margin,ctaY,width-margin*2,105);ctx.fillStyle='#07111c';ctx.font='700 34px Arial';ctx.fillText((form.call_to_action||'DISCOVER SUPERTECH AI').toUpperCase().slice(0,34),margin+36,ctaY+66);
      ctx.fillStyle='#fff';ctx.font='24px Arial';ctx.fillText('Hide the complexity. Deliver the intelligence.',margin,height-86);
      const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('PNG export failed.')),'image/png'));
      const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=baseName+'-'+format+'.png';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
      setNotice('Finished AI-designed flyer downloaded as a high-resolution PNG.');
    } catch(error) { setError(error instanceof Error?error.message:'Could not export the AI flyer.'); }
  }
  function printPdf() {
    const w=window.open('','_blank','noopener,noreferrer');
    if(!w){setError('Allow pop-ups to create a PDF.');return;}
    const content=creativeUrl
      ? '<div style="position:relative;width:100%;aspect-ratio:'+(format==='square'?'1/1':format==='story'?'9/16':'4/5')+';overflow:hidden;color:white;font-family:Arial,sans-serif;background:#07111c"><img src="'+creativeUrl+'" style="position:absolute;width:100%;height:100%;object-fit:cover;inset:0"><div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(3,8,18,.72),rgba(3,8,18,.18) 48%,rgba(3,8,18,.82));padding:8%;display:flex;flex-direction:column;justify-content:space-between"><div><b style="font-size:24px;letter-spacing:5px">SUPERTECH AI</b><p style="color:#e4b95d;letter-spacing:3px">TRADING INTELLIGENCE</p><h1 style="font-size:clamp(30px,6vw,68px);line-height:1.08">'+xml(form.headline)+'</h1><p style="font-size:22px;line-height:1.45">'+xml(form.details)+'</p></div><div><div style="background:#d7ad54;color:#07111c;padding:22px;font-weight:bold">'+xml(form.call_to_action.toUpperCase())+'</div><p>Hide the complexity. Deliver the intelligence.</p></div></div></div>'
      : svg;
    w.document.write('<!doctype html><html><head><title>SuperTech AI Flyer</title><style>@page{size:auto;margin:0}html,body{margin:0;padding:0}svg{display:block;width:100%;height:auto;max-height:100vh;object-fit:contain}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}</style></head><body>'+content+'</body></html>');
    w.document.close();w.focus();w.print();
  }
  const update=(key:keyof FormState,value:string)=>{setAiCaption('');setForm(current=>({...current,[key]:value}));};

  return <section className="mt-8 space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Admin workspace</p><h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Marketing Studio</h2><p className="mt-2 max-w-2xl text-sm text-ink-2">Create ready-to-publish campaign copy and premium branded flyers using current SuperTech AI information.</p></div>
      <span className="rounded-full border border-accent/30 px-3 py-1.5 text-xs font-medium text-accent">Automatic flyer design</span>
    </div>
    <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
      <div className="rounded-2xl border border-line/15 bg-surface/[0.04] p-5">
        <div className="mb-5 flex items-center gap-2"><Sparkles className="h-5 w-5 text-accent"/><h3 className="font-semibold text-ink">Campaign assistant</h3></div>
        <div className="mb-5 rounded-xl border border-accent/25 bg-accent/[0.06] p-4">
          <p className="font-semibold text-ink">Create a flyer automatically</p>
          <p className="mt-1 text-sm text-ink-2">No brief or manual details needed. AI checks published announcements, Academy lessons and published trade reviews, then creates the strongest current campaign.</p>
          <button onClick={()=>void generateWithAI(true)} disabled={generating} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-canvas disabled:opacity-60"><Sparkles className="h-4 w-4"/>{generating?'Creating flyer…':'Create flyer automatically'}</button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm text-ink-2 sm:col-span-2">Campaign name<input value={form.title} onChange={e=>update('title',e.target.value)} placeholder="e.g. November member webinar" className="mt-1 w-full rounded-xl border border-line/20 bg-canvas px-3 py-2.5 text-ink"/></label>
          <label className="text-sm text-ink-2">Campaign type<select value={form.campaign_type} onChange={e=>update('campaign_type',e.target.value)} className="mt-1 w-full rounded-xl border border-line/20 bg-canvas px-3 py-2.5 text-ink">{TYPES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
          <label className="text-sm text-ink-2">Headline<input value={form.headline} onChange={e=>update('headline',e.target.value)} placeholder="Main message" className="mt-1 w-full rounded-xl border border-line/20 bg-canvas px-3 py-2.5 text-ink"/></label>
          <label className="text-sm text-ink-2 sm:col-span-2">Brief or key information<textarea value={form.details} onChange={e=>update('details',e.target.value)} rows={4} placeholder="Optional: add specific campaign details" className="mt-1 w-full rounded-xl border border-line/20 bg-canvas px-3 py-2.5 text-ink"/></label>
          {form.campaign_type==='event'&&<><label className="text-sm text-ink-2">Event date<input type="date" value={form.event_date} onChange={e=>update('event_date',e.target.value)} className="mt-1 w-full rounded-xl border border-line/20 bg-canvas px-3 py-2.5 text-ink"/></label><label className="text-sm text-ink-2">Event time<input type="time" value={form.event_time} onChange={e=>update('event_time',e.target.value)} className="mt-1 w-full rounded-xl border border-line/20 bg-canvas px-3 py-2.5 text-ink"/></label><label className="text-sm text-ink-2 sm:col-span-2">Venue or online link<input value={form.venue} onChange={e=>update('venue',e.target.value)} placeholder="Confirmed venue or meeting link" className="mt-1 w-full rounded-xl border border-line/20 bg-canvas px-3 py-2.5 text-ink"/></label></>}
          <label className="text-sm text-ink-2 sm:col-span-2">Call to action<input value={form.call_to_action} onChange={e=>update('call_to_action',e.target.value)} placeholder="Register now / Discover more / Join us" className="mt-1 w-full rounded-xl border border-line/20 bg-canvas px-3 py-2.5 text-ink"/></label>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button onClick={()=>void generateWithAI(false)} disabled={generating} className="inline-flex items-center gap-2 rounded-xl border border-accent/30 px-4 py-2.5 text-sm font-semibold text-accent disabled:opacity-60"><Sparkles className="h-4 w-4"/>{generating?'Writing…':'Create with AI'}</button>
          <button onClick={()=>{setAiCaption('');setForm(autoWrite(form));}} className="inline-flex items-center gap-2 rounded-xl border border-line/20 px-4 py-2.5 text-sm font-medium text-ink"><Sparkles className="h-4 w-4"/>Use quick template</button>
          <button onClick={()=>void save()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl border border-line/20 px-4 py-2.5 text-sm font-medium text-ink"><Plus className="h-4 w-4"/>{saving?'Saving…':'Save draft'}</button>
          <button onClick={()=>void copy(caption)} className="inline-flex items-center gap-2 rounded-xl border border-line/20 px-4 py-2.5 text-sm text-ink"><Copy className="h-4 w-4"/>Copy text</button>
        </div>
        {error&&<p role="alert" className="mt-3 text-sm text-rose-400">{error}</p>}
        {notice&&<p role="status" className="mt-3 text-sm text-emerald-400">{notice}</p>}
      </div>
      <div className="rounded-2xl border border-line/15 bg-surface/[0.04] p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold text-ink">Finished flyer preview</h3><select value={format} onChange={e=>setFormat(e.target.value as typeof format)} className="rounded-lg border border-line/20 bg-canvas px-3 py-2 text-sm text-ink"><option value="portrait">Portrait flyer</option><option value="square">Square post</option><option value="story">Story / status</option></select></div>
        <div className="mx-auto max-h-[680px] overflow-auto rounded-xl bg-[#070b13] shadow-2xl" style={{maxWidth:format==='square'?'420px':'360px'}}>
          {creativeUrl ? <div className="relative flex flex-col justify-between overflow-hidden p-7 text-white" style={{aspectRatio:format==='square'?'1 / 1':format==='story'?'9 / 16':'4 / 5',minHeight:format==='story'?'620px':'480px'}}>
            <img src={creativeUrl} alt="AI-generated SuperTech AI campaign artwork" className="absolute inset-0 h-full w-full object-cover"/><div className="absolute inset-0 bg-gradient-to-b from-[#030812]/75 via-[#030812]/20 to-[#030812]/85"/>
            <div className="relative"><p className="text-xl font-bold tracking-[0.25em]">SUPERTECH AI</p><p className="mt-2 text-[10px] font-semibold tracking-[0.28em] text-[#e4b95d]">TRADING INTELLIGENCE</p><h4 className="mt-12 text-3xl font-bold leading-tight sm:text-4xl">{form.headline || 'Hide the complexity. Deliver the intelligence.'}</h4><p className="mt-5 text-sm leading-relaxed text-slate-200">{form.details}</p>{(form.event_date||form.event_time||form.venue)&&<p className="mt-5 text-xs font-semibold text-[#e4b95d]">{[form.event_date,form.event_time,form.venue].filter(Boolean).join(' • ')}</p>}</div>
            <div className="relative"><div className="rounded-xl bg-gradient-to-r from-[#19c7ff] to-[#d7ad54] px-4 py-4 text-center text-sm font-extrabold uppercase tracking-wide text-[#07111c]">{form.call_to_action || 'Discover SuperTech AI'}</div><p className="mt-4 text-[10px] text-white">Hide the complexity. Deliver the intelligence.</p><p className="mt-1 text-[9px] text-slate-300">Trading involves risk. No profits are guaranteed.</p></div>
          </div> : <div dangerouslySetInnerHTML={{__html:svg}} />}
        </div>
        <div className="mt-4 flex flex-wrap gap-3"><button onClick={()=>void generateArtwork()} disabled={generating} className="inline-flex items-center gap-2 rounded-xl border border-accent/30 px-4 py-2.5 text-sm font-semibold text-accent disabled:opacity-60"><Sparkles className="h-4 w-4"/>{generating?'Creating artwork…':creativeUrl?'Regenerate AI artwork':'Generate AI artwork'}</button><button onClick={()=>void download()} className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-canvas"><Download className="h-4 w-4"/>Download PNG</button><button onClick={printPdf} className="inline-flex items-center gap-2 rounded-xl border border-line/20 px-4 py-2.5 text-sm text-ink"><Printer className="h-4 w-4"/>Save as PDF</button></div>
        <p className="mt-3 text-xs leading-5 text-ink-2">AI creates the original visual artwork; SuperTech AI places the real campaign wording over it so headlines, dates and calls to action remain accurate. Check details before publishing.</p>
      </div>
    </div>
    <div className="rounded-2xl border border-line/15 bg-surface/[0.04] p-5"><h3 className="mb-4 font-semibold text-ink">Saved campaigns</h3>{loading?<p className="text-sm text-ink-2">Loading campaigns…</p>:items.length===0?<p className="text-sm text-ink-2">No campaign drafts yet.</p>:<div className="space-y-3">{items.map(item=><div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line/10 p-3">{item.creative_url&&<img src={item.creative_url} alt="Saved campaign artwork" className="h-14 w-14 rounded-lg object-cover"/>}<div className="min-w-0 flex-1"><p className="font-medium text-ink">{item.title}</p><p className="text-xs text-ink-2">{item.campaign_type} · {new Date(item.created_at).toLocaleString()}</p></div><div className="flex gap-2">{item.creative_url&&<button onClick={()=>{setForm({title:item.title,campaign_type:item.campaign_type,headline:item.headline,details:item.details,event_date:item.event_date||'',event_time:item.event_time||'',venue:item.venue||'',call_to_action:item.call_to_action});setAiCaption(item.caption);setCreativeUrl(item.creative_url||'');setNotice('Saved campaign loaded into the studio.');}} className="rounded-lg border border-accent/30 px-3 py-2 text-xs text-accent">Open</button>}<button onClick={()=>void copy(item.caption)} aria-label="Copy campaign copy" className="rounded-lg border border-line/20 p-2 text-ink-2"><Copy className="h-4 w-4"/></button><button onClick={()=>void remove(item.id)} aria-label="Delete campaign" className="rounded-lg border border-line/20 p-2 text-rose-400"><Trash2 className="h-4 w-4"/></button></div></div>)}</div>}</div>
    <div className="flex items-start gap-2 text-xs text-ink-2"><CalendarDays className="mt-0.5 h-4 w-4 shrink-0"/>Automatic campaigns use published information only. Unconfirmed dates, prices, venues and performance claims are never invented.</div>
  </section>;
}
