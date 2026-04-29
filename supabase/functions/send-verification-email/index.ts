import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { resolveEmailLinkBaseUrl } from "../_shared/email_link_base_url.ts";
import { fetchStudioSlugForUser, verifyClientStudioSlugHint } from "../_shared/studio_slug_for_user.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface VerificationRequest {
  userId: string;
  email: string;
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

    const { userId, email, studio_slug: clientStudioSlug }: VerificationRequest = await req.json();

    if (!userId || !email) {
      return new Response(
        JSON.stringify({ error: "Missing userId or email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Ensure user exists in public.users (trigger may not have run yet)
    const { error: ensureError } = await supabase.rpc("ensure_public_user", { p_user_id: userId });
    if (ensureError) {
      console.error("ensure_public_user:", ensureError);
      return new Response(
        JSON.stringify({
          error: "User setup failed",
          details: ensureError.message,
          code: "ensure_public_user_failed",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user exists in public.users (auth_tokens has FK to users); avoid race after signUp
    const { data: userRow, error: userCheckError } = await supabase
      .from("users")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    if (userCheckError || !userRow) {
      console.error("User not in public.users yet:", userCheckError ?? "no row");
      return new Response(
        JSON.stringify({
          error: "Account wird noch angelegt. Bitte in wenigen Sekunden erneut auf „E-Mail senden“ klicken.",
          code: "user_not_ready",
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: tokenData, error: tokenError } = await supabase.rpc(
      "create_verification_token",
      { p_user_id: userId, p_email: email }
    );

    if (tokenError || tokenData == null) {
      console.error("Error creating token:", tokenError);
      return new Response(
        JSON.stringify({ error: "Failed to create verification token" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = typeof tokenData === "string" ? tokenData : tokenData?.[0]?.token;
    if (!token) {
      console.error("Invalid token data from create_verification_token");
      return new Response(
        JSON.stringify({ error: "Failed to create verification token" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const slugFromDb = await fetchStudioSlugForUser(supabase, userId);
    const slugFromHint = await verifyClientStudioSlugHint(supabase, userId, clientStudioSlug);
    const studioSlug = slugFromDb ?? slugFromHint;
    const baseUrl = resolveEmailLinkBaseUrl(req, studioSlug);
    const verificationLink = `${baseUrl}/verify-email?token=${token}`;

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>E-Mail-Adresse bestätigen</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #ffffff; color: #111827;">
          <div style="max-width: 560px; margin: 0 auto; padding: 32px 20px;">
            <p style="margin: 0 0 24px 0; color: #0f766e; font-size: 14px; font-weight: 700;">Omlify</p>
            <h1 style="margin: 0 0 16px 0; color: #111827; font-size: 22px; line-height: 1.3;">E-Mail-Adresse bestätigen</h1>
            <p style="margin: 0 0 24px 0; color: #374151; font-size: 16px; line-height: 1.5;">
              Bitte bestätigen Sie Ihre E-Mail-Adresse, um Ihr Omlify-Konto zu aktivieren.
            </p>
            <p style="margin: 0 0 28px 0;">
              <a href="${verificationLink}" style="display: inline-block; padding: 12px 18px; background-color: #0f766e; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 15px; font-weight: 600;">E-Mail-Adresse bestätigen</a>
            </p>
            <p style="margin: 0; color: #6b7280; font-size: 13px; line-height: 1.5;">
              Dieser Link ist 24 Stunden gültig. Wenn Sie kein Omlify-Konto erstellt haben, können Sie diese E-Mail ignorieren.
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
        subject: "E-Mail-Adresse bestätigen - Omlify",
        html: emailHtml,
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error("Error sending email:", errorText);
      return new Response(
        JSON.stringify({
          error: "Failed to send verification email",
          details: errorText,
        }),
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