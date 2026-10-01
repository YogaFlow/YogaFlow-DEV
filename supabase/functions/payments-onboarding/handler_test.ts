import { FakePaymentProvider } from "../_shared/payments/fake/adapter.ts";
import { assert, assertEquals } from "../_shared/payments/port_contract.ts";
import {
  connectedAccountIdempotencyKey,
  type ProviderAccountState,
  ProviderError,
  type ProviderId,
} from "../_shared/payments/port.ts";
import type { OnboardingSession } from "../_shared/payments/stripe/onboarding.ts";
import {
  handleOnboarding,
  type OnboardingDeps,
  type OnboardingStore,
  type OwnerPaymentContext,
  type PaymentSetupStatus,
  type UpsertResult,
} from "./handler.ts";

const TENANT = "00000000-0000-4000-8000-0000000013a1";
const MEMBER = "00000000-0000-4000-8000-0000000013a2";
const SLUG = "demoalpha";
const CORS = { "Access-Control-Allow-Origin": "*" };
const CALLER = { tenantId: TENANT, memberId: MEMBER, tenantSlug: SLUG };

class MemoryStore implements OnboardingStore {
  ctx: OwnerPaymentContext = {
    isOwner: true,
    platformEnabled: true,
    accountRef: null,
    onboardingStatus: "not_started",
  };
  readonly upserts: ProviderAccountState[] = [];
  upsertResult: UpsertResult = { ok: true };
  upsertThrows = false;
  setupStatus: PaymentSetupStatus = {
    success: true,
    has_account: false,
    onboarding_status: "not_started",
    requirements_pending: false,
    requirements_due_at: null,
    disconnected: false,
  };

  getOwnerContext(): Promise<OwnerPaymentContext> {
    return Promise.resolve({ ...this.ctx });
  }

  getTenantName(): Promise<string | null> {
    return Promise.resolve("Demo Alpha Yoga");
  }

  upsertAccount(_tenantId: string, _provider: ProviderId, state: ProviderAccountState): Promise<UpsertResult> {
    if (this.upsertThrows) return Promise.reject(new Error("db down"));
    this.upserts.push(structuredClone(state));
    if (this.upsertResult.ok) {
      this.ctx = {
        ...this.ctx,
        accountRef: state.ref,
        onboardingStatus: state.status,
      };
      this.setupStatus = {
        ...this.setupStatus,
        success: true,
        has_account: true,
        onboarding_status: state.status,
        requirements_pending: state.requirementsPending,
        requirements_due_at: state.requirementsDueAt,
        disconnected: false,
      };
    }
    return Promise.resolve(this.upsertResult);
  }

  getSetupStatus(): Promise<PaymentSetupStatus> {
    return Promise.resolve({ ...this.setupStatus });
  }
}

class SpyProvider extends FakePaymentProvider {
  createCalls = 0;
  getCalls = 0;
  domainCalls: string[] = [];
  unavailable = false;
  domainFails = false;

  override createConnectedAccount(
    tenantId: string,
    idempotencyKey: string,
    options?: import("../_shared/payments/port.ts").CreateConnectedAccountOptions,
  ): Promise<ProviderAccountState> {
    this.createCalls += 1;
    if (this.unavailable) return Promise.reject(new ProviderError("PROVIDER_UNAVAILABLE"));
    return super.createConnectedAccount(tenantId, idempotencyKey, options);
  }

  override getAccountState(ref: string): Promise<ProviderAccountState> {
    this.getCalls += 1;
    if (this.unavailable) return Promise.reject(new ProviderError("PROVIDER_UNAVAILABLE"));
    return super.getAccountState(ref);
  }

  override registerPaymentDomain(accountRef: string, domain: string) {
    this.domainCalls.push(domain);
    if (this.domainFails) return Promise.reject(new ProviderError("PROVIDER_UNAVAILABLE"));
    return super.registerPaymentDomain(accountRef, domain);
  }
}

function setup() {
  const provider = new SpyProvider();
  const store = new MemoryStore();
  const sessions: string[] = [];
  const logLines: string[] = [];
  const deps: OnboardingDeps = {
    provider,
    store,
    createSession: (accountRef) => {
      sessions.push(accountRef);
      const session: OnboardingSession = {
        clientSecret: `acs_secret_test_${sessions.length}`,
        expiresAt: 1_700_000_000,
      };
      return Promise.resolve(session);
    },
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
  };
  return { provider, store, sessions, logLines, deps };
}

