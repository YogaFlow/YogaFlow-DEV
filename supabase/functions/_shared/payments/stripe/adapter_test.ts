import { connectedAccountIdempotencyKey } from "../port.ts";
import { assert, assertEquals, assertProviderError, definePortContract } from "../port_contract.ts";
import { StripePaymentProvider } from "./adapter.ts";
import * as fx from "./fixtures/accounts.ts";
import { createOnboardingSession } from "./onboarding.ts";
import { STRIPE_API_VERSION } from "./sdk.ts";
import { createStripeStub, signStripeEvent, TEST_SECRET_KEY, TEST_WEBHOOK_SECRET } from "./test_support.ts";

const TENANT = "00000000-0000-4000-8000-00000000c0de";

function setup(mode: "test" | "live" = "test", stubOptions: { failWithStatus?: number } = {}) {
  const stub = createStripeStub(stubOptions);
  const key = mode === "test" ? TEST_SECRET_KEY : "sk_live_omlify_unit_test";
  const provider = new StripePaymentProvider({ secretKey: key, mode, fetchFn: stub.fetchFn });
  return { stub, provider };
}

definePortContract("Stripe (Stub)", () => {
  const { stub, provider } = setup();
  return {
    provider,
    webhookSecret: TEST_WEBHOOK_SECRET,
    activateAccount: (ref) => stub.activate(ref),
    signedEvent: (type, ref) =>
      signStripeEvent({
        type,
        account: ref,
        object: type === "account.updated" ? stub.accounts.get(ref) : { id: "pi_test_1", object: "payment_intent" },
      }),
  };
});

// --- Konto anlegen ---------------------------------------------------------

Deno.test("createConnectedAccount: Controller P7, DE, card_payments + transfers, nur omlify_tenant_id", async () => {
  const { stub, provider } = setup();
  await provider.createConnectedAccount(TENANT, connectedAccountIdempotencyKey(TENANT));

  assertEquals(stub.calls.length, 1);
  const call = stub.calls[0];
  assertEquals([call.method, call.path], ["POST", "/v1/accounts"]);
  assertEquals(call.idempotencyKey, `acct-create-${TENANT}`);

  const p = Object.fromEntries(call.params.entries());
  assertEquals(p, {
    country: "DE",
    "controller[stripe_dashboard][type]": "full",
    "controller[fees][payer]": "account",
    "controller[losses][payments]": "stripe",
    "controller[requirement_collection]": "stripe",
    "capabilities[card_payments][requested]": "true",
    "capabilities[transfers][requested]": "true",
    "metadata[omlify_tenant_id]": TENANT,
  });
});

Deno.test("Anfragen tragen die gepinnte API-Version", async () => {
  const stub = createStripeStub();
  let version: string | null = null;
  const fetchFn: typeof fetch = (input, init) => {
    version = new Headers(init?.headers).get("stripe-version");
    return stub.fetchFn(input, init);
  };
  const provider = new StripePaymentProvider({ secretKey: TEST_SECRET_KEY, mode: "test", fetchFn });
  await provider.createConnectedAccount(TENANT, connectedAccountIdempotencyKey(TENANT));
  assertEquals(version, STRIPE_API_VERSION);
});

Deno.test("getAccountState: unbekanntes Konto → PROVIDER_REJECTED ohne Stripe-Text", async () => {
  const { provider } = setup();
  const err = await assertProviderError(() => provider.getAccountState("acct_gibtsnicht"), "PROVIDER_REJECTED");
  assert(!err.message.includes("acct_gibtsnicht"), "keine Stripe-Meldung in message");
  assertEquals(err.detail, "StripeInvalidRequestError/resource_missing");
});

Deno.test("Stripe 500 → PROVIDER_UNAVAILABLE nach höchstens 2 Wiederholungen", async () => {
  const { stub, provider } = setup("test", { failWithStatus: 500 });
  const err = await assertProviderError(
    () => provider.getAccountState("acct_x"),
    "PROVIDER_UNAVAILABLE",
  );
  assertEquals(stub.calls.length, 3);
  assert(!err.message.includes("Interner Stripe-Text"), "keine Stripe-Meldung in message");
});

// --- Konfiguration ---------------------------------------------------------

