/**
 * Deno-Tests für payments-checkout (2.2a-3). Fake-Adapter + DB-Stub, kein Netz.
 */
import { FakePaymentProvider } from "../_shared/payments/fake/adapter.ts";
import { ProviderError } from "../_shared/payments/port.ts";
import { assert, assertEquals } from "../_shared/payments/port_contract.ts";
import {
  buildPaymentReturnUrl,
  handleCheckout,
  type AttemptStatusView,
  type AttachResult,
  type CheckResult,
  type CheckoutDeps,
  type CheckoutStore,
  type CompleteResult,
  type MarkFailedResult,
  type PrepareResult,
} from "./handler.ts";

const TENANT = "00000000-0000-4000-8000-00000000c701";
const MEMBER = "00000000-0000-4000-8000-00000000c702";
const OTHER = "00000000-0000-4000-8000-00000000c703";
const REG = "00000000-0000-4000-8000-00000000c710";
const PRODUCT = "00000000-0000-4000-8000-00000000c711";
const ATTEMPT = "00000000-0000-4000-8000-00000000c720";
const ACCOUNT = "acct_fake_checkout_1";
const CORS = { "Access-Control-Allow-Origin": "*" };
const CALLER = { tenantId: TENANT, memberId: MEMBER };
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

class MemoryStore implements CheckoutStore {
  prepareResult: PrepareResult = {
    ok: true,
    attemptId: ATTEMPT,
    amountCents: 2400,
    currency: "EUR",
    accountRef: ACCOUNT,
    providerRef: null,
    holdExpiresAt: "2026-10-01T12:00:00.000Z",
    livemode: false,
    registrationId: REG,
    subjectType: "registration",
    subjectId: REG,
  };
  attachCalls: { attemptId: string; providerRef: string }[] = [];
  checkCalls: string[] = [];
  completeCalls: unknown[] = [];
  markFailedCalls: { providerRef: string; failureCode: string }[] = [];
  passPrepareCalls: { productId: string; hashes: [string, string] }[] = [];
  view: AttemptStatusView | null = {
    attemptId: ATTEMPT,
    registrationId: REG,
    subjectType: "registration",
    subjectId: REG,
    providerRef: null,
    attemptStatus: "initiated",
    registrationStatus: "pending_payment",
    amountCents: 2400,
    currency: "EUR",
    livemode: false,
    accountRef: ACCOUNT,
  };
  checkResult: CheckResult = { ok: true };
  completeResult: CompleteResult = { ok: true, code: "COMPLETED" };
  sequence: string[] = [];

  prepareOnlinePayment(registrationId: string, userId: string): Promise<PrepareResult> {
    this.sequence.push("prepare");
    if (userId !== MEMBER) return Promise.resolve({ ok: false, code: "FORBIDDEN" });
    if (registrationId !== REG && this.prepareResult.ok) {
      return Promise.resolve({ ok: false, code: "FORBIDDEN" });
    }
    return Promise.resolve(structuredClone(this.prepareResult));
  }

  preparePassOnlinePayment(
    productId: string,
    userId: string,
    immediateUseHash: string,
    withdrawalInfoHash: string,
  ): Promise<PrepareResult> {
    this.sequence.push("prepare_pass");
    this.passPrepareCalls.push({ productId, hashes: [immediateUseHash, withdrawalInfoHash] });
    if (userId !== MEMBER) return Promise.resolve({ ok: false, code: "FORBIDDEN" });
    if (productId !== PRODUCT && this.prepareResult.ok) {
      return Promise.resolve({ ok: false, code: "NOT_PURCHASABLE" });
    }
    if (this.prepareResult.ok && this.prepareResult.subjectType === "pass_product") {
      return Promise.resolve(structuredClone(this.prepareResult));
    }
    const passResult: PrepareResult = {
      ok: true,
      attemptId: ATTEMPT,
      amountCents: 12000,
      currency: "EUR",
      accountRef: ACCOUNT,
      providerRef: null,
      holdExpiresAt: "2026-10-01T12:30:00.000Z",
      livemode: false,
      registrationId: null,
      subjectType: "pass_product",
      subjectId: productId,
    };
    this.prepareResult = passResult;
    this.view = {
      attemptId: ATTEMPT,
      registrationId: null,
      subjectType: "pass_product",
      subjectId: productId,
      providerRef: null,
      attemptStatus: "initiated",
      registrationStatus: null,
      amountCents: 12000,
      currency: "EUR",
      livemode: false,
      accountRef: ACCOUNT,
    };
    return Promise.resolve(structuredClone(passResult));
  }

