import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface VerificationRequest {
  userId: string;
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

    const { userId, email }: VerificationRequest = await req.json();

    if (!userId || !email) {
      return new Response(
        JSON.stringify({ error: "Missing userId or email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: tokenData, error: tokenError } = await supabase.rpc(
      "create_verification_token",
      { p_user_id: userId, p_email: email }
    );

    if (tokenError || !tokenData || tokenData.length === 0) {
      console.error("Error creating token:", tokenError);
      return new Response(
        JSON.stringify({ error: "Failed to create verification token" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = tokenData[0].token;
    const baseUrl = Deno.env.get("APP_URL") || req.headers.get("origin") || "http://localhost:5173";
    const verificationLink = `${baseUrl}/verify-email?token=${token}`;

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>E-Mail-Adresse bestätigen</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
          <table role="presentation" style="width: 100%; border-collapse: collapse;">
            <tr>
              <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; max-width: 100%; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                  <tr>
                    <td style="padding: 40px 30px; text-align: center;">
                      <h1 style="margin: 0 0 20px 0; color: #0f766e; font-size: 28px; font-weight: 700;">Willkommen bei Die Thallers!</h1>
                      <p style="margin: 0 0 30px 0; color: #4b5563; font-size: 16px; line-height: 1.5;">Bitte bestätigen Sie Ihre E-Mail-Adresse, um Ihr Konto zu aktivieren.</p>
                      <table role="presentation" style="margin: 0 auto;">
                        <tr>
                          <td style="border-radius: 6px; background-color: #0f766e;">
                            <a href="${verificationLink}" style="display: inline-block; padding: 16px 32px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px;">E-Mail-Adresse bestätigen</a>
                          </td>
                        </tr>
                      </table>
                      <p style="margin: 30px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.5;">Oder kopieren Sie diesen Link in Ihren Browser:</p>
                      <p style="margin: 10px 0 0 0; color: #0f766e; font-size: 12px; word-break: break-all;">${verificationLink}</p>
                      <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
                      <p style="margin: 0; color: #9ca3af; font-size: 12px;">Dieser Link ist 24 Stunden gültig. Wenn Sie diese E-Mail nicht angefordert haben, können Sie sie ignorieren.</p>
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
        subject: "E-Mail-Adresse bestätigen - Die Thallers",
        html: emailHtml,
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error("Error sending email:", errorText);
      return new Response(
        JSON.stringify({ error: "Failed to send verification email", details: errorText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: "Verification email sent" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});