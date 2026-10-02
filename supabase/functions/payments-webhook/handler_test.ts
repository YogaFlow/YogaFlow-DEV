import { envFromRecord } from "../_shared/payments/config.ts";
import { FAKE_WEBHOOK_SECRET, FakePaymentProvider } from "../_shared/payments/fake/adapter.ts";
import { assert, assertEquals } from "../_shared/payments/port_contract.ts";
import { type ProviderAccountState, ProviderError } from "../_shared/payments/port.ts";
import { StripePaymentProvider } from "../_shared/payments/stripe/adapter.ts";
import * as fx from "../_shared/payments/stripe/fixtures/accounts.ts";
import {
  createStripeStub,
  signStripeThinEvent,
  TEST_SECRET_KEY,
  TEST_WEBHOOK_SECRET_THIN,
} from "../_shared/payments/stripe/test_support.ts";
import {
  handleWebhook,
  MAX_BODY_BYTES,
  readWebhookSecrets,
  type CompletePaymentResult,
  type MarkDisconnectedResult,
  type MarkFailedPaymentResult,
  type PaymentAttemptLookup,
  type PaymentLookup,
  type RecordEventInput,
  type RecordEventResult,
  type UpsertAccountResult,
  type WebhookDeps,
  type WebhookStore,
} from "./handler.ts";
import * as piFx from "../_shared/payments/stripe/fixtures/payment_intents.ts";

const TENANT = "00000000-0000-4000-8000-0000000014a1";
const PAYMENT = "00000000-0000-4000-8000-00000000p001";
const REFUND_A = "00000000-0000-4000-8000-00000000r0a1";
const SECOND_SECRET = "whsec_fake_omlify_rotation";

interface Row {
  id: string;
  eventId: string;
  eventType: string;
  accountRef: string | null;
  tenantId: string | null;
  livemode: boolean;
  processedAt: string | null;
  processingError: string | null;
  attempts: number;
}

class MemoryStore implements WebhookStore {
  readonly rows = new Map<string, Row>();
  /** provider_accounts: provider_ref â tenant_id */
  readonly accounts = new Map<string, string>();
  readonly upserts: { tenantId: string; state: ProviderAccountState }[] = [];
  readonly disconnects: string[] = [];
  upsertResult: UpsertAccountResult = { ok: true };
  disconnectResult: MarkDisconnectedResult = { ok: true, changed: true };
  writes = 0;
  private counter = 0;

  recordEvent(input: RecordEventInput): Promise<RecordEventResult> {
    this.writes += 1;
    const existing = this.rows.get(input.eventId);
    if (existing) {
      if (existing.livemode !== input.livemode) return Promise.resolve({ ok: false, code: "LIVEMODE_MISMATCH" });
      return Promise.resolve({
        ok: true,
        id: existing.id,
        tenantId: existing.tenantId,
        duplicate: true,
        alreadyProcessed: existing.processedAt !== null,
      });
    }
    this.counter += 1;
    const row: Row = {
      id: `row-${this.counter}`,
      eventId: input.eventId,
      eventType: input.eventType,
      accountRef: input.accountRef,
      tenantId: input.accountRef ? this.accounts.get(input.accountRef) ?? null : null,
      livemode: input.livemode,
      processedAt: null,
      processingError: null,
      attempts: 0,
    };
    this.rows.set(input.eventId, row);
    return Promise.resolve({ ok: true, id: row.id, tenantId: row.tenantId, duplicate: false, alreadyProcessed: false });
  }

  markProcessed(id: string, errorCode: string | null): Promise<void> {
    this.writes += 1;
    const row = this.byId(id);
    row.processedAt = new Date().toISOString();
    row.processingError = errorCode;
    row.attempts += 1;
    return Promise.resolve();
  }

  markFailed(id: string): Promise<void> {
    this.writes += 1;
    this.byId(id).attempts += 1;
    return Promise.resolve();
  }

  upsertAccount(tenantId: string, _provider: string, state: ProviderAccountState): Promise<UpsertAccountResult> {
    this.writes += 1;
    this.upserts.push({ tenantId, state: structuredClone(state) });
    return Promise.resolve(this.upsertResult);
  }

  markDisconnected(_provider: string, accountRef: string): Promise<MarkDisconnectedResult> {
    this.writes += 1;
    this.disconnects.push(accountRef);
    return Promise.resolve(this.disconnectResult);
  }

  /** provider_ref → attempt lookup */
  attempts = new Map<string, { attemptId: string; tenantId: string; studioAccountRef: string | null }>();
  /** provider_ref (pi_) → payment lookup */
  payments = new Map<string, { paymentId: string; tenantId: string; studioAccountRef: string | null }>();
  completes: unknown[] = [];
  refunds: unknown[] = [];
  markRefundFailedCalls: unknown[] = [];
  disputes: unknown[] = [];
  markFailedCalls: { providerRef: string; failureCode: string; status?: string }[] = [];
  completeResult: CompletePaymentResult = { ok: true, code: "COMPLETED" };
  completeSequence: CompletePaymentResult[] = [];
  refundResult: { ok: true; code: string | null } = { ok: true, code: "REFUNDED" };