Deno.test("Konfiguration: Live-Key bei PAYMENTS_MODE=test → CONFIG_ERROR, kein Aufruf", async () => {
  const stub = createStripeStub();
  await assertProviderError(
    () => new StripePaymentProvider({ secretKey: "sk_live_abc", mode: "test", fetchFn: stub.fetchFn }),
    "CONFIG_ERROR",
  );
  await assertProviderError(
    () => new StripePaymentProvider({ secretKey: "rk_live_abc", mode: "test", fetchFn: stub.fetchFn }),
    "CONFIG_ERROR",
  );
  assertEquals(stub.calls.length, 0);
});

Deno.test("Konfiguration: Test-Key bei live, fehlender oder fremder Key → CONFIG_ERROR", async () => {
  const stub = createStripeStub();
  for (const [key, mode] of [
    ["sk_test_abc", "live"],
    ["rk_test_abc", "live"],
    [undefined, "test"],
    ["", "test"],
    ["pk_test_abc", "test"],
    ["whsec_abc", "test"],
  ] as const) {
    await assertProviderError(
      () => new StripePaymentProvider({ secretKey: key, mode, fetchFn: stub.fetchFn }),
      "CONFIG_ERROR",
      `${key} / ${mode}`,
    );
  }
  assertEquals(stub.calls.length, 0);
});

Deno.test("Konfiguration: rk_test_ im Testmodus ist erlaubt", () => {
  new StripePaymentProvider({ secretKey: "rk_test_abc", mode: "test", fetchFn: createStripeStub().fetchFn });
});

// --- Webhooks --------------------------------------------------------------

Deno.test("Webhook: gültige Signatur (generateTestHeaderStringAsync)", async () => {
  const { provider } = setup();
  const { rawBody, signature } = await signStripeEvent({
    id: "evt_test_ok",
    type: "account.updated",
    account: fx.active.id,
    object: fx.active,
  });
  const ev = await provider.verifyWebhook(rawBody, signature, TEST_WEBHOOK_SECRET);
  assertEquals([ev.id, ev.type, ev.accountRef, ev.livemode], ["evt_test_ok", "account.updated", fx.active.id, false]);
});

Deno.test("Webhook: falsche Signatur → INVALID_SIGNATURE", async () => {
  const { provider } = setup();
  const { rawBody } = await signStripeEvent({ type: "account.updated", account: fx.active.id, object: fx.active });
  const { signature: foreign } = await signStripeEvent({
    type: "account.updated",
    account: fx.active.id,
    object: fx.active,
    secret: "whsec_fremd",
  });
  await assertProviderError(() => provider.verifyWebhook(rawBody, foreign, TEST_WEBHOOK_SECRET), "INVALID_SIGNATURE");
  await assertProviderError(() => provider.verifyWebhook(rawBody, "", TEST_WEBHOOK_SECRET), "INVALID_SIGNATURE");
  await assertProviderError(() => provider.verifyWebhook(rawBody, "t=1,v1=abc", TEST_WEBHOOK_SECRET), "INVALID_SIGNATURE");
});

Deno.test("Webhook: Zeitstempel älter als 5 Minuten → INVALID_SIGNATURE", async () => {
  const { provider } = setup();
  const { rawBody, signature } = await signStripeEvent({
    type: "account.updated",
    account: fx.active.id,
    object: fx.active,
    timestamp: Math.floor(Date.now() / 1000) - 600,
  });
  await assertProviderError(() => provider.verifyWebhook(rawBody, signature, TEST_WEBHOOK_SECRET), "INVALID_SIGNATURE");
});

Deno.test("Webhook: Live-Event bei PAYMENTS_MODE=test → LIVEMODE_MISMATCH", async () => {
  const { provider } = setup("test");
  const { rawBody, signature } = await signStripeEvent({
    type: "account.updated",
    account: fx.active.id,
    object: fx.active,
    livemode: true,
  });
  await assertProviderError(() => provider.verifyWebhook(rawBody, signature, TEST_WEBHOOK_SECRET), "LIVEMODE_MISMATCH");
});

