import "jsr:@supabase/functions-js/edge-runtime.d.ts";
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

/** PostgREST reicht RAISE EXCEPTION als message durch; Fallback wenn Pre-Check fehlt. */
function isNoTenantContext(error: { message?: string } | null): boolean {
  const msg = error?.message ?? "";
  return msg.includes("kein Tenant-Kontext");
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

  const { supabase, tenantSlug, log, errorResponse } = ready.ctx;
  log.info("service-ping: start", { tenant: tenantSlug });

  try {
    let body: { causation_id?: string } = {};
    const text = await req.text();
    if (text.trim() !== "") {
      try {
        body = JSON.parse(text);
      } catch {
        return errorResponse(400, "invalid_body", "Ungültiger JSON-Body");
      }
    }

    // Mitgliedschaft vor dem Ping prüfen — kein Parsing von Postgres-SQLSTATE nötig.
    // get_current_member() ist der bestehende Client-Weg; leere Menge = kein Profil hier.
    const { data: member, error: memberError } = await supabase
      .rpc("get_current_member")
      .maybeSingle();
    if (memberError) {
      log.error("service-ping: get_current_member fehlgeschlagen", memberError);
      return errorResponse(500, "internal_error", "Ping fehlgeschlagen");
    }
    if (!member) {
      log.warn("service-ping: keine Mitgliedschaft", { tenant: tenantSlug });
      return errorResponse(
        403,
        "no_tenant_membership",
        "Du gehörst diesem Studio nicht an",
      );
    }

    const { data: eventId, error } = await supabase.rpc("record_service_ping", {
      p_causation_id: body.causation_id ?? null,
    });

    if (error || !eventId) {
      if (isNoTenantContext(error)) {
        log.warn("service-ping: kein Tenant-Kontext (RPC)", { tenant: tenantSlug });
        return errorResponse(
          403,
          "no_tenant_membership",
          "Du gehörst diesem Studio nicht an",
        );
      }
      log.error("service-ping: record_service_ping fehlgeschlagen", error);
      return errorResponse(500, "internal_error", "Ping fehlgeschlagen");
    }

    log.info("service-ping: ok", { tenant: tenantSlug, event_id: eventId });

    return new Response(
      JSON.stringify({
        ok: true,
        event_id: eventId,
        tenant: tenantSlug,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (cause) {
    return unexpectedErrorResponse(log, cause, corsHeaders);
  }
});