  findPaymentAttempt(_provider: string, providerRef: string): Promise<PaymentAttemptLookup> {
    this.writes += 1;
    const row = this.attempts.get(providerRef);
    if (!row) return Promise.resolve({ found: false });
    return Promise.resolve({ found: true, ...row });
  }

  findPaymentByProviderRef(_provider: string, providerRef: string): Promise<PaymentLookup> {
    this.writes += 1;
    const row = this.payments.get(providerRef);
    if (!row) return Promise.resolve({ found: false });
    return Promise.resolve({ found: true, ...row });
  }

  completeOnlinePayment(input: {
    providerRef: string;
    amountCents: number;
    currency: string;
    receivedAt: string;
    livemode: boolean;
  }): Promise<CompletePaymentResult> {
    this.writes += 1;
    this.completes.push(input);
    if (this.completeSequence.length > 0) {
      return Promise.resolve(this.completeSequence.shift()!);
    }
    return Promise.resolve(structuredClone(this.completeResult));
  }

  markOnlinePaymentFailed(
    providerRef: string,
    failureCode: string,
    status?: string,
  ): Promise<MarkFailedPaymentResult> {
    this.writes += 1;
    this.markFailedCalls.push({ providerRef, failureCode, status });
    return Promise.resolve({ ok: true });
  }

  recordOnlineRefund(input: {
    paymentId: string;
    refundRef: string;
    amountCents: number;
    receivedAt: string;
    refundId: string | null;
  }) {
    this.writes += 1;
    this.refunds.push(input);
    return Promise.resolve(structuredClone(this.refundResult));
  }

  markRefundFailed(input: {
    refundId: string | null;
    refundRef: string | null;
    failureCode: string;
  }) {
    this.writes += 1;
    this.markRefundFailedCalls.push(input);
    return Promise.resolve({ ok: true as const });
  }

  recordPaymentDispute(input: {
    paymentId: string;
    providerRef: string;
    amountCents: number;
    status: string;
  }) {
    this.writes += 1;
    this.disputes.push(input);
    return Promise.resolve({ ok: true as const });
  }

  only(): Row {
    assertEquals(this.rows.size, 1, "genau eine Rohzeile");
    return [...this.rows.values()][0];
  }

  private byId(id: string): Row {
    const row = [...this.rows.values()].find((r) => r.id === id);
    if (!row) throw new Error(`Zeile ${id} fehlt`);
    return row;
  }
}

class SpyProvider extends FakePaymentProvider {
  getAccountStateCalls = 0;
  unavailable = false;
  retrieveUnavailable = false;
  listRefundsUnavailable = false;
  retrieveOverride: import("../_shared/payments/port.ts").RetrievedPayment | null = null;

  override getAccountState(ref: string): Promise<ProviderAccountState> {
    this.getAccountStateCalls += 1;
    if (this.unavailable) return Promise.reject(new ProviderError("PROVIDER_UNAVAILABLE", "StripeConnectionError"));
    return super.getAccountState(ref);
  }

  override retrievePayment(accountRef: string, ref: string) {
    if (this.retrieveUnavailable) {
      return Promise.reject(new ProviderError("PROVIDER_UNAVAILABLE", "StripeConnectionError"));
    }
    if (this.retrieveOverride) {
      return Promise.resolve({ ...this.retrieveOverride, ref });
    }
    return super.retrievePayment(accountRef, ref);
  }

  override listRefunds(accountRef: string, paymentRef: string) {
    if (this.listRefundsUnavailable) {
      return Promise.reject(new ProviderError("PROVIDER_UNAVAILABLE", "StripeConnectionError"));
    }
    return super.listRefunds(accountRef, paymentRef);
  }
}

class SpyLogger {
  readonly lines: string[] = [];
  private write = (...args: unknown[]) => {
    this.lines.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };
  info = this.write;
  warn = this.write;
  error = this.write;
}

interface Setup {
  provider: SpyProvider;
  store: MemoryStore;
  log: SpyLogger;
  deps: WebhookDeps;
}

function setup(env: Record<string, string> = {}): Setup {
  const provider = new SpyProvider();
  const store = new MemoryStore();
  const log = new SpyLogger();
  const deps: WebhookDeps = {
    env: envFromRecord({ PAYMENTS_MODE: "test", STRIPE_WEBHOOK_SECRET: FAKE_WEBHOOK_SECRET, ...env }),
    getProvider: () => provider,
    getStore: () => store,
    log,
  };
  return { provider, store, log, deps };
}

function post(body: string, signature?: string, headers: Record<string, string> = {}): Request {
  return new Request("https://dev.example.test/functions/v1/payments-webhook", {
    method: "POST",
    headers: signature === undefined ? headers : { ...headers, "stripe-signature": signature },
    body,
  });
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return await res.json();
}

/** Studio mit verbundenem Konto; event trÃ¤gt den Stand zum Zeitpunkt des Baus. */
async function connectedAccount(s: Setup): Promise<string> {
  const { ref } = await s.provider.createConnectedAccount(TENANT, `acct-create-${TENANT}`);
  s.store.accounts.set(ref, TENANT);
  return ref;
}