Deno.test("Webhook: Test-Event bei PAYMENTS_MODE=live → LIVEMODE_MISMATCH", async () => {
  const { provider } = setup("live");
  const { rawBody, signature } = await signStripeEvent({
    type: "account.updated",
    account: fx.active.id,
    object: fx.active,
    livemode: false,
  });
  await assertProviderError(() => provider.verifyWebhook(rawBody, signature, TEST_WEBHOOK_SECRET), "LIVEMODE_MISMATCH");
});

Deno.test("Webhook: fehlendes oder fremdes Secret → CONFIG_ERROR", async () => {
  const { provider } = setup();
  const { rawBody, signature } = await signStripeEvent({ type: "account.updated", account: null, object: fx.active });
  await assertProviderError(() => provider.verifyWebhook(rawBody, signature, ""), "CONFIG_ERROR");
  await assertProviderError(() => provider.verifyWebhook(rawBody, signature, "sk_test_abc"), "CONFIG_ERROR");
});

// --- toDomainEvent ---------------------------------------------------------

Deno.test("toDomainEvent: account.updated → provider_account.updated aus dem Event-Objekt", async () => {
  const { provider } = setup();
  const { rawBody, signature } = await signStripeEvent({
    id: "evt_test_acc",
    type: "account.updated",
    account: fx.submittedCurrentlyDue.id,
    object: fx.submittedCurrentlyDue,
  });
  const d = provider.toDomainEvent(await provider.verifyWebhook(rawBody, signature, TEST_WEBHOOK_SECRET));
  assertEquals(d, {
    type: "provider_account.updated",
    id: "evt_test_acc",
    accountRef: fx.submittedCurrentlyDue.id,
    livemode: false,
    payload: {
      ref: fx.submittedCurrentlyDue.id,
      livemode: false,
      status: "action_required",
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: true,
      requirementsPending: true,
      requirementsDueAt: null,
      capabilities: { card: "pending" },
    },
  });
});

Deno.test("toDomainEvent: payment_intent.succeeded → null (bis 2.2)", async () => {
  const { provider } = setup();
  const { rawBody, signature } = await signStripeEvent({
    type: "payment_intent.succeeded",
    account: fx.active.id,
    object: { id: "pi_test_1", object: "payment_intent", amount: 1500 },
  });
  assertEquals(provider.toDomainEvent(await provider.verifyWebhook(rawBody, signature, TEST_WEBHOOK_SECRET)), null);
});

Deno.test("toDomainEvent: account.updated mit fremdem Konto im Objekt → INVALID_EVENT", async () => {
  const { provider } = setup();
  const { rawBody, signature } = await signStripeEvent({
    type: "account.updated",
    account: "acct_anderes",
    object: fx.active,
  });
  const ev = await provider.verifyWebhook(rawBody, signature, TEST_WEBHOOK_SECRET);
  await assertProviderError(() => provider.toDomainEvent(ev), "INVALID_EVENT");
});

Deno.test("toDomainEvent: account.updated mit kaputtem Objekt → INVALID_EVENT", async () => {
  const { provider } = setup();
  await assertProviderError(
    () =>
      provider.toDomainEvent({
        id: "evt_x",
        type: "account.updated",
        accountRef: null,
        livemode: false,
        payload: { id: "pi_1" },
      }),
    "INVALID_EVENT",
  );
});

// --- Onboarding ------------------------------------------------------------

Deno.test("Onboarding-Sitzung: nur client_secret und Ablauf, Komponente account_onboarding", async () => {
  const stub = createStripeStub();
  const s = await createOnboardingSession(
    { secretKey: TEST_SECRET_KEY, mode: "test", fetchFn: stub.fetchFn },
    "acct_stub000001",
  );
  assertEquals(s, { clientSecret: "accs_secret_stub", expiresAt: 1_900_000_000 });
  const p = Object.fromEntries(stub.calls[0].params.entries());
  assertEquals(p, { account: "acct_stub000001", "components[account_onboarding][enabled]": "true" });
});

Deno.test("Onboarding-Sitzung: Live-Key im Testmodus → CONFIG_ERROR, kein Aufruf", async () => {
  const stub = createStripeStub();
  await assertProviderError(
    () => createOnboardingSession({ secretKey: "sk_live_x", mode: "test", fetchFn: stub.fetchFn }, "acct_1"),
    "CONFIG_ERROR",
  );
  assertEquals(stub.calls.length, 0);
});
