import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
};
const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "GET") return reply({ error: "Method not allowed." }, 405);
  try {
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return reply({ error: "Please sign in first." }, 401);
    const { data: authData, error: authError } = await db.auth.getUser(token);
    if (authError || !authData.user) return reply({ error: "Your sign-in session is invalid. Please sign in again." }, 401);

    const userId = authData.user.id;
    const profileResult = await db
      .from("finance_member_profiles")
      .select("referral_code,sponsor_user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (profileResult.error) throw profileResult.error;
    let profile = profileResult.data;
    if (!profile) {
      const referralCode = crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase();
      const { data: created, error: createError } = await db
        .from("finance_member_profiles")
        .insert({ user_id: userId, referral_code: referralCode })
        .select("referral_code,sponsor_user_id")
        .single();
      if (createError) throw createError;
      profile = created;
    }

    const { data: members, error: networkError } = await db.rpc("finance_get_network", { p_root_user_id: userId });
    if (networkError) throw networkError;

    const { data: adminRecord, error: adminError } = await db
      .from("admin_users")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (adminError) throw adminError;

    let allMembers = null;
    if (adminRecord) {
      const { data: directory, error: directoryError } = await db.rpc("finance_get_all_network_members");
      if (directoryError) throw directoryError;
      allMembers = directory ?? [];
    }
    return reply({ profile, members: members ?? [], allMembers });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("network function error", message);
    return reply({ error: "We could not load your network right now. Please refresh and try again." }, 500);
  }
});