async function signed(s: Setup, body: string, secret = FAKE_WEBHOOK_SECRET): Promise<Request> {
  return post(body, await s.provider.signWebhook(body, secret));
}

Deno.test("Webhook: ungÃ¼ltige Signatur â 400, keine DB-Schreibung", async () => {
  const s = setup();
  const ref = await connectedAccount(s);
  const body = s.provider.buildEvent("account.updated", ref);
  const res = await handleWebhook(await signed(s, body, "whsec_falsch"), s.deps);
  assertEquals(res.status, 400);
  assertEquals(await readJson(res), { code: "INVALID_SIGNATURE" });
  assertEquals(s.store.writes, 0, "keine Schreibung");
  assertEquals(s.store.rows.size, 0);
});

Deno.test("Webhook: GET â 405", async () => {
  const s = setup();
  const res = await handleWebhook(new Request("https://dev.example.test/", { method: "GET" }), s.deps);
  assertEquals(res.status, 405);
  assertEquals(s.store.writes, 0);
});

Deno.test("Webhook: Body Ã¼ber 1 MB â 413 (Content-Length und Stream)", async () => {
  const s = setup();
  const big = "x".repeat(MAX_BODY_BYTES + 1);

  const withLength = await handleWebhook(
    post(big, "t=1,v1=00", { "content-length": String(MAX_BODY_BYTES + 1) }),
    s.deps,
  );
  assertEquals(withLength.status, 413);

  const streamed = new Request("https://dev.example.test/", {
    method: "POST",
    headers: { "stripe-signature": "t=1,v1=00" },
    body: new Blob([big]).stream(),
  });
  const res = await handleWebhook(streamed, s.deps);
  assertEquals(res.status, 413);
  assertEquals(s.store.writes, 0);
});

Deno.test("Webhook: fehlender Header stripe-signature â 400", async () => {
  const s = setup();
  const ref = await connectedAccount(s);
  const res = await handleWebhook(post(s.provider.buildEvent("account.updated", ref)), s.deps);
  assertEquals(res.status, 400);
  assertEquals(await readJson(res), { code: "MISSING_SIGNATURE" });
  assertEquals(s.store.writes, 0);
});

Deno.test("Webhook: Konfiguration fehlt â 500 CONFIG_ERROR", async () => {
  const cases: Record<string, string>[] = [
    { PAYMENTS_MODE: "" },
    { STRIPE_WEBHOOK_SECRET: "" },
    { STRIPE_WEBHOOK_SECRET: "kein_whsec" },
  ];
  for (const env of cases) {
    const s = setup(env);
    const res = await handleWebhook(post("{}", "t=1,v1=00"), s.deps);
    assertEquals(res.status, 500, JSON.stringify(env));
    assertEquals(await readJson(res), { code: "CONFIG_ERROR" });
    assertEquals(s.store.writes, 0);
  }
});

Deno.test("Webhook: account.updated mit bekanntem Studio â Stand nachgelesen, upsert, verarbeitet", async () => {
  const s = setup();
  const ref = await connectedAccount(s);
  // Event trÃ¤gt den alten Stand (in_progress); beim Anbieter ist das Konto inzwischen bereit.
  const body = s.provider.buildEvent("account.updated", ref);
  s.provider.activateAccount(ref);

  const res = await handleWebhook(await signed(s, body), s.deps);
  assertEquals(res.status, 200);
  assertEquals(await readJson(res), { received: true });
  assertEquals(s.provider.getAccountStateCalls, 1, "getAccountState einmal");
  assertEquals(s.store.upserts.length, 1);
  const { tenantId, state } = s.store.upserts[0];
  assertEquals(tenantId, TENANT);
  assertEquals(
    [state.ref, state.status, state.chargesEnabled, state.payoutsEnabled, state.detailsSubmitted, state.livemode],
    [ref, "active", true, true, true, false],
  );
  assertEquals(state.capabilities, { card: "active" });

  const row = s.store.only();
  assert(row.processedAt !== null, "verarbeitet");
  assertEquals([row.processingError, row.attempts, row.tenantId], [null, 1, TENANT]);
});

Deno.test("Webhook: dasselbe Event zweimal â beim zweiten Mal kein Nachlesen, 200", async () => {
  const s = setup();
  const ref = await connectedAccount(s);
  const body = s.provider.buildEvent("account.updated", ref);

  assertEquals((await handleWebhook(await signed(s, body), s.deps)).status, 200);
  const second = await handleWebhook(await signed(s, body), s.deps);
  assertEquals(second.status, 200);
  assertEquals(await readJson(second), { received: true });
  assertEquals(s.provider.getAccountStateCalls, 1, "kein zweites Nachlesen");
  assertEquals(s.store.upserts.length, 1);
  assertEquals(s.store.only().attempts, 1);
});

Deno.test("Webhook: frÃ¼herer Fehlschlag (nicht verarbeitet) â wird erneut verarbeitet", async () => {
  const s = setup();
  const ref = await connectedAccount(s);
  const body = s.provider.buildEvent("account.updated", ref);

  s.provider.unavailable = true;
  assertEquals((await handleWebhook(await signed(s, body), s.deps)).status, 500);
  let row = s.store.only();
  assertEquals([row.processedAt, row.attempts], [null, 1]);

  s.provider.unavailable = false;
  const res = await handleWebhook(await signed(s, body), s.deps);
  assertEquals(res.status, 200);
  row = s.store.only();
  assert(row.processedAt !== null, "jetzt verarbeitet");
  assertEquals([row.processingError, row.attempts], [null, 2]);
  assertEquals(s.provider.getAccountStateCalls, 2);
  assertEquals(s.store.upserts.length, 1);
});

