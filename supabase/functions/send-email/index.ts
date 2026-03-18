import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import nodemailer from "npm:nodemailer@6.9.10";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Internal-Secret",
};

interface EmailRequest {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const internalSecret = Deno.env.get("INTERNAL_EMAIL_SECRET");
  const headerSecret = req.headers.get("X-Internal-Secret");
  if (!internalSecret || headerSecret !== internalSecret) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const smtpHost = Deno.env.get("SMTP_HOST")?.trim();
  const smtpUser = Deno.env.get("SMTP_USER")?.trim();
  const smtpPass = Deno.env.get("SMTP_PASS")?.trim();
  if (!smtpHost || !smtpUser || !smtpPass) {
    console.error("SMTP not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS in Edge Function Secrets.");
    return new Response(
      JSON.stringify({
        error: "SMTP not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS in Edge Function Secrets.",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const smtpPort = Number(Deno.env.get("SMTP_PORT")?.trim() || "465");
  const secure = smtpPort === 465;

  let body: EmailRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { to: toEmail, subject, html: htmlContent } = body;

  if (!toEmail || !subject || !htmlContent) {
    return new Response(
      JSON.stringify({ error: "Missing required fields: to, subject, html" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  console.log("Sending email to:", toEmail, "subject:", subject);

  const transport = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  const fromAddress = Deno.env.get("SENDER_EMAIL")?.trim() || smtpUser;
  const from = `"Die Thallers" <${fromAddress}>`;

  try {
    const info = await transport.sendMail({
      from,
      to: toEmail,
      subject,
      html: htmlContent,
    });

    console.log("Email sent:", info.messageId);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Email sent successfully",
        messageId: info.messageId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error sending email:", error);
    const details = (error as { message?: string })?.message ?? String(error);
    return new Response(
      JSON.stringify({ error: "Failed to send email", details }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
