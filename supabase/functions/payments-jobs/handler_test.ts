/**
 * Deno-Tests für payments-jobs (2.2a-4b). Fakes, kein Netz.
 */
import { FakePaymentProvider } from "../_shared/payments/fake/adapter.ts";
import { assert, assertEquals } from "../_shared/payments/port_contract.ts";
import { ProviderError, type PaymentProvider } from "../_shared/payments/port.ts";
import {
  JOB_LIMIT,
  SECRET_ENV,
  authorizeJobs,
  handleJobsRequest,
  runJobs,
  timingSafeEqual,
  type JobsDeps,
  type JobsStore,
  type ProviderJobRow,
} from "./handler.ts";

const ACCOUNT = "acct_fake_jobs_1";
const PI = "pi_fake_jobs_1";
const PAYMENT = "00000000-0000-4000-8000-00000000j001";
const JOB1 = "00000000-0000-4000-8000-00000000j101";
const JOB2 = "00000000-0000-4000-8000-00000000j102";

class MemoryStore implements JobsStore {
  claimed: ProviderJobRow[] = [];
  finishes: { jobId: string; outcome: string; code: string | null | undefined }[] = [];
  completes: unknown[] = [];
  refunds: unknown[] = [];
  claimCalls = 0;
  completeResult: { ok: true; code: string | null } = { ok: true, code: "RESTORED" };
  refundResult: { ok: true; code: string | null } = { ok: true, code: "REFUNDED" };

  claimJobs(limit: number): Promise<ProviderJobRow[]> {
    void limit;
    this.claimCalls += 1;
    return Promise.resolve(structuredClone(this.claimed));
  }

  finishJob(jobId: string, outcome: "done" | "retry" | "failed", errorCode?: string | null) {
    this.finishes.push({ jobId, outcome, code: errorCode });
    return Promise.resolve();
  }

  completeOnlinePayment(input: {
    providerRef: string;
    amountCents: number;
    currency: string;
    receivedAt: string;
    livemode: boolean;
  }) {
    this.completes.push(input);
    return Promise.resolve(structuredClone(this.completeResult));
  }

  recordOnlineRefund(input: {
    paymentId: string;
    refundRef: string;
    amountCents: number;
    receivedAt: string;
  }) {
    this.refunds.push(input);
    return Promise.resolve(structuredClone(this.refundResult));
  }
}

class SpyProvider extends FakePaymentProvider {
  cancelStatus: "canceled" | "succeeded" | null = null;
  refundStatus: "pending" | "succeeded" | "failed" = "pending";
  throwOnCancel: ProviderError | null = null;
  throwOnRefund: ProviderError | null = null;

  override cancelPaymentIntent(accountRef: string, ref: string) {
    if (this.throwOnCancel) return Promise.reject(this.throwOnCancel);
    if (this.cancelStatus === "succeeded") {
      // Seed payment as succeeded so retrieve works
      return this.createPaymentIntent({
        accountRef,
        amountCents: 2400,
        currency: "EUR",
        attemptId: "att",
        tenantId: "t",
        registrationId: "r",
        idempotencyKey: ref,
      }).then(async (created) => {
        // Use the known ref by confirming a payment we control
        void created;
        // Directly set via confirm path: create under PI key
        return { status: "succeeded" as const };
      });
    }
    return super.cancelPaymentIntent(accountRef, ref);
  }

  override retrievePayment(accountRef: string, ref: string) {
    void accountRef;
    return Promise.resolve({
      ref,
      status: "succeeded" as const,
      amountCents: 2400,
      currency: "EUR" as const,
      livemode: false,
      receivedAt: "2026-10-01T12:00:00.000Z",
    });
  }

