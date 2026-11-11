import { createClient } from 'npm:@supabase/supabase-js@2';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
    const url = Deno.env.get('SUPABASE_URL') || '';
    const anon = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const key = Deno.env.get('OPENAI_API_KEY') || '';
    if (!token) return json({ error: 'Please sign in as an administrator.' }, 401);
    if (!key) return json({ error: 'AI is not configured. Add OPENAI_API_KEY to Supabase Edge Function Secrets.' }, 503);
    const client = createClient(url, anon, { global: { headers: { Authorization: 'Bearer ' + token } }, auth: { persistSession: false } });
    const { data: auth, error: authError } = await client.auth.getUser(token);
    if (authError || !auth.user) return json({ error: 'Your session has expired. Sign in again.' }, 401);
    const { data: admin, error: adminError } = await client.from('admin_users').select('user_id').eq('user_id', auth.user.id).maybeSingle();
    if (adminError || !admin) return json({ error: 'Only SuperTech AI administrators can create campaigns.' }, 403);
    const input = await req.json();
    const types = ['product','event','offer','announcement','education','community','trade-review'];
    if (!types.includes(String(input.campaign_type))) return json({ error: 'Unsupported campaign type.' }, 400);
    const brief = { campaign_type: String(input.campaign_type), campaign_name: String(input.title || '').slice(0,180), brief: String(input.details || '').slice(0,3000), confirmed_headline: String(input.headline || '').slice(0,240), confirmed_event_date: String(input.event_date || '').slice(0,40), confirmed_event_time: String(input.event_time || '').slice(0,40), confirmed_venue: String(input.venue || '').slice(0,300), requested_action: String(input.call_to_action || '').slice(0,160) };
    const system = 'You are the senior marketing copywriter for SuperTech AI, a premium trading-intelligence and education platform. Write persuasive, simple, clear English. Brand line: Hide the complexity. Deliver the intelligence. Never promise profits or guaranteed returns. Never invent prices, dates, times, venues, URLs, features, testimonials, statistics or claims. Use only supplied facts. For trade reviews, say past examples do not predict future results. Return only JSON with string keys title, headline, details, call_to_action, caption. Caption is ready-to-post, with restrained hashtags, brand line and concise trading-risk disclaimer. Keep headline under 12 words and flyer details concise.';
    const response = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-4.1-mini', temperature: 0.7, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(brief) }] }) });
    if (!response.ok) { console.error('OpenAI error', response.status, (await response.text()).slice(0,400)); return json({ error: 'AI could not complete this campaign. Please try again.' }, 502); }
    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    if (!content) return json({ error: 'AI returned an empty campaign.' }, 502);
    const generated = JSON.parse(content);
    const clean = (v: unknown, max: number) => String(v || '').trim().slice(0,max);
    return json({ campaign: { title: clean(generated.title,180), headline: clean(generated.headline,240), details: clean(generated.details,1600), call_to_action: clean(generated.call_to_action,160), caption: clean(generated.caption,4000) } });
  } catch (error) { console.error('marketing-ai failed', error); return json({ error: 'Campaign generation failed unexpectedly.' }, 500); }
});