Deno.test("Webhook: Studio unbekannt â TENANT_NOT_RESOLVED, 200, kein Nachlesen", async () => {
  const s = setup();
  const { ref } = await s.provider.createConnectedAccount(TENANT, "k-unbekannt");
  const res = await handleWebhook(await signed(s, s.provider.buildEvent("account.updated", ref)), s.deps);
  assertEquals(res.status, 200);
  assertEquals(await readJson(res), { received: true });
  assertEquals(s.provider.getAccountStateCalls, 0);
  assertEquals(s.store.upserts.length, 0);
  const row = s.store.only();
  assert(row.processedAt !== null, "abschlieÃend behandelt");
  assertEquals([row.tenantId, row.processingError], [null, "TENANT_NOT_RESOLVED"]);
});

Deno.test("Webhook: upsert liefert ACCOUNT_TENANT_MISMATCH â Code gespeichert, 200", async () => {
  const s = setup();
  const ref = await connectedAccount(s);
  s.store.upsertResult = { ok: false, code: "ACCOUNT_TENANT_MISMATCH" };
  const res = await handleWebhook(await signed(s, s.provider.buildEvent("account.updated", ref)), s.deps);
  assertEquals(res.status, 200);
  const row = s.store.only();
  assert(row.processedAt !== null, "verarbeitet");
  assertEquals(row.processingError, "ACCOUNT_TENANT_MISMATCH");
});

Deno.test("Webhook: Anbieter beim Nachlesen nicht erreichbar â mark_provider_event_failed, 500", async () => {
  const s = setup();
  const ref = await connectedAccount(s);
  s.provider.unavailable = true;
  const res = await handleWebhook(await signed(s, s.provider.buildEvent("account.updated", ref)), s.deps);
  assertEquals(res.status, 500);
  assertEquals(await readJson(res), { code: "PROVIDER_UNAVAILABLE" });
  const row = s.store.only();
  assertEquals([row.processedAt, row.processingError, row.attempts], [null, null, 1]);
  assertEquals(s.store.upserts.length, 0);
});

Deno.test("Webhook: payment_intent.succeeded â verarbeitet ohne Wirkung, 200", async () => {
  const s = setup();
  const ref = await connectedAccount(s);
  const res = await handleWebhook(await signed(s, s.provider.buildEvent("payment_intent.succeeded", ref)), s.deps);
  assertEquals(res.status, 200);
  assertEquals(s.provider.getAccountStateCalls, 0);
  assertEquals(s.store.upserts.length, 0);
  const row = s.store.only();
  assert(row.processedAt !== null, "verarbeitet");
  assertEquals([row.eventType, row.processingError, row.tenantId], ["payment_intent.succeeded", null, TENANT]);
});

Deno.test("Webhook: zweites Secret (Rotation) passt â 200", async () => {
  const s = setup({ STRIPE_WEBHOOK_SECRET: "whsec_fake_omlify_alt", STRIPE_WEBHOOK_SECRET_2: SECOND_SECRET });
  const ref = await connectedAccount(s);
  const res = await handleWebhook(await signed(s, s.provider.buildEvent("account.updated", ref), SECOND_SECRET), s.deps);
  assertEquals(res.status, 200);
  assertEquals(s.store.upserts.length, 1);
});

Deno.test("Webhook: livemode passt nicht â 400, nichts gespeichert", async () => {
  // Adapter lehnt ein Live-Event im Testmodus ab.
  const s = setup();
  const ref = await connectedAccount(s);
  const live = s.provider.buildEvent("account.updated", ref, { livemode: true });
  const res = await handleWebhook(await signed(s, live), s.deps);
  assertEquals(res.status, 400);
  assertEquals(await readJson(res), { code: "LIVEMODE_MISMATCH" });

  // Eigene PrÃ¼fung der Function: Testevent bei PAYMENTS_MODE=live.
  const l = setup({ PAYMENTS_MODE: "live" });
  const ref2 = await connectedAccount(l);
  const res2 = await handleWebhook(await signed(l, l.provider.buildEvent("account.updated", ref2)), l.deps);
  assertEquals(res2.status, 400);
  assertEquals(await readJson(res2), { code: "LIVEMODE_MISMATCH" });

  assertEquals(s.store.writes + l.store.writes, 0);
});

