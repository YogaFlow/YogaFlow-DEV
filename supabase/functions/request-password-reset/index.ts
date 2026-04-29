import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { resolveEmailLinkBaseUrl } from "../_shared/email_link_base_url.ts";
import { fetchStudioSlugForUser } from "../_shared/studio_slug_for_user.ts";

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

    if (!userData) {
      console.log("Password reset: no user found for email:", email, "- no email sent (by design)");
    }

    if (userData) {
      const { data: tokenData, error: tokenError } = await supabase.rpc(
        "create_password_reset_token",
        { p_user_id: userData.id, p_email: userData.email ?? email }
      );

      if (tokenError || !tokenData) {
        console.error("Error creating token:", tokenError);
      } else {
        const token = tokenData as string;
        const studioSlug = await fetchStudioSlugForUser(supabase, userData.id);
        const baseUrl = resolveEmailLinkBaseUrl(req, studioSlug);
        const resetLink = `${baseUrl}/reset-password?token=${token}`;

        const emailHtml = `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Passwort zurücksetzen</title>
            </head>
            <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #ffffff; color: #111827;">
              <div style="max-width: 560px; margin: 0 auto; padding: 32px 20px;">
                <p style="margin: 0 0 24px 0; color: #0f766e; font-size: 14px; font-weight: 700;">Omlify</p>
                <h1 style="margin: 0 0 16px 0; color: #111827; font-size: 22px; line-height: 1.3;">Passwort zurücksetzen</h1>
                <p style="margin: 0 0 16px 0; color: #374151; font-size: 16px; line-height: 1.5;">
                  Für Ihr Omlify-Konto wurde ein neues Passwort angefordert.
                </p>
                <p style="margin: 0 0 24px 0; color: #374151; font-size: 16px; line-height: 1.5;">
                  Über den folgenden Button können Sie ein neues Passwort vergeben. Der Link ist 1 Stunde gültig.
                </p>
                <p style="margin: 0 0 28px 0;">
                  <a href="${resetLink}" style="display: inline-block; padding: 12px 18px; background-color: #0f766e; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 15px; font-weight: 600;">Passwort zurücksetzen</a>
                </p>
                <p style="margin: 0; color: #6b7280; font-size: 13px; line-height: 1.5;">
                  Wenn Sie diese Anfrage nicht gestellt haben, können Sie diese E-Mail ignorieren. Ihr bisheriges Passwort bleibt unverändert.
                </p>
              </div>
            </body>
          </html>
        `;

        const internalSecret = Deno.env.get("INTERNAL_EMAIL_SECRET");
        const sendEmailUrl = `${supabaseUrl}/functions/v1/send-email`;
        const emailResponse = await fetch(sendEmailUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Internal-Secret": internalSecret ?? "",
          },
          body: JSON.stringify({
            to: email,
            subject: "Passwort zurücksetzen - Omlify",
            html: emailHtml,
          }),
        });

        if (!emailResponse.ok) {
          const errBody = await emailResponse.text();
          console.error("Error sending email. Status:", emailResponse.status, "Body:", errBody);
        } else {
          console.log("Password reset email sent successfully to:", email);
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