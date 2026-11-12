import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const url = Deno.env.get("SUPABASE_URL")!;
const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const openaiKey = Deno.env.get("OPENAI_API_KEY")!;
const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

async function authenticate(req: Request) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { response: json({ error: "Please sign in first." }, 401) };
  const client = createClient(url, anon, {
    global: { headers: { Authorization: "Bearer " + token } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return { response: json({ error: "Your session has expired. Sign in again." }, 401) };
  const user = data.user;
  const [{ data: admin, error: adminError }, { data: member, error: memberError }] = await Promise.all([
    db.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle(),
    db.from("member_access").select("user_id").eq("user_id", user.id).maybeSingle(),
  ]);
  if (adminError || memberError) throw adminError || memberError;
  return { user, isAdmin: !!admin, isMember: !!member };
}

async function askOpenAI(system: string, payload: unknown, jsonMode = false) {
  if (!openaiKey) throw new Error("AI is not configured. Add OPENAI_API_KEY to Supabase Edge Function Secrets.");
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer " + openaiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      temperature: 0.45,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(payload) },
      ],
    }),
  });
  if (!response.ok) {
    console.error("OpenAI request failed:", response.status, (await response.text()).slice(0, 300));
    throw new Error("AI could not complete that request. Please try again.");
  }
  const data = await response.json();
  const result = data.choices?.[0]?.message?.content;
  if (!result) throw new Error("AI returned an empty response.");
  return result as string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  try {
    const auth = await authenticate(req);
    if (auth.response) return auth.response;
    const { user, isAdmin, isMember } = auth;
    const body = await req.json().catch(() => ({}));
    const action = clean(body.action, 40);

    if (action === "generate-lesson") {
      if (!isAdmin) return json({ error: "Only Academy administrators can generate and publish lessons." }, 403);
      const topic = clean(body.topic, 240);
      const category = clean(body.category || "Trading foundations", 80);
      const level = clean(body.level || "Beginner", 30);
      if (topic.length < 4) return json({ error: "Enter a lesson topic." }, 400);
      const raw = await askOpenAI(
        "You are the SuperTech AI Academy's senior educator. Write an original, accurate, beginner-friendly trading education lesson in clear English. Never promise profits, invent platform features, or present hypothetical examples as real trades. Return JSON with keys: title, summary, objective, steps (4-7 strings), narration, visual_prompt, quiz (question, answers array of 3 strings, correct integer 0-2, explanation). Include risk awareness. Do not provide personalized financial advice.",
        { topic, category, level, brand: "SuperTech AI" },
        true,
      );
      const content = JSON.parse(raw);
      if (!content.title || !content.summary || !content.objective || !Array.isArray(content.steps) ||
          !content.quiz?.question || !Array.isArray(content.quiz?.answers) ||
          !Number.isInteger(content.quiz?.correct) || content.quiz.correct < 0 || content.quiz.correct > 2) {
        return json({ error: "AI returned an incomplete lesson. Please try again." }, 502);
      }
      const slugBase = clean(content.title, 90).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "ai-lesson";
      const slug = slugBase + "-" + crypto.randomUUID().slice(0, 8);
      const { data: saved, error } = await db.from("academy_ai_lessons").insert({
        slug, title: clean(content.title, 160), category, level,
        duration_minutes: Math.max(1, Math.min(90, Math.ceil((String(content.narration || "").split(/\s+/).length / 130) + 2))),
        content, status: "published", model: "gpt-4.1-mini",
        generated_by: user.id, published_at: new Date().toISOString(),
      }).select("id,slug,title,category,level,duration_minutes,content,status,created_at").single();
      if (error) throw error;
      return json({ lesson: saved, message: "AI lesson generated and published." }, 201);
    }

    if (action === "generate-discussion") {
      if (!isAdmin) return json({ error: "Only Academy administrators can publish AI discussion topics." }, 403);
      const topic = clean(body.topic, 240);
      const category = clean(body.category || "Trading practice", 80);
      if (topic.length < 4) return json({ error: "Enter a discussion topic." }, 400);
      const raw = await askOpenAI(
        "You are the SuperTech AI Academy discussion facilitator. Create a useful AI-led discussion for traders at the requested level. Use simple English, encourage evidence-based reasoning and risk awareness, and never invent real trade outcomes or promise profits. Return JSON with title, discussion_prompt, context, talking_points (3-5 strings), follow_up_questions (2-4 strings).",
        { topic, category, brand: "SuperTech AI" },
        true,
      );
      const content = JSON.parse(raw);
      if (!content.title || !content.discussion_prompt || !content.context ||
          !Array.isArray(content.talking_points) || !Array.isArray(content.follow_up_questions)) {
        return json({ error: "AI returned an incomplete discussion. Please try again." }, 502);
      }
      const { data: saved, error } = await db.from("academy_ai_discussion_topics").insert({
        title: clean(content.title, 180), category,
        discussion_prompt: clean(content.discussion_prompt, 1600),
        context: clean(content.context, 4000),
        talking_points: content.talking_points.slice(0, 5).map((x: unknown) => clean(x, 500)),
        follow_up_questions: content.follow_up_questions.slice(0, 4).map((x: unknown) => clean(x, 500)),
        status: "published", model: "gpt-4.1-mini", generated_by: user.id,
        published_at: new Date().toISOString(),
      }).select("id,title,category,discussion_prompt,context,talking_points,follow_up_questions,status,created_at").single();
      if (error) throw error;
      return json({ discussion: saved, message: "AI discussion published." }, 201);
    }

    if (action === "list-discussions") {
      if (!isMember && !isAdmin) return json({ error: "An approved Academy membership is required." }, 403);
      let query = db.from("academy_ai_discussion_topics")
        .select("id,title,category,discussion_prompt,context,talking_points,follow_up_questions,status,created_at")
        .order("created_at", { ascending: false }).limit(50);
      if (!isAdmin) query = query.eq("status", "published");
      const { data, error } = await query;
      if (error) throw error;
      return json({ discussions: data || [] });
    }

    if (action === "ask") {
      if (!isMember && !isAdmin) return json({ error: "An approved Academy membership is required." }, 403);
      const question = clean(body.question, 1600);
      const lessonId = clean(body.lessonId, 80);
      if (question.length < 2) return json({ error: "Write a question for your AI tutor." }, 400);
      let lessonContext: unknown = null;
      if (lessonId) {
        const { data: lesson, error } = await db.from("academy_ai_lessons")
          .select("title,category,level,content").eq("id", lessonId).eq("status", "published").maybeSingle();
        if (error) throw error;
        lessonContext = lesson;
      }
      const answer = await askOpenAI(
        "You are the SuperTech AI Academy tutor. Answer clearly and patiently in simple English. Use the supplied lesson only as educational context. If a question asks for a real trade result, do not invent one; say that only verified completed executions can be discussed. Distinguish general education from financial advice. Never promise profits or give fabricated prices, entries, exits, returns or win rates. Keep answers practical and concise.",
        { question, lesson: lessonContext },
      );
      const { data: saved, error } = await db.from("academy_ai_discussions").insert({
        user_id: user.id, lesson_id: lessonId || null, question, ai_response: answer, model: "gpt-4.1-mini",
      }).select("id,question,ai_response,created_at").single();
      if (error) throw error;
      return json({ discussion: saved });
    }

    if (action === "list-lessons") {
      if (!isMember && !isAdmin) return json({ error: "An approved Academy membership is required." }, 403);
      let query = db.from("academy_ai_lessons")
        .select("id,slug,title,category,level,duration_minutes,content,status,created_at")
        .order("created_at", { ascending: false }).limit(100);
      if (!isAdmin) query = query.eq("status", "published");
      const { data, error } = await query;
      if (error) throw error;
      return json({ lessons: data || [] });
    }

    if (action === "trade-status") {
      if (!isAdmin) return json({ error: "Administrator access required." }, 403);
      const [ctrader, futures, spot, mt5] = await Promise.all([
        db.from("ctrader_positions").select("id", { count: "exact", head: true }).not("closed_at", "is", null),
        db.from("binance_futures_positions").select("id", { count: "exact", head: true }).not("closed_at", "is", null),
        db.from("binance_spot_positions").select("id", { count: "exact", head: true }).not("closed_at", "is", null),
        db.from("mt5_trade_inventory").select("id", { count: "exact", head: true }).eq("object_type", "deal"),
      ]);
      const errors = [ctrader.error, futures.error, spot.error, mt5.error].filter(Boolean);
      if (errors.length) throw errors[0];
      return json({
        verified_closed_trades_available: (ctrader.count || 0) + (futures.count || 0) + (spot.count || 0) + (mt5.count || 0),
        sources: { ctrader: ctrader.count || 0, binance_futures: futures.count || 0, binance_spot: spot.count || 0, mt5_deals: mt5.count || 0 },
        policy: "Only broker/exchange execution records can become Academy trade case studies. No manual or simulated results are accepted.",
      });
    }

    return json({ error: "Unknown Academy AI action." }, 400);
  } catch (error) {
    console.error("academy-ai error:", error instanceof Error ? error.message : "unknown");
    return json({ error: error instanceof Error ? error.message : "Academy AI request failed." }, 500);
  }
});