  override refundPayment(cmd: Parameters<FakePaymentProvider["refundPayment"]>[0]) {
    if (this.throwOnRefund) return Promise.reject(this.throwOnRefund);
    if (this.refundStatus === "failed") {
      return Promise.resolve({
        refundRef: "re_failed",
        status: "failed" as const,
        amountCents: 2400,
      });
    }
    return Promise.resolve({
      refundRef: "re_test_abc",
      status: this.refundStatus,
      amountCents: 2400,
      // expose idempotency via call log
    }).then((r) => {
      this.paymentCalls.push({
        method: "refundPayment",
        ref: cmd.ref,
        idempotencyKey: cmd.idempotencyKey,
      });
      return r;
    });
  }
}

function cancelJob(overrides: Partial<ProviderJobRow> = {}): ProviderJobRow {
  return {
    job_id: JOB1,
    kind: "cancel_payment_intent",
    tenant_id: "t1",
    account_ref: ACCOUNT,
    provider_ref: PI,
    payment_id: null,
    amount_cents: null,
    ...overrides,
  };
}

function refundJob(overrides: Partial<ProviderJobRow> = {}): ProviderJobRow {
  return {
    job_id: JOB2,
    kind: "refund_payment",
    tenant_id: "t1",
    account_ref: ACCOUNT,
    provider_ref: PI,
    payment_id: PAYMENT,
    amount_cents: 2400,
    ...overrides,
  };
}

function setup(opts: { secret?: string; logLines?: string[] } = {}) {
  const store = new MemoryStore();
  const provider = new SpyProvider();
  const logLines = opts.logLines ?? [];
  const deps: JobsDeps = {
    env: (key) => (key === SECRET_ENV ? (opts.secret ?? "jobs-secret") : undefined),
    log: {
      info: (...a) => logLines.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")),
      warn: (...a) => logLines.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")),
      error: (...a) => logLines.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")),
    },
    getProvider: () => provider as unknown as PaymentProvider,
    store,
  };
  return { store, provider, logLines, deps };
}

function post(secret?: string): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret !== undefined) headers["Authorization"] = `Bearer ${secret}`;
  return new Request("http://local/payments-jobs", { method: "POST", headers, body: "{}" });
}

Deno.test("timingSafeEqual", () => {
  assert(timingSafeEqual("abc", "abc"), "gleich");
  assert(!timingSafeEqual("abc", "abd"), "ungleich Inhalt");
  assert(!timingSafeEqual("abc", "ab"), "ungleich Länge");
});

Deno.test("ohne Secret → 401, kein claim", async () => {
  const s = setup({ secret: "richtig" });
  const res = await handleJobsRequest(post(), s.deps);
  assertEquals(res.status, 401);
  assertEquals(s.store.claimCalls, 0);
});

Deno.test("falsches Secret → 401, kein claim", async () => {
  const s = setup({ secret: "richtig" });
  const res = await handleJobsRequest(post("falsch"), s.deps);
  assertEquals(res.status, 401);
  assertEquals(s.store.claimCalls, 0);
  assertEquals(authorizeJobs(post("richtig"), "richtig"), true);
});

Deno.test("cancel → canceled → done", async () => {
  const s = setup();
  const { ref } = await s.provider.createPaymentIntent({
    accountRef: ACCOUNT,
    amountCents: 100,
    currency: "EUR",
    attemptId: "a2",
    tenantId: "t",
    registrationId: "r",
    idempotencyKey: "k2",
  });
  s.store.claimed = [cancelJob({ provider_ref: ref })];
  const out = await runJobs(s.deps);
  assertEquals(out.results[0]?.outcome, "done");
  assertEquals(s.store.finishes[0], { jobId: JOB1, outcome: "done", code: null });
  assertEquals(s.store.completes.length, 0);
});

Deno.test("cancel → succeeded → retrieve + complete → done, Log cancel_too_late", async () => {
  const s = setup();
  s.provider.cancelStatus = "succeeded";
  s.store.claimed = [cancelJob()];
  s.store.completeResult = { ok: true, code: "RESTORED" };
  const out = await runJobs(s.deps);
  assertEquals(out.results[0]?.outcome, "done");
  assertEquals(s.store.completes.length, 1);
  assertEquals((s.store.completes[0] as { amountCents: number }).amountCents, 2400);
  assert(s.logLines.some((l) => l.includes("cancel_too_late")), "Log cancel_too_late");
});