  attachPaymentRef(attemptId: string, providerRef: string): Promise<AttachResult> {
    this.sequence.push("attach");
    this.attachCalls.push({ attemptId, providerRef });
    if (this.view) {
      this.view = { ...this.view, providerRef, attemptStatus: "initiated" };
    }
    if (this.prepareResult.ok) {
      this.prepareResult = { ...this.prepareResult, providerRef };
    }
    return Promise.resolve({ ok: true, providerRef });
  }

  checkBeforeConfirm(attemptId: string, userId: string): Promise<CheckResult> {
    this.sequence.push("check");
    this.checkCalls.push(attemptId);
    if (userId !== MEMBER) return Promise.resolve({ ok: false, code: "FORBIDDEN" });
    return Promise.resolve(structuredClone(this.checkResult));
  }

  completeOnlinePayment(input: {
    providerRef: string;
    amountCents: number;
    currency: string;
    receivedAt: string;
    livemode: boolean;
  }): Promise<CompleteResult> {
    this.sequence.push("complete");
    this.completeCalls.push(input);
    if (this.view) {
      this.view = {
        ...this.view,
        attemptStatus: "succeeded",
        registrationStatus: this.view.subjectType === "registration" ? "registered" : null,
      };
    }
    return Promise.resolve(structuredClone(this.completeResult));
  }

  markOnlinePaymentFailed(providerRef: string, failureCode: string): Promise<MarkFailedResult> {
    this.sequence.push("mark_failed");
    this.markFailedCalls.push({ providerRef, failureCode });
    if (this.view) this.view = { ...this.view, attemptStatus: "failed" };
    return Promise.resolve({ ok: true });
  }

  getAttemptForMember(
    attemptId: string,
    memberId: string,
    tenantId: string,
  ): Promise<AttemptStatusView | null> {
    this.sequence.push("get_attempt");
    if (memberId !== MEMBER || tenantId !== TENANT) return Promise.resolve(null);
    if (!this.view || this.view.attemptId !== attemptId) return Promise.resolve(null);
    return Promise.resolve(structuredClone(this.view));
  }
}

class SpyProvider extends FakePaymentProvider {
  createCalls = 0;
  confirmCalls = 0;
  cancelCalls: string[] = [];
  retrieveCalls = 0;
  sequence: string[] = [];

  override createPaymentIntent(
    cmd: Parameters<FakePaymentProvider["createPaymentIntent"]>[0],
  ) {
    this.createCalls += 1;
    this.sequence.push("createPaymentIntent");
    return super.createPaymentIntent(cmd);
  }

  override confirmPaymentIntent(
    cmd: Parameters<FakePaymentProvider["confirmPaymentIntent"]>[0],
  ) {
    this.confirmCalls += 1;
    this.sequence.push("confirmPaymentIntent");
    return super.confirmPaymentIntent(cmd);
  }

  override cancelPaymentIntent(accountRef: string, ref: string) {
    this.cancelCalls.push(ref);
    this.sequence.push("cancelPaymentIntent");
    return super.cancelPaymentIntent(accountRef, ref);
  }

  override retrievePayment(accountRef: string, ref: string) {
    this.retrieveCalls += 1;
    this.sequence.push("retrievePayment");
    return super.retrievePayment(accountRef, ref);
  }

  domainFails = false;

  override registerPaymentDomain(accountRef: string, domain: string) {
    if (this.domainFails) return Promise.reject(new ProviderError("PROVIDER_UNAVAILABLE"));
    return super.registerPaymentDomain(accountRef, domain);
  }
}

function setup() {
  const provider = new SpyProvider();
  const store = new MemoryStore();
  const logLines: string[] = [];
  const deps: CheckoutDeps = {
    provider,
    store,
    log: {
      info: (...a) => logLines.push(JSON.stringify(a)),
      warn: (...a) => logLines.push(JSON.stringify(a)),
      error: (...a) => logLines.push(JSON.stringify(a)),
    },
    errorResponse: (status, code, message) =>
      new Response(JSON.stringify({ error: message, code }), {
        status,
        headers: { ...CORS, "Content-Type": "application/json" },
      }),
    corsHeaders: CORS,
    appBaseDomain: "omlify-dev.de",
    tenantSlug: "demoalpha",
  };
  return { provider, store, logLines, deps };
}

