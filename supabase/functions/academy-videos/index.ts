import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const adminClient = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const DEMO_EMAIL = "supertechai.254@gmail.com";
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;
const MAX_SCREENSHOTS = 12;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  const uploaded: string[] = [];
  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Sign in with the Academy demo account first." }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: "Bearer " + token } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user) return json({ error: "The demo session is invalid. Sign in again." }, 401);
    if ((user.email || "").toLowerCase() !== DEMO_EMAIL) {
      return json({ error: "Only the restricted SuperTechAi demo account can publish Academy walkthroughs." }, 403);
    }

    const [{ data: member, error: memberError }, { data: adminRow, error: adminError }] = await Promise.all([
      adminClient.from("member_access").select("user_id").eq("user_id", user.id).maybeSingle(),
      adminClient.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle(),
    ]);
    if (memberError) throw memberError;
    if (adminError) throw adminError;
    if (!member || adminRow) return json({ error: "The publishing account must be an approved non-admin demo member." }, 403);

    if (!req.headers.get("content-type")?.toLowerCase().includes("multipart/form-data")) {
      return json({ error: "Send the lesson as multipart form data." }, 415);
    }
    const form = await req.formData();
    const lessonId = String(form.get("lesson_id") || "");
    const lessonTitle = String(form.get("lesson_title") || "").slice(0, 160);
    const providerSessionId = String(form.get("provider_session_id") || "").slice(0, 160);
    const screenshotMeta = JSON.parse(String(form.get("screenshots_meta") || "[]"));
    const video = form.get("video");

    if (!/^[a-z0-9-]{1,80}$/.test(lessonId) || !lessonTitle || !providerSessionId) {
      return json({ error: "A valid lesson ID, title and publishing run ID are required." }, 400);
    }
    if (!Array.isArray(screenshotMeta) || screenshotMeta.length < 1 || screenshotMeta.length > MAX_SCREENSHOTS) {
      return json({ error: "Each lesson must include between 1 and 12 real screen screenshots." }, 400);
    }
    if (!(video instanceof File) || video.size < 100_000 || video.size > MAX_VIDEO_BYTES || video.type !== "video/mp4") {
      return json({ error: "The lesson video must be an MP4 file under 100 MB." }, 400);
    }

    const runFolder = Date.now().toString() + "-" + crypto.randomUUID();
    const basePath = "lessons/" + lessonId + "/" + runFolder;
    const screenshotRows: Array<{ path: string; captured_at: string; caption: string }> = [];

    for (let index = 0; index < screenshotMeta.length; index += 1) {
      const file = form.get("screenshot_" + index);
      if (!(file instanceof File) || file.size < 1000 || file.size > MAX_SCREENSHOT_BYTES || file.type !== "image/png") {
        throw new Error("Screenshot " + (index + 1) + " is missing or is not a valid PNG image.");
      }
      const screenshotPath = basePath + "/screenshots/screen-" + String(index + 1).padStart(2, "0") + ".png";
      const { error: uploadError } = await adminClient.storage.from("academy-videos").upload(
        screenshotPath,
        new Uint8Array(await file.arrayBuffer()),
        { contentType: "image/png", cacheControl: "31536000", upsert: false },
      );
      if (uploadError) throw uploadError;
      uploaded.push(screenshotPath);
      screenshotRows.push({
        path: screenshotPath,
        captured_at: new Date().toISOString(),
        caption: String(screenshotMeta[index]?.caption || "SuperTechAi screen").slice(0, 200),
      });
    }

    const videoPath = basePath + "/lesson.mp4";
    const { error: videoUploadError } = await adminClient.storage.from("academy-videos").upload(
      videoPath,
      new Uint8Array(await video.arrayBuffer()),
      { contentType: "video/mp4", cacheControl: "31536000", upsert: false },
    );
    if (videoUploadError) throw videoUploadError;
    uploaded.push(videoPath);

    const { data: saved, error: saveError } = await adminClient.from("academy_videos").insert({
      lesson_id: lessonId,
      lesson_title: lessonTitle,
      provider_session_id: providerSessionId,
      provider_video_id: "real-screen-kokoro-v1",
      status: "completed",
      video_url: videoPath,
      screenshots: screenshotRows,
      created_by: user.id,
    }).select("id,lesson_id,lesson_title,status,video_url,screenshots,created_at").single();
    if (saveError) throw saveError;

    return json({ video: saved, screenshot_count: screenshotRows.length, message: "Real-screen Academy lesson published." }, 201);
  } catch (error) {
    if (uploaded.length) {
      await adminClient.storage.from("academy-videos").remove(uploaded).catch(() => undefined);
    }
    console.error("academy-videos publish error:", error instanceof Error ? error.message : "unknown");
    return json({ error: error instanceof Error ? error.message : "Academy publishing failed." }, 500);
  }
});
