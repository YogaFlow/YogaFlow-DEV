import { connectedAccountIdempotencyKey } from "../port.ts";
import { assert, assertEquals, assertProviderError, definePortContract } from "../port_contract.ts";
import {
  isV2CoreAccountEventType,
  mapPaymentIntentStatus,
  StripePaymentProvider,
  toStatementDescriptor,
} from "./adapter.ts";
import * as fx from "./fixtures/accounts.ts";
import * as pfx from "./fixtures/payment_intents.ts";
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

function setup(
  mode: "test" | "live" = "test",
  stubOptions: Parameters<typeof createStripeStub>[0] = {},
  logger?: { lines: string[]; info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void; error: (...a: unknown[]) => void },
) {
  const stub = createStripeStub(stubOptions);
  const key = mode === "test" ? TEST_SECRET_KEY : "sk_live_omlify_unit_test";
  const provider = new StripePaymentProvider({
    secretKey: key,
    mode,
    fetchFn: stub.fetchFn,
    logger,
  });
  return { stub, provider };
}

function spyLogger() {
  const lines: string[] = [];
  const write = (...args: unknown[]) => {
    lines.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };
  return { lines, info: write, warn: write, error: write };
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

Deno.test("createConnectedAccount: statement_descriptor aus Studionamen", async () => {
  const { stub, provider } = setup();
  await provider.createConnectedAccount(TENANT, connectedAccountIdempotencyKey(TENANT), {
    statementDescriptor: "Yoga-Studio Müller & Co.",
  });
  const body = stub.calls[0].jsonBody as {
    configuration?: { merchant?: { statement_descriptor?: { descriptor?: string } } };
  };
  assertEquals(
    body.configuration?.merchant?.statement_descriptor?.descriptor,
    toStatementDescriptor("Yoga-Studio Müller & Co."),
  );
  assertEquals(toStatementDescriptor("Yoga-Studio Müller & Co."), "Yoga Studio Muller Co");
  assert(
    (toStatementDescriptor("Yoga-Studio Müller & Co.") ?? "").length <= 22,
    "max 22 Zeichen",
  );
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

Deno.test("toDomainEvent: payment_intent.* → payment.updated ohne Status", async () => {
  const { provider } = setup();
  for (const type of ["payment_intent.succeeded", "payment_intent.payment_failed", "payment_intent.canceled"]) {
    const { rawBody, signature } = await signStripeEvent({
      type,
      account: fx.active.id,
      object: { id: "pi_test_1", object: "payment_intent", amount: 1500, status: "succeeded" },
    });
    assertEquals(provider.toDomainEvent(await provider.verifyWebhook(rawBody, signature, TEST_WEBHOOK_SECRET)), {
      type: "payment.updated",
      accountRef: fx.active.id,
      ref: "pi_test_1",
      livemode: false,
    });
  }
});

Deno.test("toDomainEvent: unbekannter Typ → null", async () => {
  const { provider } = setup();
  const { rawBody, signature } = await signStripeEvent({
    type: "charge.succeeded",
    account: fx.active.id,
    object: { id: "ch_test_1", object: "charge" },
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

// --- Zahlung (2.2a-2) ------------------------------------------------------

const ACCOUNT = "acct_pay_test_1";
const ATTEMPT = "00000000-0000-4000-8000-00000000a771";
const REG = "00000000-0000-4000-8000-00000000a772";
const TENANT_PAY = "00000000-0000-4000-8000-00000000a770";

Deno.test("Q4 mapPaymentIntentStatus: alle Stripe-Status", () => {
  assertEquals(mapPaymentIntentStatus(pfx.piSucceeded), { status: "succeeded" });
  assertEquals(mapPaymentIntentStatus(pfx.piProcessing), { status: "processing" });
  assertEquals(mapPaymentIntentStatus(pfx.piRequiresAction), {
    status: "requires_action",
    clientSecret: pfx.piRequiresAction.client_secret,
  });
  assertEquals(mapPaymentIntentStatus(pfx.piRequiresPaymentMethodFailed), {
    status: "failed",
    failureCode: "card_declined",
  });
  assertEquals(mapPaymentIntentStatus(pfx.piCanceled), { status: "canceled" });
});

Deno.test("createPaymentIntent: Direct Charge, Metadaten, Idempotency, ohne confirm", async () => {
  const { stub, provider } = setup();
  const { ref } = await provider.createPaymentIntent({
    accountRef: ACCOUNT,
    amountCents: 1800,
    currency: "EUR",
    attemptId: ATTEMPT,
    tenantId: TENANT_PAY,
    registrationId: REG,
    subjectType: "registration",
    subjectId: REG,
    idempotencyKey: ATTEMPT,
  });
  assert(ref.startsWith("pi_"), "pi_ ref");
  assertEquals(stub.calls.length, 1);
  const call = stub.calls[0];
  assertEquals([call.method, call.path, call.stripeAccount, call.idempotencyKey], [
    "POST",
    "/v1/payment_intents",
    ACCOUNT,
    ATTEMPT,
  ]);
  assertEquals(call.params.get("amount"), "1800");
  assertEquals(call.params.get("currency"), "eur");
  assertEquals(call.params.get("payment_method_types[0]"), "card");
  assertEquals(call.params.get("description"), "Omlify Kursbuchung");
  assertEquals(call.params.get("metadata[attempt_id]"), ATTEMPT);
  assertEquals(call.params.get("metadata[tenant_id]"), TENANT_PAY);
  assertEquals(call.params.get("metadata[registration_id]"), REG);
  assertEquals(call.params.get("metadata[subject_type]"), "registration");
  assertEquals(call.params.get("metadata[subject_id]"), REG);
  assertEquals(call.params.get("confirm"), null);
});

Deno.test("createPaymentIntent: Kartenkauf Beschreibung und Metadaten", async () => {
  const { stub, provider } = setup();
  const productId = "00000000-0000-4000-8000-00000000c799";
  const { ref } = await provider.createPaymentIntent({
    accountRef: ACCOUNT,
    amountCents: 12000,
    currency: "EUR",
    attemptId: ATTEMPT,
    tenantId: TENANT_PAY,
    subjectType: "pass_product",
    subjectId: productId,
    idempotencyKey: `${ATTEMPT}-pass`,
  });
  assert(ref.startsWith("pi_"), "pi_ ref");
  const call = stub.calls[0];
  assertEquals(call.params.get("description"), "Omlify Kartenkauf");
  assertEquals(call.params.get("metadata[subject_type]"), "pass_product");
  assertEquals(call.params.get("metadata[subject_id]"), productId);
  assertEquals(call.params.get("metadata[registration_id]"), null);
});

Deno.test("confirmPaymentIntent: stripeAccount, Ablehnung → failed ohne Wurf", async () => {
  const { stub, provider } = setup("test", { confirmOutcome: "decline" });
  stub.seedPayment({
    id: "pi_stub_decline",
    object: "payment_intent",
    amount: 1800,
    currency: "eur",
    status: "requires_payment_method",
    livemode: false,
    client_secret: "pi_stub_decline_secret",
    metadata: {},
    description: "Omlify Kursbuchung",
    last_payment_error: null,
    latest_charge: null,
  });
  const result = await provider.confirmPaymentIntent({
    accountRef: ACCOUNT,
    ref: "pi_stub_decline",
    confirmationToken: "ctoken_secret_never_log",
    returnUrl: "https://demo.omlify-dev.de/pay/return",
  });
  assertEquals(result, { status: "failed", failureCode: "card_declined" });
  assertEquals(stub.calls[0].stripeAccount, ACCOUNT);
  assertEquals(stub.calls[0].params.get("confirmation_token"), "ctoken_secret_never_log");
});

Deno.test("confirmPaymentIntent: requires_action liefert client_secret nur dann", async () => {
  const log = spyLogger();
  const { stub, provider } = setup("test", { confirmOutcome: "requires_action" }, log);
  stub.seedPayment({
    id: "pi_stub_3ds",
    object: "payment_intent",
    amount: 1800,
    currency: "eur",
    status: "requires_payment_method",
    livemode: false,
    client_secret: "pi_stub_3ds_secret",
    metadata: {},
    description: null,
    last_payment_error: null,
    latest_charge: null,
  });
  const result = await provider.confirmPaymentIntent({
    accountRef: ACCOUNT,
    ref: "pi_stub_3ds",
    confirmationToken: "ctoken_3ds_never_log",
    returnUrl: "https://demo.omlify-dev.de/pay/return",
  });
  assertEquals(result.status, "requires_action");
  assert(typeof result.clientSecret === "string" && result.clientSecret.length > 0, "clientSecret");
  const joined = log.lines.join("\n");
  assert(!joined.includes("client_secret") && !joined.includes(result.clientSecret!), "kein client_secret im Log");
  assert(!joined.includes("ctoken_3ds_never_log"), "kein Confirmation Token im Log");
  assert(!joined.includes(ACCOUNT), "kein acct_ im Log");
});

Deno.test("confirmPaymentIntent: 5xx → PROVIDER_UNAVAILABLE", async () => {
  const { stub, provider } = setup("test", { confirmOutcome: "network_5xx" });
  stub.seedPayment({
    id: "pi_stub_5xx",
    object: "payment_intent",
    amount: 1800,
    currency: "eur",
    status: "requires_payment_method",
    livemode: false,
    client_secret: null,
    metadata: {},
    description: null,
    last_payment_error: null,
    latest_charge: null,
  });
  await assertProviderError(
    () =>
      provider.confirmPaymentIntent({
        accountRef: ACCOUNT,
        ref: "pi_stub_5xx",
        confirmationToken: "ctoken_x",
        returnUrl: "https://example.test/r",
      }),
    "PROVIDER_UNAVAILABLE",
  );
});

Deno.test("confirmPaymentIntent: Rate-Limit → RATE_LIMITED", async () => {
  const { stub, provider } = setup("test", { confirmOutcome: "rate_limit" });
  stub.seedPayment({
    id: "pi_stub_rl",
    object: "payment_intent",
    amount: 1800,
    currency: "eur",
    status: "requires_payment_method",
    livemode: false,
    client_secret: null,
    metadata: {},
    description: null,
    last_payment_error: null,
    latest_charge: null,
  });
  await assertProviderError(
    () =>
      provider.confirmPaymentIntent({
        accountRef: ACCOUNT,
        ref: "pi_stub_rl",
        confirmationToken: "ctoken_x",
        returnUrl: "https://example.test/r",
      }),
    "RATE_LIMITED",
  );
});

Deno.test("retrievePayment: Expand latest_charge, receivedAt, stripeAccount", async () => {
  const { stub, provider } = setup();
  stub.seedPayment({
    id: pfx.piSucceeded.id,
    object: "payment_intent",
    amount: pfx.piSucceeded.amount,
    currency: "eur",
    status: "succeeded",
    livemode: false,
    client_secret: pfx.piSucceeded.client_secret,
    metadata: { ...pfx.piSucceeded.metadata },
    description: "Omlify Kursbuchung",
    last_payment_error: null,
    latest_charge: { ...pfx.piSucceeded.latest_charge },
  });
  const got = await provider.retrievePayment(ACCOUNT, pfx.piSucceeded.id);
  assertEquals(got.status, "succeeded");
  assertEquals(got.amountCents, 1800);
  assertEquals(got.currency, "EUR");
  assertEquals(got.attemptId, "att_1");
  assertEquals(got.receivedAt, new Date(1_700_000_000 * 1000).toISOString());
  assertEquals(stub.calls[0].stripeAccount, ACCOUNT);
  assert(!("clientSecret" in got), "kein clientSecret in retrieve");
});

Deno.test("refundPayment: Teilbetrag, Idempotency = refund_id, Metadata", async () => {
  const { stub, provider } = setup();
  stub.seedPayment({
    id: "pi_stub_refund",
    object: "payment_intent",
    amount: 1800,
    currency: "eur",
    status: "succeeded",
    livemode: false,
    client_secret: null,
    metadata: {},
    description: null,
    last_payment_error: null,
    latest_charge: null,
  });
  const refundId = "00000000-0000-4000-8000-00000000r099";
  const paymentId = "00000000-0000-4000-8000-00000000p099";
  const tenantId = "00000000-0000-4000-8000-00000000t099";
  const a = await provider.refundPayment({
    accountRef: ACCOUNT,
    ref: "pi_stub_refund",
    amountCents: 1000,
    refundId,
    idempotencyKey: refundId,
    tenantId,
    paymentId,
  });
  const b = await provider.refundPayment({
    accountRef: ACCOUNT,
    ref: "pi_stub_refund",
    amountCents: 1000,
    refundId,
    idempotencyKey: refundId,
    tenantId,
    paymentId,
  });
  assertEquals(a.refundRef, b.refundRef);
  assertEquals(a.status, "succeeded");
  assertEquals(a.amountCents, 1000);
  assertEquals(stub.calls[0].stripeAccount, ACCOUNT);
  assertEquals(stub.calls[0].idempotencyKey, refundId);
  assertEquals(stub.calls[0].params.get("payment_intent"), "pi_stub_refund");
  assertEquals(stub.calls[0].params.get("amount"), "1000");
  assertEquals(stub.calls[0].params.get("metadata[refund_id]"), refundId);
  assertEquals(stub.calls[0].params.get("metadata[tenant_id]"), tenantId);
  assertEquals(stub.calls[0].params.get("metadata[payment_id]"), paymentId);
});

Deno.test("cancelPaymentIntent: schon erfolgreich → Status zurück, kein Fehler", async () => {
  const { stub, provider } = setup("test", { cancelAlreadyFinal: "succeeded" });
  stub.seedPayment({
    id: "pi_stub_done",
    object: "payment_intent",
    amount: 1800,
    currency: "eur",
    status: "succeeded",
    livemode: false,
    client_secret: null,
    metadata: {},
    description: null,
    last_payment_error: null,
    latest_charge: { id: "ch_x", object: "charge", created: 1_700_000_000, amount: 1800 },
  });
  const got = await provider.cancelPaymentIntent(ACCOUNT, "pi_stub_done");
  assertEquals(got.status, "succeeded");
  assert(stub.calls.some((c) => c.path.includes("/cancel")), "cancel versucht");
  assert(stub.calls.some((c) => c.method === "GET" && c.path.endsWith("/pi_stub_done")), "retrieve nach Fehler");
});

Deno.test("registerPaymentDomain: neu und already_registered", async () => {
  const { stub, provider } = setup();
  assertEquals(
    await provider.registerPaymentDomain(ACCOUNT, "demo.omlify-dev.de"),
    { status: "registered" },
  );
  assertEquals(stub.calls[0].stripeAccount, ACCOUNT);
  assertEquals(stub.calls[0].params.get("domain_name"), "demo.omlify-dev.de");
  assertEquals(
    await provider.registerPaymentDomain(ACCOUNT, "demo.omlify-dev.de"),
    { status: "already_registered" },
  );
});

Deno.test("Zahlungsaufrufe setzen stripeAccount (Spion)", async () => {
  const { stub, provider } = setup();
  const { ref } = await provider.createPaymentIntent({
    accountRef: ACCOUNT,
    amountCents: 900,
    currency: "EUR",
    attemptId: ATTEMPT,
    tenantId: TENANT_PAY,
    registrationId: REG,
    subjectType: "registration",
    subjectId: REG,
    idempotencyKey: "idem-spy",
  });
  await provider.confirmPaymentIntent({
    accountRef: ACCOUNT,
    ref,
    confirmationToken: "ctoken_spy",
    returnUrl: "https://example.test/r",
  });
  await provider.retrievePayment(ACCOUNT, ref);
  await provider.refundPayment({
    accountRef: ACCOUNT,
    ref,
    amountCents: 900,
    refundId: "00000000-0000-4000-8000-00000000r0spy",
    idempotencyKey: "00000000-0000-4000-8000-00000000r0spy",
    tenantId: TENANT_PAY,
    paymentId: "00000000-0000-4000-8000-00000000p0spy",
  });
  await provider.registerPaymentDomain(ACCOUNT, "spy.example.test");
  const paymentCalls = stub.calls.filter((c) =>
    c.path.includes("payment_intent") || c.path.includes("refunds") || c.path.includes("payment_method_domains")
  );
  assert(paymentCalls.length >= 5, "Zahlungsaufrufe");
  for (const c of paymentCalls) {
    assertEquals(c.stripeAccount, ACCOUNT, `${c.method} ${c.path}`);
  }
});
