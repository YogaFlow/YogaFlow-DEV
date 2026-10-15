import { FakePaymentProvider } from "./fake/adapter.ts";
import { envFromRecord, getPaymentProvider } from "./index.ts";
import { assert, assertProviderError } from "./port_contract.ts";
import { StripePaymentProvider } from "./stripe/adapter.ts";

Deno.test("Fabrik: PAYMENTS_MODE fehlt oder ist ungültig → CONFIG_ERROR", async () => {
  for (const mode of [undefined, "", "prod", "TEST"]) {
    await assertProviderError(
      () => getPaymentProvider(envFromRecord({ PAYMENTS_MODE: mode, STRIPE_SECRET_KEY: "sk_test_x" })),
      "CONFIG_ERROR",
      String(mode),
    );
  }
});

Deno.test("Fabrik: Live-Key bei PAYMENTS_MODE=test → CONFIG_ERROR", async () => {
  await assertProviderError(
    () => getPaymentProvider(envFromRecord({ PAYMENTS_MODE: "test", STRIPE_SECRET_KEY: "sk_live_x" })),
    "CONFIG_ERROR",
  );
});

Deno.test("Fabrik: Stripe ist Standard", () => {
  const p = getPaymentProvider(envFromRecord({ PAYMENTS_MODE: "test", STRIPE_SECRET_KEY: "sk_test_x" }));
  assert(p instanceof StripePaymentProvider, "StripePaymentProvider erwartet");
});

Deno.test("Fabrik: fake nur mit PAYMENTS_MODE=test", async () => {
  const p = getPaymentProvider(envFromRecord({ PAYMENTS_MODE: "test", PAYMENTS_PROVIDER: "fake" }));
  assert(p instanceof FakePaymentProvider, "FakePaymentProvider erwartet");
  await assertProviderError(
    () => getPaymentProvider(envFromRecord({ PAYMENTS_MODE: "live", PAYMENTS_PROVIDER: "fake" })),
    "CONFIG_ERROR",
  );
});

Deno.test("Fabrik: unbekannter Anbieter → CONFIG_ERROR", async () => {
  await assertProviderError(
    () => getPaymentProvider(envFromRecord({ PAYMENTS_MODE: "test", PAYMENTS_PROVIDER: "paypal" })),
    "CONFIG_ERROR",
  );
});
