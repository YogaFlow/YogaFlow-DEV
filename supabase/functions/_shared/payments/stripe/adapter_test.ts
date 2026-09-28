import { connectedAccountIdempotencyKey } from "../port.ts";
import { assert, assertEquals, assertProviderError, definePortContract } from "../port_contract.ts";
import { isV2CoreAccountEventType, StripePaymentProvider } from "./adapter.ts";
import * as fx from "./fixtures/accounts.ts";
import { createOnboardingSession } from "./onboarding.ts";
import { STRIPE_API_VERSION } from "./sdk.ts";
import {
  createStripeStub,
  signStripeEvent,
  signStripeThinEvent,
  TEST_SECRET_KEY,
  TEST_WEBHOOK_SECRET,
  TEST_WEBHOOK_SECRET_THIN,
} from "./test_support.ts";

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

Deno.test("createConnectedAccount: P7 neu v2, DE, nur card_payments, kein transfers", async () => {
  const { stub, provider } = setup();
  await provider.createConnectedAccount(TENANT, connectedAccountIdempotencyKey(TENANT));

  assertEquals(stub.calls.length, 1);
  const call = stub.calls[0];
  assertEquals([call.method, call.path], ["POST", "/v2/core/accounts"]);
  assertEquals(call.idempotencyKey, `acct-create-${TENANT}`);
  assert(call.jsonBody !== null, "JSON-Body erwartet");
  const body = call.jsonBody as Record<string, unknown>;
  assertEquals(body.dashboard, "full");
  assertEquals(body.identity, { country: "DE" });
  assertEquals(body.defaults, {
    responsibilities: { fees_collector: "stripe", losses_collector: "stripe" },
  });
  assertEquals(body.configuration, {
    merchant: { capabilities: { card_payments: { requested: true } } },
  });
  assertEquals(body.metadata, { omlify_tenant_id: TENANT });
  assertEquals(body.include, ["configuration.merchant", "requirements", "identity"]);
  const raw = JSON.stringify(body);
  assert(!raw.includes("transfers"), "kein transfers");
  assert(!raw.includes("stripe_transfers"), "kein stripe_transfers");
  assert(!raw.includes('"customer"'), "keine customer-Konfiguration");
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

Deno.test("getAccountState: Pfad /v2/core/accounts und include", async () => {
  const { stub, provider } = setup();
  const { ref } = await provider.createConnectedAccount(TENANT, connectedAccountIdempotencyKey(TENANT));
  stub.calls.length = 0;
  await provider.getAccountState(ref);
  assertEquals(stub.calls.length, 1);
  assertEquals([stub.calls[0].method, stub.calls[0].path], ["GET", `/v2/core/accounts/${ref}`]);
  const includes = stub.calls[0].query.getAll("include[0]")
    .concat(stub.calls[0].query.getAll("include[1]"))
    .concat(stub.calls[0].query.getAll("include[2]"));
  // SDK kann include[0]=… oder wiederholte include=… senden.
  const all = [
    ...stub.calls[0].query.getAll("include"),
    ...includes,
  ];
  for (const need of ["configuration.merchant", "requirements", "identity"]) {
    assert(all.includes(need) || [...stub.calls[0].query.keys()].some((k) =>
      stub.calls[0].query.get(k) === need
    ), `include enthält ${need}: ${stub.calls[0].query.toString()}`);
  }
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

// --- Webhooks Snapshot -----------------------------------------------------

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

// --- Thin-Events -----------------------------------------------------------

Deno.test("Thin: gültige Signatur → ProviderEvent ohne Stripe-Typ nach außen", async () => {
  const { provider } = setup();
  const { rawBody, signature } = await signStripeThinEvent(fx.thinRequirementsUpdated);
  const ev = await provider.verifyWebhook(rawBody, signature, TEST_WEBHOOK_SECRET_THIN);
  assertEquals(
    [ev.id, ev.type, ev.accountRef, ev.livemode],
    ["evt_thin_requirements", "v2.core.account[requirements].updated", fx.active.id, false],
  );
  assertEquals(typeof (ev.payload as { related_object?: unknown }).related_object, "object");
});

Deno.test("Thin: falsche Signatur → INVALID_SIGNATURE", async () => {
  const { provider } = setup();
  const { rawBody } = await signStripeThinEvent(fx.thinAccountUpdated);
  const { signature: foreign } = await signStripeThinEvent(fx.thinAccountUpdated, { secret: "whsec_fremd" });
  await assertProviderError(
    () => provider.verifyWebhook(rawBody, foreign, TEST_WEBHOOK_SECRET_THIN),
    "INVALID_SIGNATURE",
  );
});

Deno.test("isV2CoreAccountEventType: account… ja, account_link/person/ping nein", () => {
  assert(isV2CoreAccountEventType("v2.core.account.updated"), "account.updated");
  assert(isV2CoreAccountEventType("v2.core.account[requirements].updated"), "requirements");
  assert(
    isV2CoreAccountEventType("v2.core.account[configuration.merchant].capability_status_updated"),
    "merchant capability",
  );
  assert(!isV2CoreAccountEventType("v2.core.account_link.returned"), "account_link");
  assert(!isV2CoreAccountEventType("v2.core.account_person.created"), "account_person");
  assert(!isV2CoreAccountEventType("v2.core.event_destination.ping"), "ping");
});

// --- toDomainEvent ---------------------------------------------------------

Deno.test("toDomainEvent: account.updated → provider_account.updated ohne Snapshot-Payload", async () => {
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
  });
});

Deno.test("toDomainEvent: Thin-Kontoereignis → provider_account.updated", async () => {
  const { provider } = setup();
  const { rawBody, signature } = await signStripeThinEvent(fx.thinMerchantCapabilityUpdated);
  const d = provider.toDomainEvent(await provider.verifyWebhook(rawBody, signature, TEST_WEBHOOK_SECRET_THIN));
  assertEquals(d, {
    type: "provider_account.updated",
    id: "evt_thin_merchant_cap",
    accountRef: fx.active.id,
    livemode: false,
  });
});

Deno.test("toDomainEvent: Thin-Ping → null (ohne Wirkung)", async () => {
  const { provider } = setup();
  const { rawBody, signature } = await signStripeThinEvent(fx.thinPing);
  assertEquals(provider.toDomainEvent(await provider.verifyWebhook(rawBody, signature, TEST_WEBHOOK_SECRET_THIN)), null);
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

Deno.test("toDomainEvent: account.updated ohne account → INVALID_EVENT", async () => {
  const { provider } = setup();
  await assertProviderError(
    () =>
      provider.toDomainEvent({
        id: "evt_x",
        type: "account.updated",
        accountRef: null,
        livemode: false,
        payload: {},
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
  assertEquals(stub.calls[0].path, "/v1/account_sessions");
});

Deno.test("Onboarding-Sitzung: Live-Key im Testmodus → CONFIG_ERROR, kein Aufruf", async () => {
  const stub = createStripeStub();
  await assertProviderError(
    () => createOnboardingSession({ secretKey: "sk_live_x", mode: "test", fetchFn: stub.fetchFn }, "acct_1"),
    "CONFIG_ERROR",
  );
  assertEquals(stub.calls.length, 0);
});
