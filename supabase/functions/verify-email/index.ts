import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface VerifyEmailRequest {
  token: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { token }: VerifyEmailRequest = await req.json();

    if (!token || typeof token !== "string" || token === "undefined" || token.length < 10) {
      return new Response(
        JSON.stringify({ error: "Token ist erforderlich oder ungültig. Bitte nutzen Sie den neuesten Link aus der E-Mail oder fordern Sie eine neue Bestätigungsmail an." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: verifyResult, error: verifyError } = await supabase.rpc(
      "verify_token",
      { p_token: token, p_type: "email_verification" }
    );

    if (verifyError) {
      console.error("Token verification error:", verifyError);
      return new Response(
        JSON.stringify({ error: "Fehler bei der Token-Überprüfung" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = Array.isArray(verifyResult) ? verifyResult[0] : verifyResult;
    if (!result || result.valid !== true) {
      return new Response(
        JSON.stringify({ error: result?.message || "Token ungültig oder abgelaufen" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = result.user_id;

    // Zuerst App-Flag (public.users) — maßgeblich für Login; danach Auth-Sync (kann in DEV schon gesetzt sein).
    const { error: confirmError } = await supabase.rpc("complete_email_verification", {
      p_user_id: userId,
      p_token: token,
    });
    if (confirmError) {
      console.error("complete_email_verification:", confirmError);
      return new Response(
        JSON.stringify({ error: "Fehler beim Aktualisieren des Benutzerstatus" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { error: authSyncError } = await supabase.auth.admin.updateUserById(userId, {
      email_confirm: true,
    });
    if (authSyncError) {
      console.warn("auth.admin.updateUserById (email_confirm, ggf. bereits bestätigt):", authSyncError);
    }

    return new Response(
      JSON.stringify({ success: true, message: "E-Mail-Adresse erfolgreich bestätigt" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Ein Fehler ist aufgetreten" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});