import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { apexHostFromRequestOrigin, resolveEmailLinkBaseUrl } from "../_shared/email_link_base_url.ts";
import { fetchStudioSlugForUser, verifyClientStudioSlugHint } from "../_shared/studio_slug_for_user.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RequestBody {
  email: string;
  /** Optional: z. B. aus sessionStorage nach Onboarding; wird gegen den Tenant des Users geprüft. */
  studio_slug?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = (await req.json()) as RequestBody;
    const { email, studio_slug: clientStudioSlug } = body;

    if (!email?.trim()) {
      return new Response(
        JSON.stringify({ error: "E-Mail-Adresse ist erforderlich." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("id, email")
      .eq("email", email.trim())
      .maybeSingle();

    if (userError) {
      console.error("Database error:", userError);
    }

    if (!userData) {
      console.log("Verification email: no user found for email:", email, "- no email sent (by design)");
      return new Response(
        JSON.stringify({
          success: true,
          message: "Falls ein Konto mit dieser E-Mail-Adresse existiert, wurde eine Bestätigungsmail gesendet. Bitte prüfen Sie Ihr Postfach.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: tokenData, error: tokenError } = await supabase.rpc(
      "create_verification_token",
      { p_user_id: userData.id, p_email: userData.email ?? email }
    );

    if (tokenError || tokenData == null) {
      console.error("Error creating verification token:", tokenError);
      return new Response(
        JSON.stringify({ error: "Token konnte nicht erstellt werden. Bitte versuchen Sie es später erneut." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = typeof tokenData === "string" ? tokenData : tokenData?.[0]?.token;
    if (!token) {
      console.error("Invalid token data from create_verification_token");
      return new Response(
        JSON.stringify({ error: "Token konnte nicht erstellt werden. Bitte versuchen Sie es später erneut." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const slugFromDb = await fetchStudioSlugForUser(supabase, userData.id);
    const slugFromHint = await verifyClientStudioSlugHint(supabase, userData.id, clientStudioSlug);
    const studioSlug = slugFromDb ?? slugFromHint;

    const baseUrl = resolveEmailLinkBaseUrl(req, studioSlug);
    const verificationLink = `${baseUrl}/verify-email?token=${token}`;

    let baseHost = "";
    try {
      baseHost = new URL(baseUrl).hostname;
    } catch {
      baseHost = "(parse-error)";
    }
    console.log(
      "[request-verification-email]",
      JSON.stringify({
        hasSlug: !!studioSlug,
        slugSource: slugFromDb ? "db" : slugFromHint ? "client_hint" : "none",
        baseHost,
        originApex: !!apexHostFromRequestOrigin(req),
      }),
    );

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

    const internalSecret = Deno.env.get("INTERNAL_EMAIL_SECRET");
    const sendEmailUrl = `${supabaseUrl}/functions/v1/send-email`;
    const emailResponse = await fetch(sendEmailUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": internalSecret ?? "",
      },
      body: JSON.stringify({
        to: userData.email ?? email,
        subject: "E-Mail-Adresse bestätigen - Die Thallers",
        html: emailHtml,
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error("Error sending verification email:", errorText);
      return new Response(
        JSON.stringify({ error: "Die Bestätigungsmail konnte nicht gesendet werden. Bitte versuchen Sie es später erneut.", details: errorText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Falls ein Konto mit dieser E-Mail-Adresse existiert, wurde eine Bestätigungsmail gesendet. Bitte prüfen Sie Ihr Postfach.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message || String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