Deno.test("Webhook: Logger bekommt weder Payload noch Signatur", async () => {
  const s = setup();
  const ref = await connectedAccount(s);
  const body = s.provider.buildEvent("account.updated", ref);
  const signature = await s.provider.signWebhook(body);
  const eventId = JSON.parse(body).id as string;

  await handleWebhook(post(body, signature), s.deps);
  await handleWebhook(post(body, signature), s.deps);
  await handleWebhook(await signed(s, body, "whsec_falsch"), s.deps);
  s.provider.unavailable = true;
  await handleWebhook(await signed(s, s.provider.buildEvent("account.updated", ref)), s.deps);

  assert(s.log.lines.length >= 4, "es wurde geloggt");
  const all = s.log.lines.join("\n");
  for (const forbidden of [body, signature, signature.split("v1=")[1], ref, FAKE_WEBHOOK_SECRET, "capabilities", "chargesEnabled"]) {
    assert(!all.includes(forbidden), `Log enthÃ¤lt verbotenen Inhalt: ${forbidden.slice(0, 20)}`);
  }
  assert(all.includes(eventId), "Event-ID steht im Log");
  assert(all.includes("account.updated"), "Event-Typ steht im Log");
});

Deno.test("Webhook: account.application.deauthorized bekannt â markDisconnected, 200", async () => {
  const s = setup();
  const ref = await connectedAccount(s);
  const res = await handleWebhook(
    await signed(s, s.provider.buildEvent("account.application.deauthorized", ref)),
    s.deps,
  );
  assertEquals(res.status, 200);
  assertEquals(s.store.disconnects, [ref]);
  assertEquals(s.provider.getAccountStateCalls, 0);
  assertEquals(s.store.upserts.length, 0);
  const row = s.store.only();
  assert(row.processedAt !== null, "verarbeitet");
  assertEquals(row.processingError, null);
});

Deno.test("Webhook: account.application.deauthorized unbekannt â NOT_FOUND in Rohzeile, 200", async () => {
  const s = setup();
  const { ref } = await s.provider.createConnectedAccount(TENANT, "k-deauth-unknown");
  s.store.disconnectResult = { ok: false, code: "NOT_FOUND" };
  const res = await handleWebhook(
    await signed(s, s.provider.buildEvent("account.application.deauthorized", ref)),
    s.deps,
  );
  assertEquals(res.status, 200);
  assertEquals(s.store.disconnects, [ref]);
  const row = s.store.only();
  assert(row.processedAt !== null, "abschlieÃend behandelt");
  assertEquals(row.processingError, "NOT_FOUND");
});

Deno.test("Webhook: account.updated reicht requirementsPending und requirementsDueAt weiter", async () => {
  const s = setup();
  const ref = await connectedAccount(s);
  const dueAt = "2026-10-15T12:00:00.000Z";
  s.provider.setAccountState(ref, {
    status: "active",
    chargesEnabled: true,
    payoutsEnabled: true,
    detailsSubmitted: true,
    requirementsPending: true,
    requirementsDueAt: dueAt,
    capabilities: { card: "active" },
  });
  const res = await handleWebhook(await signed(s, s.provider.buildEvent("account.updated", ref)), s.deps);
  assertEquals(res.status, 200);
  assertEquals(s.store.upserts.length, 1);
  assertEquals(s.store.upserts[0].state.requirementsPending, true);
  assertEquals(s.store.upserts[0].state.requirementsDueAt, dueAt);
});

Deno.test("readWebhookSecrets: _THIN wird mitgelesen", () => {
  assertEquals(
    readWebhookSecrets(envFromRecord({
      STRIPE_WEBHOOK_SECRET: "whsec_a",
      STRIPE_WEBHOOK_SECRET_THIN: "whsec_thin",
    })),
    ["whsec_a", "whsec_thin"],
  );
});

Deno.test("Webhook Thin: gÃ¼ltig â Nachlesen und upsert", async () => {
  const stub = createStripeStub();
  const stripe = new StripePaymentProvider({ secretKey: TEST_SECRET_KEY, mode: "test", fetchFn: stub.fetchFn });
  const { ref } = await stripe.createConnectedAccount(TENANT, `acct-create-${TENANT}`);
  stub.activate(ref);

  const store = new MemoryStore();
  store.accounts.set(ref, TENANT);
  const log = new SpyLogger();
  const deps: WebhookDeps = {
    env: envFromRecord({
      PAYMENTS_MODE: "test",
      STRIPE_WEBHOOK_SECRET: "whsec_unused_snapshot",
      STRIPE_WEBHOOK_SECRET_THIN: TEST_WEBHOOK_SECRET_THIN,
    }),
    getProvider: () => stripe,
    getStore: () => store,
    log,
  };

  const envelope = fx.thinAccountEvent("v2.core.account[requirements].updated", ref, { id: "evt_thin_handler" });
  const { rawBody, signature } = await signStripeThinEvent(envelope);
  const res = await handleWebhook(post(rawBody, signature), deps);
  assertEquals(res.status, 200);
  assertEquals(store.upserts.length, 1);
  assertEquals(store.upserts[0].state.status, "active");
  const row = store.only();
  assertEquals(row.eventType, "v2.core.account[requirements].updated");
  assertEquals(row.processingError, null);
  assert(row.processedAt !== null, "verarbeitet");
});

