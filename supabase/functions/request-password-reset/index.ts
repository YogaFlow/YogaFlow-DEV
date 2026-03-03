import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ResetRequest {
  email: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { email }: ResetRequest = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("id, email, first_name")
      .eq("email", email)
      .maybeSingle();

    if (userError) {
      console.error("Database error:", userError);
    }

    if (userData) {
      const { data: tokenData, error: tokenError } = await supabase.rpc(
        "create_password_reset_token",
        { p_user_id: userData.id }
      );

      if (tokenError || !tokenData) {
        console.error("Error creating token:", tokenError);
      } else {
        const token = tokenData as string;
        const baseUrl = Deno.env.get("APP_URL") || req.headers.get("origin") || "http://localhost:5173";
        const resetLink = `${baseUrl}/reset-password?token=${token}`;

        const emailHtml = `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Passwort zurücksetzen</title>
            </head>
            <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center" style="padding: 40px 0;">
                    <table role="presentation" style="width: 600px; max-width: 100%; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                      <tr>
                        <td style="padding: 40px 30px; text-align: center;">
                          <h1 style="margin: 0 0 20px 0; color: #0f766e; font-size: 28px; font-weight: 700;">Passwort zurücksetzen</h1>
                          <p style="margin: 0 0 30px 0; color: #4b5563; font-size: 16px; line-height: 1.5;">Sie haben angefordert, Ihr Passwort zurückzusetzen. Klicken Sie auf den Button unten, um ein neues Passwort zu erstellen.</p>
                          <table role="presentation" style="margin: 0 auto;">
                            <tr>
                              <td style="border-radius: 6px; background-color: #0f766e;">
                                <a href="${resetLink}" style="display: inline-block; padding: 16px 32px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px;">Neues Passwort erstellen</a>
                              </td>
                            </tr>
                          </table>
                          <p style="margin: 30px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.5;">Oder kopieren Sie diesen Link in Ihren Browser:</p>
                          <p style="margin: 10px 0 0 0; color: #0f766e; font-size: 12px; word-break: break-all;">${resetLink}</p>
                          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
                          <p style="margin: 0; color: #9ca3af; font-size: 12px;">Dieser Link ist 1 Stunde gültig. Wenn Sie diese Anfrage nicht gestellt haben, können Sie diese E-Mail ignorieren.</p>
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
        const emailResponse = await fetch(sendEmailUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            to: email,
            subject: "Passwort zurücksetzen - Die Thallers",
            html: emailHtml,
          }),
        });

        if (!emailResponse.ok) {
          console.error("Error sending email:", await emailResponse.text());
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Wenn ein Konto mit dieser E-Mail-Adresse existiert, haben wir Ihnen eine E-Mail zum Zurücksetzen des Passworts geschickt." 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});