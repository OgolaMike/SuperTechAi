import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const clean = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
    const url = Deno.env.get('SUPABASE_URL') || '';
    const anon = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const openaiKey = Deno.env.get('OPENAI_API_KEY') || '';
    if (!token) return json({ error: 'Please sign in as an administrator.' }, 401);
    if (!openaiKey) return json({ error: 'AI artwork is not configured. Add OPENAI_API_KEY to Supabase Edge Function Secrets.' }, 503);
    if (!serviceKey) return json({ error: 'Secure image storage is not configured. The Supabase service-role secret is unavailable.' }, 503);

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: 'Bearer ' + token } },
      auth: { persistSession: false },
    });
    const { data: auth, error: authError } = await userClient.auth.getUser(token);
    if (authError || !auth.user) return json({ error: 'Your session has expired. Sign in again.' }, 401);
    const { data: admin, error: adminError } = await userClient.from('admin_users')
      .select('user_id').eq('user_id', auth.user.id).maybeSingle();
    if (adminError || !admin) return json({ error: 'Only SuperTech AI administrators can generate campaign artwork.' }, 403);

    const input = await req.json();
    const headline = clean(input.headline, 180);
    const details = clean(input.details, 900);
    const campaignType = clean(input.campaign_type, 40) || 'product';
    const format = ['portrait', 'square', 'story'].includes(input.format) ? input.format : 'portrait';
    if (!headline) return json({ error: 'Create the campaign headline before generating artwork.' }, 400);

    const prompt = [
      'Create an exceptionally polished, premium advertising background image for SuperTech AI, a trading intelligence and education platform.',
      'Visual identity: deep midnight navy and near-black, restrained metallic gold accents, electric cyan highlights, refined glass-like light, cinematic depth, subtle market-data geometry and elegant abstract financial chart motifs.',
      'Design quality: luxury technology brand campaign, sophisticated art direction, clean composition, high contrast, crisp details, premium commercial photography and 3D illustration hybrid.',
      'Composition: reserve a calm, dark, uncluttered central and upper area so real headline and campaign copy can be overlaid later. Place visual energy around the edges and lower corners. No logos, no typography, no letters, no numbers, no watermarks, no fake UI text.',
      'Avoid clutter, coins, money piles, rockets, bulls, bears, people, charts with readable labels, guaranteed-profit imagery, or exaggerated wealth promises.',
      'Campaign subject: ' + campaignType + '.',
      'Creative theme informed by this approved campaign headline: ' + headline + '.',
      details ? 'Context for visual mood only: ' + details : '',
      format === 'square' ? 'Square social post composition.' : format === 'story' ? 'Tall vertical story composition.' : 'Portrait flyer composition.',
    ].filter(Boolean).join(' ');

    const imageResponse = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + openaiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt,
        size: format === 'square' ? '1024x1024' : '1024x1536',
        quality: 'high',
        output_format: 'png',
      }),
    });
    if (!imageResponse.ok) {
      const detail = (await imageResponse.text()).slice(0, 500);
      console.error('OpenAI image generation error', imageResponse.status, detail);
      return json({ error: imageResponse.status === 429
        ? 'The image-generation limit has been reached. Please wait and try again.'
        : 'AI artwork could not be generated. Check the OpenAI account and image-generation access, then try again.' }, 502);
    }
    const generated = await imageResponse.json();
    const encoded = generated.data?.[0]?.b64_json;
    if (!encoded) return json({ error: 'The image service returned no artwork. Please try again.' }, 502);

    const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
    const storage = createClient(url, serviceKey, { auth: { persistSession: false } }).storage;
    const bucket = 'marketing-assets';
    const { data: existingBucket } = await storage.getBucket(bucket);
    if (!existingBucket) {
      const { error: bucketError } = await storage.createBucket(bucket, {
        public: true,
        fileSizeLimit: 15 * 1024 * 1024,
        allowedMimeTypes: ['image/png'],
      });
      if (bucketError && !String(bucketError.message).toLowerCase().includes('already exists')) {
        console.error('Marketing storage bucket error', bucketError.message);
        return json({ error: 'Secure campaign image storage could not be prepared.' }, 500);
      }
    }

    const path = auth.user.id + '/' + crypto.randomUUID() + '.png';
    const { error: uploadError } = await storage.from(bucket).upload(path, bytes, {
      contentType: 'image/png',
      cacheControl: '31536000',
      upsert: false,
    });
    if (uploadError) {
      console.error('Marketing artwork upload failed', uploadError.message);
      return json({ error: 'The artwork was generated but could not be saved. Please try again.' }, 500);
    }
    const { data: publicData } = storage.from(bucket).getPublicUrl(path);
    return json({ image_url: publicData.publicUrl, image_path: path, format, generated: true });
  } catch (error) {
    console.error('marketing-image failed', error);
    return json({ error: 'Artwork generation failed unexpectedly.' }, 500);
  }
});