Deno.test("Webhook Thin: falsche Signatur â 400", async () => {
  const stub = createStripeStub();
  const stripe = new StripePaymentProvider({ secretKey: TEST_SECRET_KEY, mode: "test", fetchFn: stub.fetchFn });
  const store = new MemoryStore();
  const deps: WebhookDeps = {
    env: envFromRecord({
      PAYMENTS_MODE: "test",
      STRIPE_WEBHOOK_SECRET_THIN: TEST_WEBHOOK_SECRET_THIN,
    }),
    getProvider: () => stripe,
    getStore: () => store,
    log: new SpyLogger(),
  };
  const { rawBody } = await signStripeThinEvent(fx.thinAccountUpdated);
  const { signature: foreign } = await signStripeThinEvent(fx.thinAccountUpdated, { secret: "whsec_fremd" });
  const res = await handleWebhook(post(rawBody, foreign), deps);
  assertEquals(res.status, 400);
  assertEquals(await readJson(res), { code: "INVALID_SIGNATURE" });
  assertEquals(store.writes, 0);
});

Deno.test("Webhook Thin: fremder Typ â ohne Wirkung", async () => {
  const stub = createStripeStub();
  const stripe = new StripePaymentProvider({ secretKey: TEST_SECRET_KEY, mode: "test", fetchFn: stub.fetchFn });
  const store = new MemoryStore();
  const deps: WebhookDeps = {
    env: envFromRecord({
      PAYMENTS_MODE: "test",
      STRIPE_WEBHOOK_SECRET_THIN: TEST_WEBHOOK_SECRET_THIN,
    }),
    getProvider: () => stripe,
    getStore: () => store,
    log: new SpyLogger(),
  };
  const { rawBody, signature } = await signStripeThinEvent(fx.thinPing);
  const res = await handleWebhook(post(rawBody, signature), deps);
  assertEquals(res.status, 200);
  assertEquals(store.upserts.length, 0);
  const row = store.only();
  assertEquals([row.eventType, row.processingError], ["v2.core.event_destination.ping", null]);
});

Deno.test("9. payment.updated succeeded ? complete aus retrievePayment", async () => {
  const s = setup();
  const ref = await connectedAccount(s);
  const pi = "pi_fixture_succeeded";
  s.store.attempts.set(pi, { attemptId: "att1", tenantId: TENANT, studioAccountRef: ref });
  s.provider.retrieveOverride = {
    ref: pi,
    status: "succeeded",
    amountCents: 1800,
    currency: "EUR",
    livemode: false,
    receivedAt: "2026-10-01T10:00:00.000Z",
  };
  const body = JSON.stringify(piFx.evtPiSucceeded(ref));
  const res = await handleWebhook(await signed(s, body), s.deps);
  assertEquals(res.status, 200);
  assertEquals(s.store.completes.length, 1);
  const c = s.store.completes[0] as { amountCents: number; receivedAt: string; providerRef: string };
  assertEquals(c.amountCents, 1800);
  assertEquals(c.receivedAt, "2026-10-01T10:00:00.000Z");
  assertEquals(c.providerRef, pi);
});

Deno.test("10. doppeltes Event (zwei evt_, gleiche pi_) ? zweimal complete, zweites ALREADY_COMPLETED, beide 200", async () => {
  const s = setup();
  const ref = await connectedAccount(s);
  const pi = "pi_fixture_succeeded";
  s.store.attempts.set(pi, { attemptId: "att1", tenantId: TENANT, studioAccountRef: ref });
  s.provider.retrieveOverride = {
    ref: pi,
    status: "succeeded",
    amountCents: 1800,
    currency: "EUR",
    livemode: false,
    receivedAt: "2026-10-01T10:00:00.000Z",
  };
  s.store.completeSequence = [
    { ok: true, code: "COMPLETED" },
    { ok: true, code: "ALREADY_COMPLETED" },
  ];
  const r1 = await handleWebhook(await signed(s, JSON.stringify(piFx.evtPiSucceeded(ref, "evt_a"))), s.deps);
  const r2 = await handleWebhook(await signed(s, JSON.stringify(piFx.evtPiSucceeded(ref, "evt_b"))), s.deps);
  assertEquals(r1.status, 200);
  assertEquals(r2.status, 200);
  assertEquals(s.store.completes.length, 2);
});

Deno.test("11. Fehlversuch ? mark_failed mit Code; canceled ? p_status canceled", async () => {
  const s = setup();
  const ref = await connectedAccount(s);
  const piFail = "pi_fixture_rpm_failed";
  s.store.attempts.set(piFail, { attemptId: "att1", tenantId: TENANT, studioAccountRef: ref });
  s.provider.retrieveOverride = {
    ref: piFail,
    status: "failed",
    amountCents: 1800,
    currency: "EUR",
    livemode: false,
    failureCode: "card_declined",
  };
  let res = await handleWebhook(await signed(s, JSON.stringify(piFx.evtPiFailed(ref))), s.deps);
  assertEquals(res.status, 200);
  assertEquals(s.store.markFailedCalls[0]?.failureCode, "CARD_DECLINED");
  assertEquals(s.store.completes.length, 0);

  const piCan = "pi_fixture_canceled";
  s.store.attempts.set(piCan, { attemptId: "att2", tenantId: TENANT, studioAccountRef: ref });
  s.provider.retrieveOverride = {
    ref: piCan,
    status: "canceled",
    amountCents: 1800,
    currency: "EUR",
    livemode: false,
  };
  res = await handleWebhook(await signed(s, JSON.stringify(piFx.evtPiCanceled(ref))), s.deps);
  assertEquals(res.status, 200);
  assertEquals(s.store.markFailedCalls[1]?.failureCode, "CANCELED");
  assertEquals(s.store.markFailedCalls[1]?.status, "canceled");
});

