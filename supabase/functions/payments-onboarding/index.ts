/**
 * payments-onboarding (Geldkette 1.3a). Owner startet die eingebettete
 * Stripe-Onboarding-Komponente oder aktualisiert den Kontostand.
 *
 * verify_jwt = false in config.toml: JWT und Tenant prüft initService selbst
 * (klare Codes), gleiches Muster wie service-ping. Service-Client nur für
 * Service-RPCs; Rolle über get_owner_payment_context.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getPaymentProvider, ProviderError, readPaymentsMode } from "../_shared/payments/index.ts";
import { createOnboardingSession } from "../_shared/payments/stripe/onboarding.ts";
import {
  initService,
  unexpectedErrorResponse,
} from "../_shared/service.ts";
import { handleOnboarding } from "./handler.ts";
import { createOnboardingStore } from "./store.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey, x-omlify-tenant",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const ready = await initService(req, corsHeaders);
  if (!ready.ok) return ready.response;

  const { supabase, log, errorResponse, tenantSlug } = ready.ctx;

  try {
    const { data: member, error: memberError } = await supabase
      .rpc("get_current_member")
      .maybeSingle();
    if (memberError) {
      log.error("payments-onboarding: get_current_member", memberError);
      return errorResponse(500, "internal_error", "Ein Fehler ist aufgetreten");
    }
    const memberRow = member as { id?: unknown; tenant_id?: unknown } | null;
    if (
      !memberRow
      || typeof memberRow.id !== "string"
      || typeof memberRow.tenant_id !== "string"
    ) {
      log.warn("payments-onboarding: keine Mitgliedschaft", { tenant: tenantSlug });
      return errorResponse(403, "FORBIDDEN", "Du gehörst diesem Studio nicht an");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      log.error("payments-onboarding", { result: "CONFIG_ERROR" });
      return errorResponse(500, "CONFIG_ERROR", "Dienst nicht konfiguriert");
    }

    let provider;
    try {
      provider = getPaymentProvider(Deno.env);
    } catch (err) {
      log.error("payments-onboarding", {
        result: err instanceof ProviderError ? err.code : "CONFIG_ERROR",
      });
      return errorResponse(500, "CONFIG_ERROR", "Zahlungen sind nicht konfiguriert");
    }

    const mode = readPaymentsMode(Deno.env);
    const serviceClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    return await handleOnboarding(
      req,
      { tenantId: memberRow.tenant_id, memberId: memberRow.id },
      {
        provider,
        store: createOnboardingStore(serviceClient, supabase),
        createSession: (accountRef) =>
          createOnboardingSession(
            { secretKey: Deno.env.get("STRIPE_SECRET_KEY"), mode },
            accountRef,
          ),
        log,
        errorResponse,
        corsHeaders,
      },
    );
  } catch (cause) {
    return unexpectedErrorResponse(log, cause, corsHeaders);
  }
});
