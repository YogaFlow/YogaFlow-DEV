/**
 * Einstieg für Edge Functions: getPaymentProvider(Deno.env).
 *
 * PAYMENTS_MODE        test | live (Pflicht)
 * PAYMENTS_PROVIDER    stripe (Standard) | fake (nur mit PAYMENTS_MODE=test)
 * STRIPE_SECRET_KEY    test: sk_test_/rk_test_, live: sk_live_/rk_live_
 *
 * Jede Abweichung wirft CONFIG_ERROR, bevor eine Anfrage an den Anbieter möglich ist.
 */
import { type PaymentsEnv, readPaymentsMode } from "./config.ts";
import { FakePaymentProvider } from "./fake/adapter.ts";
import { type PaymentProvider, ProviderError } from "./port.ts";
import { StripePaymentProvider } from "./stripe/adapter.ts";

export * from "./port.ts";
export { envFromRecord, type PaymentsEnv, type PaymentsMode, readPaymentsMode } from "./config.ts";

export function getPaymentProvider(env: PaymentsEnv): PaymentProvider {
  const mode = readPaymentsMode(env);
  const provider = env.get("PAYMENTS_PROVIDER")?.trim() || "stripe";

  if (provider === "fake") {
    if (mode !== "test") throw new ProviderError("CONFIG_ERROR", "PAYMENTS_PROVIDER_FAKE_LIVE");
    return new FakePaymentProvider();
  }
  if (provider === "stripe") {
    return new StripePaymentProvider({ secretKey: env.get("STRIPE_SECRET_KEY"), mode });
  }
  throw new ProviderError("CONFIG_ERROR", "PAYMENTS_PROVIDER");
}
