import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  try {
    const token = req.headers.get("Authorization")?.replace(/^Bearer /, "");
    if (!token) return jsonResponse({ error: "Sign in required" }, 401);

    const { data: userData, error: userError } = await db.auth.getUser(token);
    if (userError || !userData.user) return jsonResponse({ error: "Sign in required" }, 401);
    const callerId = userData.user.id;

    const { data: callerAdmin, error: adminError } = await db
      .from("admin_users")
      .select("user_id")
      .eq("user_id", callerId)
      .maybeSingle();
    if (adminError) throw adminError;
    if (!callerAdmin) return jsonResponse({ error: "Admins only" }, 403);

    if (req.method === "GET") {
      const { data: listed, error: listError } = await db.auth.admin.listUsers({ page: 1, perPage: 500 });
      if (listError) throw listError;
      const { data: admins, error: adminsError } = await db.from("admin_users").select("user_id");
      if (adminsError) throw adminsError;
      const { data: members, error: membersError } = await db.from("member_access").select("user_id");
      if (membersError) throw membersError;
      const adminIds = new Set((admins ?? []).map((row) => row.user_id));
      const memberIds = new Set((members ?? []).map((row) => row.user_id));
      return jsonResponse({
        users: listed.users.map((user) => ({
          id: user.id,
          email: user.email ?? "",
          createdAt: user.created_at,
          lastSignInAt: user.last_sign_in_at ?? null,
          isAdmin: adminIds.has(user.id),
          isApproved: memberIds.has(user.id),
        })),
      });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const hasAdmin = typeof body?.admin === "boolean";
      const hasApproved = typeof body?.approved === "boolean";
      if (typeof body?.userId !== "string" || (!hasAdmin && !hasApproved)) {
        return jsonResponse({ error: "Invalid request" }, 400);
      }
      const userId: string = body.userId;
      const removesOwnAccess = (hasAdmin && !body.admin) || (hasApproved && !body.approved);
      if (userId === callerId && removesOwnAccess) {
        return jsonResponse({ error: "You cannot remove your own access" }, 400);
      }

      if (hasApproved && !body.approved) {
        const { error: revokeAdminError } = await db.from("admin_users").delete().eq("user_id", userId);
        if (revokeAdminError) throw revokeAdminError;
        const { error: revokeError } = await db.from("member_access").delete().eq("user_id", userId);
        if (revokeError) throw revokeError;
        return jsonResponse({ ok: true });
      }

      if (hasAdmin) {
        if (body.admin) {
          const { error } = await db.from("admin_users").upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });
          if (error) throw error;
          const { error: approveError } = await db.from("member_access").upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });
          if (approveError) throw approveError;
        } else {
          const { error } = await db.from("admin_users").delete().eq("user_id", userId);
          if (error) throw error;
        }
      }

      if (hasApproved && body.approved) {
        const { error } = await db.from("member_access").upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });
        if (error) throw error;
      }
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: "Method not allowed" }, 405);
  } catch {
    return jsonResponse({ error: "Request failed" }, 500);
  }
});
