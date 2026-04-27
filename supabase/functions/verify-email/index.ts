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

    const { error: updateError } = await supabase
      .from("users")
      .update({ 
        email_verified: true,
        email_verified_at: new Date().toISOString()
      })
      .eq("id", userId);

    if (updateError) {
      console.error("User update error:", updateError);
      return new Response(
        JSON.stringify({ error: "Fehler beim Aktualisieren des Benutzerstatus" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Auth-JWT / Session: Frontend prüft u.a. user.email_confirmed_at — ohne diesen Schritt
    // bleibt die App nach Custom-Verifizierung in Lade-/Redirect-Schleifen hängen.
    const { error: authSyncError } = await supabase.auth.admin.updateUserById(userId, {
      email_confirm: true,
    });
    if (authSyncError) {
      console.error("auth.admin.updateUserById (email_confirm):", authSyncError);
    }

    const { error: markError } = await supabase.rpc("mark_token_used", { p_token: token });
    if (markError) {
      console.error("Error marking token as used:", markError);
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