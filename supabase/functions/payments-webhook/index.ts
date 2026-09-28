/**
 * payments-webhook (Geldkette 1.4). Ein Stripe-Endpunkt für Ereignisse verbundener
 * Konten (W1). verify_jwt = false in config.toml: Stripe sendet kein JWT, die
 * Signatur ist die Prüfung. Logik und Tests: handler.ts / handler_test.ts.
 *
 * Service-Client nur hier (I12). Kein Nutzer-JWT, kein x-omlify-tenant.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getPaymentProvider, ProviderError } from "../_shared/payments/index.ts";
import { createServiceLogger } from "../_shared/service.ts";
import { handleWebhook, type WebhookStore } from "./handler.ts";
import { createSupabaseWebhookStore } from "./store.ts";

const log = createServiceLogger();

function getStore(): WebhookStore {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) throw new ProviderError("CONFIG_ERROR", "SUPABASE_SERVICE_ROLE_KEY");
  const client = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return createSupabaseWebhookStore(client);
}

Deno.serve((req: Request) =>
  handleWebhook(req, {
    env: Deno.env,
    getProvider: () => getPaymentProvider(Deno.env),
    getStore,
    log,
  })
);
