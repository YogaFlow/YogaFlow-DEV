import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { token, newPassword }: ResetPasswordRequest = await req.json();

    if (!token || !newPassword) {
      return new Response(
        JSON.stringify({ error: "Token und neues Passwort sind erforderlich" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (newPassword.length < 8) {
      return new Response(
        JSON.stringify({ error: "Passwort muss mindestens 8 Zeichen lang sein" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: verifyResult, error: verifyError } = await supabase.rpc(
      "verify_token",
      { p_token: token, p_type: "password_reset" }
    );

    if (verifyError) {
      console.error("Token verification error:", verifyError);
      return new Response(
        JSON.stringify({ error: "Fehler bei der Token-Überprüfung" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = verifyResult[0];
    if (!result || !result.valid) {
      return new Response(
        JSON.stringify({ error: result?.message || "Token ungültig oder abgelaufen" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = result.user_id;

    const { error: updateError } = await supabase.auth.admin.updateUserById(
      userId,
      { password: newPassword }
    );

    if (updateError) {
      console.error("Password update error:", updateError);
      return new Response(
        JSON.stringify({ error: "Fehler beim Aktualisieren des Passworts" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { error: markError } = await supabase.rpc("mark_token_used", { p_token: token });
    if (markError) {
      console.error("Error marking token as used:", markError);
    }

    const { data: userData } = await supabase
      .from("users")
      .select("email")
      .eq("id", userId)
      .maybeSingle();

    if (userData?.email) {
      const emailHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Passwort geändert</title>
          </head>
          <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #ffffff; color: #111827;">
            <div style="max-width: 560px; margin: 0 auto; padding: 32px 20px;">
              <p style="margin: 0 0 24px 0; color: #0f766e; font-size: 14px; font-weight: 700;">Omlify</p>
              <h1 style="margin: 0 0 16px 0; color: #111827; font-size: 22px; line-height: 1.3;">Passwort geändert</h1>
              <p style="margin: 0 0 16px 0; color: #374151; font-size: 16px; line-height: 1.5;">
                Das Passwort für Ihr Omlify-Konto wurde geändert.
              </p>
              <p style="margin: 0; color: #6b7280; font-size: 13px; line-height: 1.5;">
                Wenn Sie diese Änderung nicht vorgenommen haben, antworten Sie bitte nicht auf diese E-Mail und kontaktieren Sie den Omlify-Support.
              </p>
            </div>
          </body>
        </html>
      `;

      const internalSecret = Deno.env.get("INTERNAL_EMAIL_SECRET");
      const sendEmailUrl = `${supabaseUrl}/functions/v1/send-email`;
      await fetch(sendEmailUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Secret": internalSecret ?? "",
        },
        body: JSON.stringify({
          to: userData.email,
          subject: "Ihr Passwort wurde geändert - Omlify",
          html: emailHtml,
        }),
      }).catch((e) => console.error("Error sending confirmation email:", e));
    }

    return new Response(
      JSON.stringify({ success: true, message: "Passwort erfolgreich zurückgesetzt" }),
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