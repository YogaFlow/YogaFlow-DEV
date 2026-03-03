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
          <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
            <table role="presentation" style="width: 100%; border-collapse: collapse;">
              <tr>
                <td align="center" style="padding: 40px 0;">
                  <table role="presentation" style="width: 600px; max-width: 100%; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                    <tr>
                      <td style="padding: 40px 30px; text-align: center;">
                        <h1 style="margin: 0 0 20px 0; color: #0f766e; font-size: 28px; font-weight: 700;">Passwort erfolgreich geändert</h1>
                        <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.5;">Ihr Passwort wurde erfolgreich zurückgesetzt. Sie können sich jetzt mit Ihrem neuen Passwort anmelden.</p>
                        <p style="margin: 20px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.5;">Wenn Sie diese Änderung nicht vorgenommen haben, kontaktieren Sie uns bitte umgehend.</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `;

      const sendEmailUrl = `${supabaseUrl}/functions/v1/send-email`;
      await fetch(sendEmailUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          to: userData.email,
          subject: "Ihr Passwort wurde geändert - Die Thallers",
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