function post(action: string): Request {
  return new Request("https://dev.example.test/functions/v1/payments-onboarding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return await res.json();
}

function assertNoAcct(body: Record<string, unknown>) {
  const text = JSON.stringify(body);
  assert(!/\bacct_[A-Za-z0-9_]+\b/.test(text), `Antwort enthält acct_: ${text}`);
}

Deno.test("Onboarding: Nicht-Owner → 403", async () => {
  const s = setup();
  s.store.ctx.isOwner = false;
  const res = await handleOnboarding(post("start"), CALLER, s.deps);
  assertEquals(res.status, 403);
  assertEquals((await readJson(res)).code, "FORBIDDEN");
  assertEquals(s.provider.createCalls, 0);
});

Deno.test("Onboarding: Plattform aus → 409 PLATFORM_DISABLED", async () => {
  const s = setup();
  s.store.ctx.platformEnabled = false;
  const res = await handleOnboarding(post("start"), CALLER, s.deps);
  assertEquals(res.status, 409);
  assertEquals((await readJson(res)).code, "PLATFORM_DISABLED");
  assertEquals(s.provider.createCalls, 0);
});

Deno.test("Onboarding: erstes start legt Konto an und speichert es", async () => {
  const s = setup();
  const res = await handleOnboarding(post("start"), CALLER, s.deps);
  assertEquals(res.status, 200);
  const body = await readJson(res);
  assertEquals(typeof body.client_secret, "string");
  assertEquals(typeof body.expires_at, "number");
  assertEquals(body.onboarding_status, "in_progress");
  assertNoAcct(body);
  assertEquals(s.provider.createCalls, 1);
  assertEquals(s.store.upserts.length, 1);
  assertEquals(s.sessions.length, 1);
  assertEquals(s.sessions[0], s.store.upserts[0].ref);
  assertEquals(
    connectedAccountIdempotencyKey(TENANT),
    `acct-create-${TENANT}`,
  );
});

Deno.test("Onboarding: zweites start legt kein neues Konto an", async () => {
  const s = setup();
  assertEquals((await handleOnboarding(post("start"), CALLER, s.deps)).status, 200);
  const firstRef = s.store.ctx.accountRef;
  assert(firstRef !== null, "Konto-Referenz nach erstem start");

  // Kontext behält das Konto (wie get_owner_payment_context nach dem ersten Speichern).
  s.provider.createCalls = 0;
  const res = await handleOnboarding(post("start"), CALLER, s.deps);
  assertEquals(res.status, 200);
  assertEquals(s.provider.createCalls, 0, "kein zweites createConnectedAccount");
  assertEquals(s.store.upserts.length, 1);
  assertEquals(s.sessions.length, 2);
  assertEquals(s.sessions[1], firstRef);
  assertNoAcct(await readJson(res));
});

Deno.test("Onboarding: disconnected → 409 ACCOUNT_DISCONNECTED", async () => {
  const s = setup();
  s.store.ctx = {
    isOwner: true,
    platformEnabled: true,
    accountRef: "acct_fake_disconnected",
    onboardingStatus: "disconnected",
  };
  const res = await handleOnboarding(post("start"), CALLER, s.deps);
  assertEquals(res.status, 409);
  assertEquals((await readJson(res)).code, "ACCOUNT_DISCONNECTED");
  assertEquals(s.provider.createCalls, 0);
  assertEquals(s.sessions.length, 0);
});

Deno.test("Onboarding: refresh speichert den nachgelesenen Stand", async () => {
  const s = setup();
  const { ref } = await s.provider.createConnectedAccount(TENANT, connectedAccountIdempotencyKey(TENANT));
  s.store.ctx = {
    isOwner: true,
    platformEnabled: true,
    accountRef: ref,
    onboardingStatus: "in_progress",
  };
  s.provider.activateAccount(ref);

  const res = await handleOnboarding(post("refresh"), CALLER, s.deps);
  assertEquals(res.status, 200);
  const body = await readJson(res);
  assertEquals(body.success, true);
  assertEquals(body.onboarding_status, "active");
  assertEquals(s.provider.getCalls, 1);
  assertEquals(s.store.upserts.length, 1);
  assertEquals(s.store.upserts[0].status, "active");
  assertNoAcct(body);
});

Deno.test("Onboarding: Speicherfehler nach Anlegen → 500", async () => {
  const s = setup();
  s.store.upsertThrows = true;
  const res = await handleOnboarding(post("start"), CALLER, s.deps);
  assertEquals(res.status, 500);
  assertEquals((await readJson(res)).code, "DB_ERROR");
  assertEquals(s.provider.createCalls, 1);
  assertEquals(s.sessions.length, 0);
});

Deno.test("Onboarding: PROVIDER_UNAVAILABLE → 503", async () => {
  const s = setup();
  s.provider.unavailable = true;
  const res = await handleOnboarding(post("start"), CALLER, s.deps);
  assertEquals(res.status, 503);
  assertEquals((await readJson(res)).code, "PROVIDER_UNAVAILABLE");
});

Deno.test("Onboarding: Antwort enthält nie acct_", async () => {
  const s = setup();
  const start = await handleOnboarding(post("start"), CALLER, s.deps);
  assertNoAcct(await readJson(start));

  s.provider.activateAccount(s.store.ctx.accountRef!);
  const refresh = await handleOnboarding(post("refresh"), CALLER, s.deps);
  assertNoAcct(await readJson(refresh));

  const all = s.logLines.join("\n");
  assert(!/\bacct_[A-Za-z0-9_]+\b/.test(all), "Log enthält acct_");
});

Deno.test("Onboarding: refresh mit aktivem Konto → registerPaymentDomain", async () => {
  const s = setup();
  assertEquals((await handleOnboarding(post("start"), CALLER, s.deps)).status, 200);
  s.provider.activateAccount(s.store.ctx.accountRef!);
  const res = await handleOnboarding(post("refresh"), CALLER, s.deps);
  assertEquals(res.status, 200);
  assertEquals(s.provider.domainCalls, ["demoalpha.omlify-dev.de"]);
});

Deno.test("Onboarding: Domain-Fehler bricht refresh nicht ab", async () => {
  const s = setup();
  assertEquals((await handleOnboarding(post("start"), CALLER, s.deps)).status, 200);
  s.provider.activateAccount(s.store.ctx.accountRef!);
  s.provider.domainFails = true;
  const res = await handleOnboarding(post("refresh"), CALLER, s.deps);
  assertEquals(res.status, 200);
  assertEquals((await readJson(res)).success, true);
  assertEquals(s.provider.domainCalls.length, 1);
});
