import { envFromRecord } from "../_shared/payments/config.ts";
import { FAKE_WEBHOOK_SECRET, FakePaymentProvider } from "../_shared/payments/fake/adapter.ts";
import { assert, assertEquals } from "../_shared/payments/port_contract.ts";
import { type ProviderAccountState, ProviderError } from "../_shared/payments/port.ts";
import {
  handleWebhook,
  MAX_BODY_BYTES,
  type RecordEventInput,
  type RecordEventResult,
  type UpsertAccountResult,
  type WebhookDeps,
  type WebhookStore,
} from "./handler.ts";

const TENANT = "00000000-0000-4000-8000-0000000014a1";
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
  /** provider_accounts: provider_ref → tenant_id */
  readonly accounts = new Map<string, string>();
  readonly upserts: { tenantId: string; state: ProviderAccountState }[] = [];
  upsertResult: UpsertAccountResult = { ok: true };
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

  override getAccountState(ref: string): Promise<ProviderAccountState> {
    this.getAccountStateCalls += 1;
    if (this.unavailable) return Promise.reject(new ProviderError("PROVIDER_UNAVAILABLE", "StripeConnectionError"));
    return super.getAccountState(ref);
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

/** Studio mit verbundenem Konto; event trägt den Stand zum Zeitpunkt des Baus. */
async function connectedAccount(s: Setup): Promise<string> {
  const { ref } = await s.provider.createConnectedAccount(TENANT, `acct-create-${TENANT}`);
  s.store.accounts.set(ref, TENANT);
  return ref;
}

async function signed(s: Setup, body: string, secret = FAKE_WEBHOOK_SECRET): Promise<Request> {
  return post(body, await s.provider.signWebhook(body, secret));
}

Deno.test("Webhook: ungültige Signatur → 400, keine DB-Schreibung", async () => {
  const s = setup();
  const ref = await connectedAccount(s);
  const body = s.provider.buildEvent("account.updated", ref);
  const res = await handleWebhook(await signed(s, body, "whsec_falsch"), s.deps);
  assertEquals(res.status, 400);
  assertEquals(await readJson(res), { code: "INVALID_SIGNATURE" });
  assertEquals(s.store.writes, 0, "keine Schreibung");
  assertEquals(s.store.rows.size, 0);
});

Deno.test("Webhook: GET → 405", async () => {
  const s = setup();
  const res = await handleWebhook(new Request("https://dev.example.test/", { method: "GET" }), s.deps);
  assertEquals(res.status, 405);
  assertEquals(s.store.writes, 0);
});

Deno.test("Webhook: Body über 1 MB → 413 (Content-Length und Stream)", async () => {
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

Deno.test("Webhook: fehlender Header stripe-signature → 400", async () => {
  const s = setup();
  const ref = await connectedAccount(s);
  const res = await handleWebhook(post(s.provider.buildEvent("account.updated", ref)), s.deps);
  assertEquals(res.status, 400);
  assertEquals(await readJson(res), { code: "MISSING_SIGNATURE" });
  assertEquals(s.store.writes, 0);
});

Deno.test("Webhook: Konfiguration fehlt → 500 CONFIG_ERROR", async () => {
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

Deno.test("Webhook: account.updated mit bekanntem Studio → Stand nachgelesen, upsert, verarbeitet", async () => {
  const s = setup();
  const ref = await connectedAccount(s);
  // Event trägt den alten Stand (in_progress); beim Anbieter ist das Konto inzwischen bereit.
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

Deno.test("Webhook: dasselbe Event zweimal → beim zweiten Mal kein Nachlesen, 200", async () => {
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

Deno.test("Webhook: früherer Fehlschlag (nicht verarbeitet) → wird erneut verarbeitet", async () => {
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

Deno.test("Webhook: Studio unbekannt → TENANT_NOT_RESOLVED, 200, kein Nachlesen", async () => {
  const s = setup();
  const { ref } = await s.provider.createConnectedAccount(TENANT, "k-unbekannt");
  const res = await handleWebhook(await signed(s, s.provider.buildEvent("account.updated", ref)), s.deps);
  assertEquals(res.status, 200);
  assertEquals(await readJson(res), { received: true });
  assertEquals(s.provider.getAccountStateCalls, 0);
  assertEquals(s.store.upserts.length, 0);
  const row = s.store.only();
  assert(row.processedAt !== null, "abschließend behandelt");
  assertEquals([row.tenantId, row.processingError], [null, "TENANT_NOT_RESOLVED"]);
});

Deno.test("Webhook: upsert liefert ACCOUNT_TENANT_MISMATCH → Code gespeichert, 200", async () => {
  const s = setup();
  const ref = await connectedAccount(s);
  s.store.upsertResult = { ok: false, code: "ACCOUNT_TENANT_MISMATCH" };
  const res = await handleWebhook(await signed(s, s.provider.buildEvent("account.updated", ref)), s.deps);
  assertEquals(res.status, 200);
  const row = s.store.only();
  assert(row.processedAt !== null, "verarbeitet");
  assertEquals(row.processingError, "ACCOUNT_TENANT_MISMATCH");
});

Deno.test("Webhook: Anbieter beim Nachlesen nicht erreichbar → mark_provider_event_failed, 500", async () => {
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

Deno.test("Webhook: payment_intent.succeeded → verarbeitet ohne Wirkung, 200", async () => {
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

Deno.test("Webhook: zweites Secret (Rotation) passt → 200", async () => {
  const s = setup({ STRIPE_WEBHOOK_SECRET: "whsec_fake_omlify_alt", STRIPE_WEBHOOK_SECRET_2: SECOND_SECRET });
  const ref = await connectedAccount(s);
  const res = await handleWebhook(await signed(s, s.provider.buildEvent("account.updated", ref), SECOND_SECRET), s.deps);
  assertEquals(res.status, 200);
  assertEquals(s.store.upserts.length, 1);
});

Deno.test("Webhook: livemode passt nicht → 400, nichts gespeichert", async () => {
  // Adapter lehnt ein Live-Event im Testmodus ab.
  const s = setup();
  const ref = await connectedAccount(s);
  const live = s.provider.buildEvent("account.updated", ref, { livemode: true });
  const res = await handleWebhook(await signed(s, live), s.deps);
  assertEquals(res.status, 400);
  assertEquals(await readJson(res), { code: "LIVEMODE_MISMATCH" });

  // Eigene Prüfung der Function: Testevent bei PAYMENTS_MODE=live.
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
    assert(!all.includes(forbidden), `Log enthält verbotenen Inhalt: ${forbidden.slice(0, 20)}`);
  }
  assert(all.includes(eventId), "Event-ID steht im Log");
  assert(all.includes("account.updated"), "Event-Typ steht im Log");
});