Deno.test("12. processing ? kein RPC", async () => {
  const s = setup();
  const ref = await connectedAccount(s);
  const pi = "pi_fixture_processing";
  s.store.attempts.set(pi, { attemptId: "att1", tenantId: TENANT, studioAccountRef: ref });
  s.provider.retrieveOverride = {
    ref: pi,
    status: "processing",
    amountCents: 1800,
    currency: "EUR",
    livemode: false,
  };
  const body = JSON.stringify({
    id: "evt_proc",
    type: "payment_intent.succeeded",
    account: ref,
    livemode: false,
    data: { object: piFx.piProcessing },
  });
  const res = await handleWebhook(await signed(s, body), s.deps);
  assertEquals(res.status, 200);
  assertEquals(s.store.completes.length, 0);
  assertEquals(s.store.markFailedCalls.length, 0);
});

Deno.test("13. Konto im Event ? Studio-Konto ? kein RPC, Log account_mismatch, 200", async () => {
  const s = setup();
  const ref = await connectedAccount(s);
  const pi = "pi_fixture_succeeded";
  s.store.attempts.set(pi, {
    attemptId: "att1",
    tenantId: TENANT,
    studioAccountRef: "acct_other_studio",
  });
  const res = await handleWebhook(await signed(s, JSON.stringify(piFx.evtPiSucceeded(ref))), s.deps);
  assertEquals(res.status, 200);
  assertEquals(s.store.completes.length, 0);
  assert(s.log.lines.some((l) => l.includes("account_mismatch")), "Log account_mismatch");
});

Deno.test("14. Unbekannte pi_ + succeeded ? Log payment.orphan, 200", async () => {
  const s = setup();
  const ref = await connectedAccount(s);
  s.provider.retrieveOverride = {
    ref: "pi_fixture_succeeded",
    status: "succeeded",
    amountCents: 1800,
    currency: "EUR",
    livemode: false,
    receivedAt: "2026-10-01T10:00:00.000Z",
  };
  const res = await handleWebhook(await signed(s, JSON.stringify(piFx.evtPiSucceeded(ref))), s.deps);
  assertEquals(res.status, 200);
  assertEquals(s.store.completes.length, 0);
  assert(s.log.lines.some((l) => l.includes("payment.orphan")), "Log orphan");
  // kein acct_ im Log
  assert(!s.log.lines.join("\n").includes("acct_"), "kein acct_");
});

Deno.test("15. Stripe nicht erreichbar ? 500", async () => {
  const s = setup();
  const ref = await connectedAccount(s);
  const pi = "pi_fixture_succeeded";
  s.store.attempts.set(pi, { attemptId: "att1", tenantId: TENANT, studioAccountRef: ref });
  s.provider.retrieveUnavailable = true;
  const res = await handleWebhook(await signed(s, JSON.stringify(piFx.evtPiSucceeded(ref))), s.deps);
  assertEquals(res.status, 500);
  assertEquals(await readJson(res), { code: "PROVIDER_UNAVAILABLE" });
});

function chargeRefundedBody(account: string, pi: string, id = "evt_refund_1") {
  return {
    id,
    type: "charge.refunded",
    account,
    livemode: false,
    data: { object: { id: "ch_1", object: "charge", payment_intent: pi } },
  };
}

function refundFailedBody(account: string, pi: string, re: string, id = "evt_refund_failed") {
  return {
    id,
    type: "refund.failed",
    account,
    livemode: false,
    data: {
      object: {
        id: re,
        object: "refund",
        payment_intent: pi,
        amount: 1000,
        status: "failed",
        metadata: { refund_id: REFUND_A },
      },
    },
  };
}

function disputeBody(
  type: "charge.dispute.created" | "charge.dispute.closed",
  account: string,
  dp: string,
  id = "evt_dispute_1",
) {
  return {
    id,
    type,
    account,
    livemode: false,
    data: { object: { id: dp, object: "dispute", amount: 2400, status: "needs_response" } },
  };
}

Deno.test("16. charge.refunded mit 2 Teil-Erstattungen → zwei record_online_refund", async () => {
  const s = setup();
  const ref = await connectedAccount(s);
  const pi = "pi_refund_two";
  s.store.payments.set(pi, { paymentId: PAYMENT, tenantId: TENANT, studioAccountRef: ref });
  s.provider.seedRefund({
    refundRef: "re_with_meta",
    paymentRef: pi,
    status: "succeeded",
    amountCents: 1000,
    refundId: REFUND_A,
  });
  s.provider.seedRefund({
    refundRef: "re_dashboard",
    paymentRef: pi,
    status: "succeeded",
    amountCents: 1400,
    refundId: null,
  });
  const res = await handleWebhook(await signed(s, JSON.stringify(chargeRefundedBody(ref, pi))), s.deps);
  assertEquals(res.status, 200);
  assertEquals(s.store.refunds.length, 2);
  const a = s.store.refunds[0] as { refundRef: string; refundId: string | null; amountCents: number };
  const b = s.store.refunds[1] as { refundRef: string; refundId: string | null; amountCents: number };
  assertEquals(a.refundRef, "re_with_meta");
  assertEquals(a.refundId, REFUND_A);
  assertEquals(a.amountCents, 1000);
  assertEquals(b.refundRef, "re_dashboard");
  assertEquals(b.refundId, null);
  assertEquals(b.amountCents, 1400);
});

