import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { client_id, email, redirect_to } = await req.json();
    if (!client_id || !email) {
      return new Response(JSON.stringify({ error: "client_id and email required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: client, error: clientErr } = await admin.from("clients").select("id, auth_user_id").eq("id", client_id).maybeSingle();
    if (clientErr || !client) {
      return new Response(JSON.stringify({ error: "Client not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (client.auth_user_id) {
      return new Response(JSON.stringify({ error: "Patient already has access" }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const redirectTo = redirect_to || `${new URL(req.url).origin.replace("supabase.co", "lovable.app")}/aceitar-convite`;

    const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { client_id },
    });
    if (inviteErr || !invited.user) {
      return new Response(JSON.stringify({ error: inviteErr?.message ?? "invite failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await admin.from("clients").update({ auth_user_id: invited.user.id }).eq("id", client_id);
    await admin.from("user_roles").insert({ user_id: invited.user.id, role: "patient" });

    return new Response(JSON.stringify({ ok: true, user_id: invited.user.id }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
