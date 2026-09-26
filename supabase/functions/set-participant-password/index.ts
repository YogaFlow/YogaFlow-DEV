import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  initService,
  unexpectedErrorResponse,
} from "../_shared/service.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey, x-omlify-tenant",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NOTICE_BODY = "Dein Passwort wurde vom Studio geändert.";

type MemberRow = {
  id: string;
  role: string;
  auth_user_id: string | null;
};

type TargetRow = {
  id: string;
  role: string;
  auth_user_id: string | null;
  email: string | null;
  email_verified: boolean | null;
};

type ExclusiveRow = {
  member_id: string;
  login_exclusive: boolean;
};

function jsonSuccess(): Response {
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** GoTrue-Meldungen können den Eingabewert enthalten. Den nie mitschreiben. */
function safeAuthMessage(message: string, password: string): string {
  if (password !== "" && message.includes(password)) {
    return "auth-fehler (Eingabe aus Meldung entfernt)";
  }
  return message;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Methode nicht erlaubt", code: "method_not_allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const ready = await initService(req, corsHeaders);
  if (!ready.ok) return ready.response;

  const { supabase, log, errorResponse } = ready.ctx;

  let password = "";
  try {
    let body: { userId?: unknown; password?: unknown };
    try {
      body = await req.json();
    } catch {
      return errorResponse(400, "invalid_body", "Ungültiger JSON-Body");
    }

    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    password = typeof body.password === "string" ? body.password : "";

    if (!UUID_RE.test(userId)) {
      return errorResponse(400, "invalid_user", "Person fehlt oder ist ungültig");
    }
    if (password.length < 8) {
      return errorResponse(
        400,
        "password_too_short",
        "Das Passwort muss mindestens 8 Zeichen lang sein.",
      );
    }

    const { data: memberData, error: memberError } = await supabase
      .rpc("get_current_member")
      .maybeSingle();
    if (memberError) {
      log.error("set-participant-password: get_current_member fehlgeschlagen", memberError);
      return errorResponse(500, "internal_error", "Das Passwort konnte nicht gesetzt werden.");
    }
    const member = memberData as MemberRow | null;
    if (!member || (member.role !== "owner" && member.role !== "admin")) {
      return errorResponse(
        403,
        "not_manager",
        "Nur Inhaberinnen, Inhaber und Admins dürfen das Passwort setzen.",
      );
    }

    const { data: targetData, error: targetError } = await supabase
      .from("users")
      .select("id, role, auth_user_id, email, email_verified")
      .eq("id", userId)
      .maybeSingle();
    if (targetError) {
      log.error("set-participant-password: Zielzeile nicht lesbar", targetError);
      return errorResponse(500, "internal_error", "Das Passwort konnte nicht gesetzt werden.");
    }
    const target = targetData as TargetRow | null;
    if (!target) {
      return errorResponse(404, "target_not_found", "Person nicht gefunden.");
    }
    if (target.role !== "user") {
      return errorResponse(
        403,
        "target_not_participant",
        "Das Passwort lässt sich nur für Teilnehmende setzen.",
      );
    }
    if (target.auth_user_id === null) {
      return errorResponse(
        409,
        "target_without_login",
        "Diese Person hat keinen Login.",
      );
    }
    if (target.auth_user_id === member.auth_user_id) {
      return errorResponse(
        403,
        "cannot_change_own_password",
        "Dein eigenes Passwort änderst du im Profil.",
      );
    }

    const { data: exclusiveData, error: exclusiveError } = await supabase
      .rpc("studio_member_login_exclusive");
    if (exclusiveError) {
      log.error("set-participant-password: Exklusiv-Zählung fehlgeschlagen", exclusiveError);
      return errorResponse(500, "internal_error", "Das Passwort konnte nicht gesetzt werden.");
    }
    const exclusive = (exclusiveData as ExclusiveRow[] | null)?.find(
      (row) => row.member_id === userId,
    );
    if (!exclusive?.login_exclusive) {
      return errorResponse(
        403,
        "login_not_exclusive",
        "Diese Person nutzt ihren Zugang auch in einem anderen Studio. Das Passwort kann sie nur selbst ändern.",
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      log.error("set-participant-password: SERVICE_ROLE oder URL fehlt");
      return errorResponse(500, "server_misconfigured", "Dienst nicht konfiguriert");
    }

    // Service-Role nur hier: Passwort am Login setzen, danach die Glocke.
    // Rollen und Zielzeile sind oben schon mit dem Nutzer-JWT gelesen.
    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(
      target.auth_user_id,
      { password },
    );
    if (authUpdateError) {
      log.error(
        "set-participant-password: updateUserById fehlgeschlagen",
        safeAuthMessage(authUpdateError.message ?? "", password),
      );
      return errorResponse(500, "password_update_failed", "Das Passwort konnte nicht gesetzt werden.");
    }

    const { error: noticeError } = await adminClient.rpc("record_studio_password_notice", {
      p_actor_id: member.id,
      p_member_id: userId,
    });
    if (noticeError) {
      log.error("set-participant-password: Glocke fehlgeschlagen", noticeError);
    }

    if (target.email_verified === true && target.email) {
      const internalSecret = Deno.env.get("INTERNAL_EMAIL_SECRET");
      if (!internalSecret) {
        log.error("set-participant-password: INTERNAL_EMAIL_SECRET fehlt");
      } else {
        try {
          const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Internal-Secret": internalSecret,
            },
            body: JSON.stringify({
              to: target.email,
              subject: "Dein Passwort wurde geändert",
              html: `<p>${NOTICE_BODY}</p><p>Wenn du das nicht warst, setze dir in deinem Profil ein neues Passwort.</p>`,
            }),
          });
          if (!emailResponse.ok) {
            log.error("set-participant-password: Mail fehlgeschlagen", emailResponse.status);
          }
        } catch (mailCause) {
          log.error("set-participant-password: Mail fehlgeschlagen", mailCause);
        }
      }
    }

    return jsonSuccess();
  } catch (cause) {
    return unexpectedErrorResponse(log, cause, corsHeaders, "Das Passwort konnte nicht gesetzt werden.");
  } finally {
    password = "";
  }
});