Deno.test("17. Webhook vor Job: ALREADY_REFUNDED → kein zweiter Fehler, 200", async () => {
  const s = setup();
  const ref = await connectedAccount(s);
  const pi = "pi_refund_early";
  s.store.payments.set(pi, { paymentId: PAYMENT, tenantId: TENANT, studioAccountRef: ref });
  s.store.refundResult = { ok: true, code: "ALREADY_REFUNDED" };
  s.provider.seedRefund({
    refundRef: "re_early",
    paymentRef: pi,
    status: "succeeded",
    amountCents: 2400,
    refundId: REFUND_A,
  });
  const res = await handleWebhook(await signed(s, JSON.stringify(chargeRefundedBody(ref, pi, "evt_early"))), s.deps);
  assertEquals(res.status, 200);
  assertEquals(s.store.refunds.length, 1);
  assertEquals((s.store.refunds[0] as { refundId: string }).refundId, REFUND_A);
});

Deno.test("18. refund.failed → mark_refund_failed", async () => {
  const s = setup();
  const ref = await connectedAccount(s);
  const pi = "pi_refund_fail";
  s.store.payments.set(pi, { paymentId: PAYMENT, tenantId: TENANT, studioAccountRef: ref });
  s.provider.seedRefund({
    refundRef: "re_failed_1",
    paymentRef: pi,
    status: "failed",
    amountCents: 1000,
    refundId: REFUND_A,
  });
  const res = await handleWebhook(
    await signed(s, JSON.stringify(refundFailedBody(ref, pi, "re_failed_1"))),
    s.deps,
  );
  assertEquals(res.status, 200);
  assertEquals(s.store.refunds.length, 0);
  assertEquals(s.store.markRefundFailedCalls.length, 1);
  assertEquals(
    (s.store.markRefundFailedCalls[0] as { refundRef: string; failureCode: string }).refundRef,
    "re_failed_1",
  );
});

Deno.test("19. Konto-Mismatch bei Erstattung → nichts gebucht", async () => {
  const s = setup();
  const ref = await connectedAccount(s);
  const pi = "pi_refund_mismatch";
  s.store.payments.set(pi, {
    paymentId: PAYMENT,
    tenantId: TENANT,
    studioAccountRef: "acct_other",
  });
  s.provider.seedRefund({
    refundRef: "re_x",
    paymentRef: pi,
    status: "succeeded",
    amountCents: 500,
    refundId: null,
  });
  const res = await handleWebhook(await signed(s, JSON.stringify(chargeRefundedBody(ref, pi, "evt_mm"))), s.deps);
  assertEquals(res.status, 200);
  assertEquals(s.store.refunds.length, 0);
  assert(s.log.lines.some((l) => l.includes("account_mismatch")), "Log mismatch");
});

Deno.test("20. Dispute created/closed → record_payment_dispute", async () => {
  const s = setup();
  const ref = await connectedAccount(s);
  const pi = "pi_dispute_1";
  const dp = "dp_test_1";
  s.store.payments.set(pi, { paymentId: PAYMENT, tenantId: TENANT, studioAccountRef: ref });
  s.provider.seedDispute({
    disputeRef: dp,
    paymentRef: pi,
    status: "needs_response",
    amountCents: 2400,
  });
  let res = await handleWebhook(
    await signed(s, JSON.stringify(disputeBody("charge.dispute.created", ref, dp, "evt_d1"))),
    s.deps,
  );
  assertEquals(res.status, 200);
  assertEquals(s.store.disputes.length, 1);
  assertEquals((s.store.disputes[0] as { providerRef: string }).providerRef, dp);

  s.provider.seedDispute({
    disputeRef: dp,
    paymentRef: pi,
    status: "won",
    amountCents: 2400,
  });
  res = await handleWebhook(
    await signed(s, JSON.stringify(disputeBody("charge.dispute.closed", ref, dp, "evt_d2"))),
    s.deps,
  );
  assertEquals(res.status, 200);
  assertEquals(s.store.disputes.length, 2);
  assertEquals((s.store.disputes[1] as { status: string }).status, "won");
});

Deno.test("21. listRefunds nicht erreichbar → 500", async () => {
  const s = setup();
  const ref = await connectedAccount(s);
  const pi = "pi_refund_down";
  s.store.payments.set(pi, { paymentId: PAYMENT, tenantId: TENANT, studioAccountRef: ref });
  s.provider.listRefundsUnavailable = true;
  const res = await handleWebhook(
    await signed(s, JSON.stringify(chargeRefundedBody(ref, pi, "evt_down"))),
    s.deps,
  );
  assertEquals(res.status, 500);
  assertEquals(await readJson(res), { code: "PROVIDER_UNAVAILABLE" });
});