function post(body: Record<string, unknown>): Request {
  return new Request("https://dev.example.test/functions/v1/payments-checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return await res.json();
}

Deno.test("buildPaymentReturnUrl: Subdomain und lokal mit tenant", () => {
  assertEquals(
    buildPaymentReturnUrl("demoalpha", "omlify-dev.de"),
    "https://demoalpha.omlify-dev.de/my-registrations?payment=return",
  );
  assertEquals(
    buildPaymentReturnUrl("demoalpha", "localhost:5173"),
    "http://demoalpha.localhost:5173/my-registrations?payment=return&tenant=demoalpha",
  );
});

Deno.test("Checkout prepare: neuer Versuch → create + attach", async () => {
  const s = setup();
  const res = await handleCheckout(post({ action: "prepare", registration_id: REG }), CALLER, s.deps);
  assertEquals(res.status, 200);
  const body = await readJson(res);
  assertEquals(body.attempt_id, ATTEMPT);
  assertEquals(body.amount_cents, 2400);
  assertEquals(body.account_ref, ACCOUNT);
  assertEquals(typeof body.client_secret, "undefined");
  assertEquals(s.provider.createCalls, 1);
  assertEquals(s.store.attachCalls.length, 1);
  assertEquals(s.store.attachCalls[0].attemptId, ATTEMPT);
  assert(s.store.attachCalls[0].providerRef.startsWith("pi_"), "pi_");
  const domains = s.provider.paymentCalls
    .filter((c) => c.method === "registerPaymentDomain")
    .map((c) => ("domain" in c ? c.domain : null));
  assertEquals(domains, ["demoalpha.omlify-dev.de"]);
  assert(!s.logLines.join("\n").includes("acct_"), "kein acct_");
});

Deno.test("Checkout prepare: Domain-Fehler bricht die Zahlung nicht ab", async () => {
  const s = setup();
  s.provider.domainFails = true;
  const res = await handleCheckout(post({ action: "prepare", registration_id: REG }), CALLER, s.deps);
  assertEquals(res.status, 200);
  assertEquals((await readJson(res)).attempt_id, ATTEMPT);
  assert(s.logLines.join("\n").includes("DOMAIN_FAILED"), "Domain-Fehler geloggt");
});

Deno.test("Checkout prepare: zweiter Aufruf → kein zweiter PaymentIntent", async () => {
  const s = setup();
  assertEquals((await handleCheckout(post({ action: "prepare", registration_id: REG }), CALLER, s.deps)).status, 200);
  const firstPi = s.store.attachCalls[0].providerRef;
  s.provider.createCalls = 0;
  s.store.attachCalls = [];
  // prepare liefert jetzt denselben Versuch inkl. provider_ref
  const res = await handleCheckout(post({ action: "prepare", registration_id: REG }), CALLER, s.deps);
  assertEquals(res.status, 200);
  assertEquals(s.provider.createCalls, 0);
  assertEquals(s.store.attachCalls.length, 0);
  assertEquals((await readJson(res)).attempt_id, ATTEMPT);
  assertEquals(firstPi.startsWith("pi_"), true);
});

Deno.test("Checkout prepare: ruft kein cancelPaymentIntent mehr (J9 / W2)", async () => {
  const s = setup();
  const res = await handleCheckout(post({ action: "prepare", registration_id: REG }), CALLER, s.deps);
  assertEquals(res.status, 200);
  assertEquals(s.provider.cancelCalls, []);
  assertEquals(s.provider.createCalls, 1);
});

Deno.test("Checkout prepare: fremde Buchung → 403, kein Stripe", async () => {
  const s = setup();
  const res = await handleCheckout(
    post({ action: "prepare", registration_id: REG }),
    { tenantId: TENANT, memberId: OTHER },
    s.deps,
  );
  assertEquals(res.status, 403);
  assertEquals((await readJson(res)).code, "FORBIDDEN");
  assertEquals(s.provider.createCalls, 0);
});

Deno.test("Checkout confirm: check vor confirm, dann complete", async () => {
  const s = setup();
  assertEquals((await handleCheckout(post({ action: "prepare", registration_id: REG }), CALLER, s.deps)).status, 200);
  s.store.sequence = [];
  s.provider.sequence = [];
  const res = await handleCheckout(
    post({ action: "confirm", attempt_id: ATTEMPT, confirmation_token: "ctoken_ok" }),
    CALLER,
    s.deps,
  );
  assertEquals(res.status, 200);
  assertEquals((await readJson(res)).status, "succeeded");
  assertEquals(s.store.checkCalls, [ATTEMPT]);
  assertEquals(s.provider.confirmCalls, 1);
  assertEquals(s.store.completeCalls.length, 1);
  const combined = [...s.store.sequence, ...s.provider.sequence];
  const checkIdx = combined.indexOf("check");
  const confirmIdx = combined.indexOf("confirmPaymentIntent");
  assert(checkIdx >= 0 && confirmIdx > checkIdx, `Reihenfolge check vor confirm: ${combined.join(",")}`);
});

Deno.test("Checkout confirm: HOLD_EXPIRED → kein Stripe", async () => {
  const s = setup();
  s.store.checkResult = { ok: false, code: "HOLD_EXPIRED" };
  s.store.view = {
    attemptId: ATTEMPT,
    registrationId: REG,
    subjectType: "registration",
    subjectId: REG,
    providerRef: "pi_existing",
    attemptStatus: "initiated",
    registrationStatus: "pending_payment",
    amountCents: 2400,
    currency: "EUR",
    livemode: false,
    accountRef: ACCOUNT,
  };
  const res = await handleCheckout(
    post({ action: "confirm", attempt_id: ATTEMPT, confirmation_token: "ctoken_x" }),
    CALLER,
    s.deps,
  );
  assertEquals(res.status, 409);
  assertEquals((await readJson(res)).code, "HOLD_EXPIRED");
  assertEquals(s.provider.confirmCalls, 0);
});

Deno.test("Checkout confirm: Ablehnung → CARD_DECLINED + mark_failed", async () => {
  const s = setup();
  assertEquals((await handleCheckout(post({ action: "prepare", registration_id: REG }), CALLER, s.deps)).status, 200);
  s.provider.setPaymentBehavior("decline");
  const res = await handleCheckout(
    post({ action: "confirm", attempt_id: ATTEMPT, confirmation_token: "ctoken_bad" }),
    CALLER,
    s.deps,
  );
  assertEquals(res.status, 400);
  assertEquals((await readJson(res)).code, "CARD_DECLINED");
  assertEquals(s.store.markFailedCalls.length, 1);
  assertEquals(s.store.markFailedCalls[0].failureCode, "CARD_DECLINED");
  assertEquals(s.store.completeCalls.length, 0);
});

Deno.test("Checkout confirm: 3-D-Secure → client_secret, kein complete", async () => {
  const s = setup();
  assertEquals((await handleCheckout(post({ action: "prepare", registration_id: REG }), CALLER, s.deps)).status, 200);
  s.provider.setPaymentBehavior("requires_action");
  const res = await handleCheckout(
    post({ action: "confirm", attempt_id: ATTEMPT, confirmation_token: "ctoken_3ds" }),
    CALLER,
    s.deps,
  );
  assertEquals(res.status, 200);
  const body = await readJson(res);
  assertEquals(body.status, "requires_action");
  assertEquals(typeof body.client_secret, "string");
  assertEquals(s.store.completeCalls.length, 0);
});

Deno.test("Checkout status nach 3DS-Erfolg → complete, registered", async () => {
  const s = setup();
  assertEquals((await handleCheckout(post({ action: "prepare", registration_id: REG }), CALLER, s.deps)).status, 200);
  s.provider.setPaymentBehavior("requires_action");
  assertEquals(
    (await handleCheckout(
      post({ action: "confirm", attempt_id: ATTEMPT, confirmation_token: "ctoken_3ds" }),
      CALLER,
      s.deps,
    )).status,
    200,
  );
  s.provider.setPaymentBehavior("succeed");
  // Fake: confirm with succeed updates payment; status retrieves it.
  // Ensure payment is succeeded for retrieve: call confirm again with succeed behavior
  // Or manually - retrieve reads stored status. After requires_action, status is requires_action.
  // Need to mark succeeded in fake - call confirm with succeed.
  s.provider.setPaymentBehavior("succeed");
  await s.provider.confirmPaymentIntent({
    accountRef: ACCOUNT,
    ref: s.store.view!.providerRef!,
    confirmationToken: "ctoken_finish",
    returnUrl: "https://example.test",
  });
  s.store.completeCalls = [];
  const res = await handleCheckout(post({ action: "status", attempt_id: ATTEMPT }), CALLER, s.deps);
  assertEquals(res.status, 200);
  const body = await readJson(res);
  assertEquals(body.registration_status, "registered");
  assertEquals(body.attempt_status, "succeeded");
  assertEquals(s.store.completeCalls.length, 1);
});

Deno.test("Checkout: Stripe nicht erreichbar → 503, Versuch unverändert", async () => {
  const s = setup();
  s.provider.setPaymentBehavior("provider_unavailable");
  const res = await handleCheckout(post({ action: "prepare", registration_id: REG }), CALLER, s.deps);
  assertEquals(res.status, 503);
  assertEquals((await readJson(res)).code, "PROVIDER_UNAVAILABLE");
  assertEquals(s.store.attachCalls.length, 0);
  assertEquals(s.store.view?.attemptStatus, "initiated");
});

Deno.test("Checkout confirm: return_url aus Body wird ignoriert", async () => {
  const s = setup();
  assertEquals((await handleCheckout(post({ action: "prepare", registration_id: REG }), CALLER, s.deps)).status, 200);
  const evil = "https://evil.example/steal";
  const res = await handleCheckout(
    post({
      action: "confirm",
      attempt_id: ATTEMPT,
      confirmation_token: "ctoken_ok",
      return_url: evil,
    }),
    CALLER,
    s.deps,
  );
  assertEquals(res.status, 200);
  const calls = JSON.stringify(s.provider.paymentCalls);
  assert(!calls.includes(evil), "evil return_url nicht an Provider");
  assertEquals(
    buildPaymentReturnUrl("demoalpha", "omlify-dev.de"),
    "https://demoalpha.omlify-dev.de/my-registrations?payment=return",
  );
});

Deno.test("Checkout Logger: kein client_secret, Token, acct_", async () => {
  const s = setup();
  assertEquals((await handleCheckout(post({ action: "prepare", registration_id: REG }), CALLER, s.deps)).status, 200);
  s.provider.setPaymentBehavior("requires_action");
  await handleCheckout(
    post({ action: "confirm", attempt_id: ATTEMPT, confirmation_token: "ctoken_secret_xyz" }),
    CALLER,
    s.deps,
  );
  const all = s.logLines.join("\n");
  assert(!all.includes("client_secret"), "kein client_secret");
  assert(!all.includes("ctoken_secret_xyz"), "kein Token");
  assert(!/\bacct_[A-Za-z0-9_]+\b/.test(all), "kein acct_");
});

Deno.test("Checkout: unbekannte action → 400", async () => {
  const s = setup();
  const res = await handleCheckout(post({ action: "pay" }), CALLER, s.deps);
  assertEquals(res.status, 400);
  assertEquals((await readJson(res)).code, "INVALID_REQUEST");
});

Deno.test("Checkout prepare pass: product_id + Hashes → expires_at als hold_expires_at", async () => {
  const s = setup();
  const res = await handleCheckout(
    post({
      action: "prepare",
      product_id: PRODUCT,
      immediate_use_hash: HASH_A,
      withdrawal_info_hash: HASH_B,
    }),
    CALLER,
    s.deps,
  );
  assertEquals(res.status, 200);
  const body = await readJson(res);
  assertEquals(body.attempt_id, ATTEMPT);
  assertEquals(body.amount_cents, 12000);
  assertEquals(body.hold_expires_at, "2026-10-01T12:30:00.000Z");
  assertEquals(body.subject_type, "pass_product");
  assertEquals(body.subject_id, PRODUCT);
  assertEquals(s.store.passPrepareCalls.length, 1);
  assertEquals(s.provider.createCalls, 1);
  assertEquals(s.store.attachCalls.length, 1);
});

Deno.test("Checkout prepare pass: ohne Consent-Hashes → CONSENT_REQUIRED", async () => {
  const s = setup();
  const res = await handleCheckout(
    post({ action: "prepare", product_id: PRODUCT }),
    CALLER,
    s.deps,
  );
  assertEquals(res.status, 400);
  assertEquals((await readJson(res)).code, "CONSENT_REQUIRED");
  assertEquals(s.provider.createCalls, 0);
});

Deno.test("buildPaymentReturnUrl: my-passes für Kartenkauf", () => {
  assertEquals(
    buildPaymentReturnUrl("demoalpha", "omlify-dev.de", "my-passes"),
    "https://demoalpha.omlify-dev.de/my-passes?payment=return",
  );
});

Deno.test("16. confirm liefert code; REFUND_REQUIRED wird durchgereicht", async () => {
  const s = setup();
  assertEquals((await handleCheckout(post({ action: "prepare", registration_id: REG }), CALLER, s.deps)).status, 200);
  s.store.completeResult = { ok: true, code: "REFUND_REQUIRED" };
  const res = await handleCheckout(
    post({ action: "confirm", attempt_id: ATTEMPT, confirmation_token: "ctoken_ok" }),
    CALLER,
    s.deps,
  );
  assertEquals(res.status, 200);
  const body = await readJson(res);
  assertEquals(body.status, "succeeded");
  assertEquals(body.code, "REFUND_REQUIRED");
});
