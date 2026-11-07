import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const adminClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

function findString(value: unknown, keys: string[]): string | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  for (const key of keys) if (typeof obj[key] === "string" && obj[key]) return obj[key] as string;
  for (const child of Object.values(obj)) { const found = findString(child, keys); if (found) return found; }
  return null;
}
async function heygen(path: string, init: RequestInit = {}) {
  const key = Deno.env.get("HEYGEN_API_KEY");
  if (!key) throw new Error("HeyGen is not configured. Add HEYGEN_API_KEY to Supabase Edge Function secrets.");
  const response = await fetch("https://api.heygen.com" + path, {
    ...init,
    headers: { "X-Api-Key": key, "Content-Type": "application/json", Accept: "application/json", ...(init.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`HeyGen returned ${response.status}: ${findString(payload, ["message", "error", "detail"]) || "Request failed"}`);
  return payload;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Sign in to use Academy videos." }, 401);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "Your session is invalid. Please sign in again." }, 401);
    const userId = authData.user.id;
    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (action === "list") {
      const { data, error } = await adminClient.from("academy_videos")
        .select("id,lesson_id,lesson_title,status,video_url,thumbnail_url,created_at")
        .eq("status", "completed").order("created_at", { ascending: false });
      if (error) throw error;
      return json({ videos: data || [] });
    }

    const { data: adminRow, error: adminError } = await adminClient.from("admin_users")
      .select("user_id").eq("user_id", userId).maybeSingle();
    if (adminError) throw adminError;
    if (!adminRow) return json({ error: "Only SuperTechAi administrators can manage Academy video production." }, 403);

    if (action === "jobs") {
      const { data, error } = await adminClient.from("academy_videos")
        .select("id,lesson_id,lesson_title,status,video_url,thumbnail_url,failure_reason,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return json({ videos: data || [] });
    }

    if (action === "health") {
      const profile = await heygen("/v3/users/me");
      return json({ configured: true, provider: "HeyGen", account: findString(profile, ["email", "name"]) });
    }

    if (action === "create") {
      const lessonId = String(body.lessonId || "").slice(0, 80);
      const lessonTitle = String(body.lessonTitle || "").slice(0, 160);
      const prompt = String(body.prompt || "");
      if (!lessonId || !lessonTitle || prompt.length < 80 || prompt.length > 10000) {
        return json({ error: "A lesson title and a production brief of 80–10,000 characters are required." }, 400);
      }
      const providerPayload = await heygen("/v3/video-agents", {
        method: "POST",
        body: JSON.stringify({ prompt, mode: "generate", orientation: "landscape", auto_proceed: true }),
      });
      const sessionId = findString(providerPayload, ["session_id"]);
      if (!sessionId) {
        console.error("HeyGen response missing session_id");
        return json({ error: "HeyGen returned an unexpected response. Check the HeyGen dashboard before retrying." }, 502);
      }
      const { data: saved, error: saveError } = await adminClient.from("academy_videos").insert({
        lesson_id: lessonId, lesson_title: lessonTitle, provider_session_id: sessionId,
        status: "pending", created_by: userId,
      }).select("id,lesson_id,lesson_title,status,created_at").single();
      if (saveError) throw saveError;
      return json({ video: saved, message: "Video generation has started." }, 202);
    }

    if (action === "refresh") {
      const recordId = String(body.videoId || "");
      if (!recordId) return json({ error: "A video record ID is required." }, 400);
      const { data: record, error: recordError } = await adminClient.from("academy_videos")
        .select("*").eq("id", recordId).maybeSingle();
      if (recordError) throw recordError;
      if (!record) return json({ error: "Video job not found." }, 404);
      if (record.status === "completed" || record.status === "failed") return json({ video: record });

      const sessionPayload = await heygen("/v3/video-agents/sessions/" + encodeURIComponent(record.provider_session_id));
      const videoId = findString(sessionPayload, ["video_id"]);
      let providerStatus = findString(sessionPayload, ["status"]) || "processing";
      let videoUrl: string | null = null;
      let thumbnailUrl: string | null = null;
      let failureReason: string | null = null;
      if (videoId) {
        const videoPayload = await heygen("/v3/videos/" + encodeURIComponent(videoId));
        providerStatus = findString(videoPayload, ["status"]) || providerStatus;
        videoUrl = findString(videoPayload, ["video_url"]);
        thumbnailUrl = findString(videoPayload, ["thumbnail_url"]);
        failureReason = findString(videoPayload, ["error", "failure_reason"]);
      }
      const normalized = providerStatus.toLowerCase();
      const finalStatus = videoUrl || normalized === "completed" ? "completed"
        : normalized === "failed" || normalized === "error" ? "failed" : "processing";
      const patch: Record<string, unknown> = {
        provider_video_id: videoId || record.provider_video_id, status: finalStatus, updated_at: new Date().toISOString(),
      };
      if (videoUrl) patch.video_url = videoUrl;
      if (thumbnailUrl) patch.thumbnail_url = thumbnailUrl;
      if (failureReason) patch.failure_reason = failureReason.slice(0, 1000);
      const { data: updated, error: updateError } = await adminClient.from("academy_videos")
        .update(patch).eq("id", recordId)
        .select("id,lesson_id,lesson_title,status,video_url,thumbnail_url,failure_reason,created_at").single();
      if (updateError) throw updateError;
      return json({ video: updated });
    }
    return json({ error: "Unknown action." }, 400);
  } catch (error) {
    console.error("academy-videos error:", error instanceof Error ? error.message : "unknown");
    return json({ error: error instanceof Error ? error.message : "Academy video service failed." }, 500);
  }
});
