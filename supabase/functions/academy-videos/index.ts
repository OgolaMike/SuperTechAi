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
const adminClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const bucket = "academy-videos";
const demoEmail = "supertechai.254@gmail.com";
const maxScreenshots = 12;

async function verifyDemo(req: Request) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return { error: json({ error: "Sign in with the Academy demo account first." }, 401) };
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: "Bearer " + token } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await userClient.auth.getUser(token);
  const user = data?.user;
  if (error || !user) return { error: json({ error: "The demo session is invalid. Sign in again." }, 401) };
  if ((user.email || "").toLowerCase() !== demoEmail) {
    return { error: json({ error: "Only the restricted SuperTechAi demo account can publish Academy walkthroughs." }, 403) };
  }
  const [{ data: member, error: memberError }, { data: adminRow, error: adminError }] = await Promise.all([
    adminClient.from("member_access").select("user_id").eq("user_id", user.id).maybeSingle(),
    adminClient.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle(),
  ]);
  if (memberError) throw memberError;
  if (adminError) throw adminError;
  if (!member || adminRow) return { error: json({ error: "The publishing account must be an approved non-admin demo member." }, 403) };
  return { user };
}

function validLessonId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9-]{1,80}$/.test(value);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  try {
    const auth = await verifyDemo(req);
    if (auth.error) return auth.error;
    const user = auth.user!;
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    if (action === "prepare") {
      const lessonId = body.lessonId;
      const lessonTitle = String(body.lessonTitle || "").slice(0, 160);
      const providerSessionId = String(body.providerSessionId || "").slice(0, 160);
      const screenshotMeta = body.screenshots;
      if (!validLessonId(lessonId) || !lessonTitle || !providerSessionId ||
          !Array.isArray(screenshotMeta) || screenshotMeta.length < 1 || screenshotMeta.length > maxScreenshots) {
        return json({ error: "A valid lesson ID, title, run ID and 1–12 screenshots are required." }, 400);
      }
      const runFolder = Date.now().toString() + "-" + crypto.randomUUID();
      const base = "lessons/" + lessonId + "/" + runFolder;
      const videoPath = base + "/lesson.mp4";
      const screenshotPaths = screenshotMeta.map((_: unknown, index: number) =>
        base + "/screenshots/screen-" + String(index + 1).padStart(2, "0") + ".png"
      );
      const [videoSigned, ...screenshotSigned] = await Promise.all([
        adminClient.storage.from(bucket).createSignedUploadUrl(videoPath),
        ...screenshotPaths.map((path) => adminClient.storage.from(bucket).createSignedUploadUrl(path)),
      ]);
      if (videoSigned.error) throw videoSigned.error;
      for (const signed of screenshotSigned) if (signed.error) throw signed.error;
      return json({
        video: { path: videoPath, token: videoSigned.data.token },
        screenshots: screenshotSigned.map((signed, index) => ({
          path: screenshotPaths[index],
          token: signed.data.token,
          caption: String(screenshotMeta[index]?.caption || "SuperTechAi screen").slice(0, 200),
        })),
      }, 201);
    }

    if (action === "complete") {
      const lessonId = body.lessonId;
      const lessonTitle = String(body.lessonTitle || "").slice(0, 160);
      const providerSessionId = String(body.providerSessionId || "").slice(0, 160);
      const videoPath = String(body.videoPath || "");
      const screenshots = body.screenshots;
      if (!validLessonId(lessonId) || !lessonTitle || !providerSessionId ||
          !Array.isArray(screenshots) || screenshots.length < 1 || screenshots.length > maxScreenshots) {
        return json({ error: "The completed lesson metadata is incomplete." }, 400);
      }
      const basePrefix = "lessons/" + lessonId + "/";
      if (!videoPath.startsWith(basePrefix) || !videoPath.endsWith("/lesson.mp4")) {
        return json({ error: "The video path is not valid for this lesson." }, 400);
      }
      const runFolder = videoPath.slice(basePrefix.length).split("/")[0];
      const base = basePrefix + runFolder;
      if (!runFolder || screenshots.some((item: Record<string, unknown>) =>
        typeof item.path !== "string" || !item.path.startsWith(base + "/screenshots/")
      )) return json({ error: "Screenshot paths do not match this publishing run." }, 400);

      const [{ data: videoFiles, error: videoListError }, { data: imageFiles, error: imageListError }] = await Promise.all([
        adminClient.storage.from(bucket).list(base, { limit: 10 }),
        adminClient.storage.from(bucket).list(base + "/screenshots", { limit: maxScreenshots }),
      ]);
      if (videoListError) throw videoListError;
      if (imageListError) throw imageListError;
      if (!(videoFiles || []).some((file) => file.name === "lesson.mp4")) {
        return json({ error: "The MP4 video has not finished uploading." }, 409);
      }
      const uploadedNames = new Set((imageFiles || []).map((file) => file.name));
      if (!screenshots.every((item: Record<string, unknown>) => uploadedNames.has(String(item.path).split("/").pop()))) {
        return json({ error: "One or more lesson screenshots have not finished uploading." }, 409);
      }

      const screenshotRows = screenshots.map((item: Record<string, unknown>) => ({
        path: String(item.path),
        captured_at: new Date().toISOString(),
        caption: String(item.caption || "SuperTechAi screen").slice(0, 200),
      }));
      const { data: saved, error: saveError } = await adminClient.from("academy_videos").insert({
        lesson_id: lessonId,
        lesson_title: lessonTitle,
        provider_session_id: providerSessionId,
        provider_video_id: "complete-v2",
        status: "completed",
        video_url: videoPath,
        screenshots: screenshotRows,
        created_by: user.id,
      }).select("id,lesson_id,lesson_title,status,video_url,screenshots,created_at").single();
      if (saveError) throw saveError;
      return json({ video: saved, screenshot_count: screenshotRows.length, message: "Complete-v2 Academy lesson published." }, 201);
    }

    if (action === "cancel") {
      const paths = Array.isArray(body.paths) ? body.paths.filter((item: unknown) => typeof item === "string" && item.startsWith("lessons/")) : [];
      if (paths.length) {
        const { error } = await adminClient.storage.from(bucket).remove(paths);
        if (error) throw error;
      }
      return json({ cancelled: true });
    }

    return json({ error: "Unknown Academy publishing action." }, 400);
  } catch (error) {
    console.error("academy-videos error:", error instanceof Error ? error.message : "unknown");
    return json({ error: error instanceof Error ? error.message : "Academy publishing failed." }, 500);
  }
});
