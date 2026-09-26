import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, x-omlify-tenant",
};

interface UpdateUserRequest {
  userId: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  street?: string;
  house_number?: string;
  postal_code?: string;
  city?: string;
  new_password?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Verify caller identity
    const { data: { user: requestingUser }, error: authError } = await adminClient.auth.getUser(token);
    if (authError || !requestingUser) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", details: authError?.message }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Aufrufer über Login + Studio, nie über users.id = auth.uid().
    // Fehlt x-omlify-tenant, wird der Header nicht gesetzt. get_current_member
    // fällt dann auf die Übergangsregel zurück (genau ein Profil, sonst leer).
    // Deshalb hier kein 400: die RPC entscheidet, nicht diese Function.
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!anonKey) {
      return new Response(
        JSON.stringify({ error: "Failed to load requester profile" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const userHeaders: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    const rawSlug = req.headers.get("x-omlify-tenant");
    if (rawSlug !== null && rawSlug.trim() !== "") {
      userHeaders["x-omlify-tenant"] = rawSlug.trim().toLowerCase();
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: userHeaders },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: requesterProfile, error: requesterProfileError } = await userClient
      .rpc("get_current_member")
      .maybeSingle();

    if (requesterProfileError) {
      console.error("update-user: get_current_member fehlgeschlagen", requesterProfileError);
      return new Response(
        JSON.stringify({ error: "Failed to load requester profile" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!requesterProfile) {
      return new Response(
        JSON.stringify({ error: "Für diese Anmeldung gibt es in diesem Studio kein Profil." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!["owner", "admin", "teacher"].includes(requesterProfile.role)) {
      return new Response(
        JSON.stringify({ error: "Insufficient permissions" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 3. Parse request body
    let body: UpdateUserRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // email / new_password: still accepted in the body shape, deliberately unused
    const { userId, new_password: _newPassword, email: _email, ...profileFields } = body;
    void _newPassword;
    void _email;
    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Missing userId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (userId === requesterProfile.id) {
      return new Response(
        JSON.stringify({ error: "Use the profile page to edit your own account" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 4. Load target user profile
    const { data: targetProfile, error: targetProfileError } = await adminClient
      .from("users")
      .select("tenant_id, role")
      .eq("id", userId)
      .maybeSingle();

    if (targetProfileError || !targetProfile) {
      return new Response(
        JSON.stringify({ error: "Target user not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 5. Tenant isolation
    if (requesterProfile.tenant_id !== targetProfile.tenant_id) {
      return new Response(
        JSON.stringify({ error: "Cross-tenant modification not allowed" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 5b. Owner profiles can only be edited by the owner themselves
    if (targetProfile.role === "owner" && requesterProfile.id !== userId) {
      return new Response(
        JSON.stringify({ error: "Owner-Profile können nur vom Owner selbst bearbeitet werden." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 6. Teacher restriction: only edit tenant participants (role: user)
    if (requesterProfile.role === "teacher" && targetProfile.role !== "user") {
      return new Response(
        JSON.stringify({ error: "Teachers can only edit participants (role: user)" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 7. Build profile update (only whitelisted fields — no email)
    const ALLOWED_PROFILE_FIELDS = [
      "first_name", "last_name",
      "phone", "street", "house_number", "postal_code", "city",
    ] as const;

    const profileUpdate: Record<string, unknown> = {};
    for (const key of ALLOWED_PROFILE_FIELDS) {
      if (profileFields[key] !== undefined) {
        profileUpdate[key] = profileFields[key];
      }
    }

    // 8. Update public.users (studio profile only; never auth.users)
    if (Object.keys(profileUpdate).length > 0) {
      const { error: profileUpdateError } = await adminClient
        .from("users")
        .update(profileUpdate)
        .eq("id", userId);

      if (profileUpdateError) {
        return new Response(
          JSON.stringify({ error: "Failed to update user profile", details: profileUpdateError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