Deno.test("refund → pending → record mit re_… und Idempotency-Key = payment_id → done", async () => {
  const s = setup();
  s.provider.refundStatus = "pending";
  s.store.claimed = [refundJob()];
  const out = await runJobs(s.deps);
  assertEquals(out.results[0]?.outcome, "done");
  assertEquals(s.store.refunds.length, 1);
  const rec = s.store.refunds[0] as { paymentId: string; refundRef: string };
  assertEquals(rec.paymentId, PAYMENT);
  assert(rec.refundRef.startsWith("re_"), "re_…");
  const call = s.provider.paymentCalls.find((c) => c.method === "refundPayment");
  assertEquals(call?.idempotencyKey, PAYMENT);
});

Deno.test("refund → ALREADY_REFUNDED → done", async () => {
  const s = setup();
  s.provider.refundStatus = "succeeded";
  s.store.refundResult = { ok: true, code: "ALREADY_REFUNDED" };
  s.store.claimed = [refundJob()];
  const out = await runJobs(s.deps);
  assertEquals(out.results[0]?.outcome, "done");
  assertEquals(out.results[0]?.code, "ALREADY_REFUNDED");
});

Deno.test("PROVIDER_UNAVAILABLE → retry; NOT_FOUND → failed", async () => {
  const s = setup();
  s.provider.throwOnCancel = new ProviderError("PROVIDER_UNAVAILABLE");
  s.store.claimed = [cancelJob()];
  let out = await runJobs(s.deps);
  assertEquals(out.results[0]?.outcome, "retry");
  assertEquals(out.results[0]?.code, "PROVIDER_UNAVAILABLE");

  s.store.finishes = [];
  s.provider.throwOnCancel = new ProviderError("NOT_FOUND");
  out = await runJobs(s.deps);
  assertEquals(out.results[0]?.outcome, "failed");
  assertEquals(out.results[0]?.code, "NOT_FOUND");
});

Deno.test("Zeitbudget: nicht angefasste Aufträge → retry", async () => {
  const s = setup();
  const { ref } = await s.provider.createPaymentIntent({
    accountRef: ACCOUNT,
    amountCents: 100,
    currency: "EUR",
    attemptId: "a3",
    tenantId: "t",
    registrationId: "r",
    idempotencyKey: "budget2",
  });
  s.store.claimed = [
    cancelJob({ job_id: JOB1, provider_ref: ref }),
    refundJob({ job_id: JOB2 }),
  ];
  let ticks = 0;
  s.deps.now = () => {
    ticks += 1;
    // 1: started; 2: vor Job 1; 3+: Budget überschritten
    if (ticks <= 2) return 0;
    return 30_000;
  };
  s.deps.timeBudgetMs = 25_000;
  const out = await runJobs(s.deps);
  assertEquals(out.results.length, 2);
  assertEquals(out.results[0]?.outcome, "done");
  assertEquals(out.results[1]?.outcome, "retry");
  assertEquals(out.results[1]?.code, "TIME_BUDGET");
  assertEquals(JOB_LIMIT, 20);
});

Deno.test("Logger-Spion: kein acct_…, kein Secret", async () => {
  const logLines: string[] = [];
  const s = setup({ logLines, secret: "super-geheim-xyz" });
  s.provider.cancelStatus = "succeeded";
  s.store.claimed = [cancelJob()];
  await runJobs(s.deps);
  const joined = logLines.join("\n");
  assert(!joined.includes("acct_"), "kein acct_");
  assert(!joined.includes("super-geheim-xyz"), "kein Secret");
  assert(!joined.includes(ACCOUNT), "kein Konto-Ref");
});
