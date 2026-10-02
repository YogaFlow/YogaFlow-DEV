/**
 * payments-jobs — Outbox-Verarbeitung (2.2a-4b / J1–J5).
 *
 * verify_jwt = false; Aufruf nur mit Authorization: Bearer <PROVIDER_JOBS_SECRET>
 * (Cron/pg_net aus Vault provider_jobs_secret, gleiche Wert in Function-Secret).
 * claim_provider_jobs(20) → Aufträge → finish_provider_job. Zeitbudget ~25 s.
 *
 * Logs: job_id, kind, Ergebnis-Code — nie acct_…, Secrets, client_secret.
 */
import {
  type PaymentProvider,
  ProviderError,
} from "../_shared/payments/port.ts";
import { createServiceLogger, type ServiceLogger } from "../_shared/service.ts";

export const JOB_LIMIT = 20;
export const TIME_BUDGET_MS = 25_000;
export const SECRET_ENV = "PROVIDER_JOBS_SECRET";

export type ProviderJobRow = {
  job_id: string;
  kind: string;
  tenant_id: string;
  account_ref: string | null;
  provider_ref: string | null;
  payment_id: string | null;
  refund_id: string | null;
  amount_cents: number | null;
};

export type CompleteResult = { ok: true; code: string | null } | { ok: false; code: string };
export type RefundRecordResult = { ok: true; code: string | null } | { ok: false; code: string };
export type MarkRefundFailedResult = { ok: true; code?: string | null } | { ok: false; code: string };

export interface JobsStore {
  claimJobs(limit: number): Promise<ProviderJobRow[]>;
  finishJob(
    jobId: string,
    outcome: "done" | "retry" | "failed",
    errorCode?: string | null,
  ): Promise<void>;
  completeOnlinePayment(input: {
    providerRef: string;
    amountCents: number;
    currency: string;
    receivedAt: string;
    livemode: boolean;
  }): Promise<CompleteResult>;
  recordOnlineRefund(input: {
    paymentId: string;
    refundRef: string;
    amountCents: number;
    receivedAt: string;
    refundId: string | null;
  }): Promise<RefundRecordResult>;
  markRefundFailed(input: {
    refundId: string | null;
    refundRef?: string | null;
    failureCode: string;
  }): Promise<MarkRefundFailedResult>;
}

export type JobsDeps = {
  env: (key: string) => string | undefined;
  log: ServiceLogger;
  /** Erst nach Secret-Prüfung aufrufen (J1). */
  getProvider: () => PaymentProvider;
  store: JobsStore;
  now?: () => number;
  timeBudgetMs?: number;
};

export type JobsResult = {
  processed: number;
  results: { jobId: string; kind: string; outcome: string; code?: string }[];
};

const encoder = new TextEncoder();

/** Konstanter Vergleich zweier Strings (Länge und Inhalt). */
export function timingSafeEqual(a: string, b: string): boolean {
  const aa = encoder.encode(a);
  const bb = encoder.encode(b);
  const len = Math.max(aa.length, bb.length);
  let diff = aa.length ^ bb.length;
  for (let i = 0; i < len; i++) {
    diff |= (aa[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

/** Liest Bearer-Token aus Authorization (wie invoke_provider_jobs / J1). */
export function readBearerSecret(req: Request): string | null {
  const auth = req.headers.get("Authorization");
  if (!auth) return null;
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return m?.[1]?.trim() || null;
}

export function authorizeJobs(
  req: Request,
  expectedSecret: string | undefined,
): boolean {
  if (!expectedSecret || !expectedSecret.trim()) return false;
  const got = readBearerSecret(req);
  if (!got) return false;
  return timingSafeEqual(got, expectedSecret);
}

function isRetryableProvider(code: string): boolean {
  return code === "PROVIDER_UNAVAILABLE" || code === "RATE_LIMITED";
}

function isImmediateFailProvider(code: string): boolean {
  return code === "NOT_FOUND" || code === "INVALID_REQUEST";
}

async function finishRetry(
  deps: JobsDeps,
  job: ProviderJobRow,
  code: string,
  results: JobsResult["results"],
): Promise<void> {
  await deps.store.finishJob(job.job_id, "retry", code);
  deps.log.info("provider_job", { job_id: job.job_id, kind: job.kind, outcome: "retry", code });
  results.push({ jobId: job.job_id, kind: job.kind, outcome: "retry", code });
}

async function finishFailed(
  deps: JobsDeps,
  job: ProviderJobRow,
  code: string,
  results: JobsResult["results"],
): Promise<void> {
  await deps.store.finishJob(job.job_id, "failed", code);
  deps.log.info("provider_job", { job_id: job.job_id, kind: job.kind, outcome: "failed", code });
  results.push({ jobId: job.job_id, kind: job.kind, outcome: "failed", code });
}

async function finishDone(
  deps: JobsDeps,
  job: ProviderJobRow,
  results: JobsResult["results"],
  code?: string,
): Promise<void> {
  await deps.store.finishJob(job.job_id, "done", null);
  deps.log.info("provider_job", {
    job_id: job.job_id,
    kind: job.kind,
    outcome: "done",
    ...(code ? { code } : {}),
  });
  results.push({ jobId: job.job_id, kind: job.kind, outcome: "done", code });
}

async function handleProviderError(
  deps: JobsDeps,
  job: ProviderJobRow,
  err: unknown,
  results: JobsResult["results"],
): Promise<void> {
  if (err instanceof ProviderError) {
    if (isRetryableProvider(err.code)) {
      await finishRetry(deps, job, err.code, results);
      return;
    }
    if (isImmediateFailProvider(err.code)) {
      await finishFailed(deps, job, err.code, results);
      return;
    }
    await finishRetry(deps, job, "UNEXPECTED", results);
    return;
  }
  await finishRetry(deps, job, "UNEXPECTED", results);
}

async function processCancel(
  deps: JobsDeps,
  job: ProviderJobRow,
  results: JobsResult["results"],
): Promise<void> {
  if (!job.account_ref) {
    await finishFailed(deps, job, "ACCOUNT_MISSING", results);
    return;
  }
  if (!job.provider_ref) {
    await finishFailed(deps, job, "NOT_FOUND", results);
    return;
  }

  const provider = deps.getProvider();
  let canceled;
  try {
    canceled = await provider.cancelPaymentIntent(job.account_ref, job.provider_ref);
  } catch (err) {
    await handleProviderError(deps, job, err, results);
    return;
  }

  if (canceled.status === "canceled") {
    await finishDone(deps, job, results);
    return;
  }

  if (canceled.status === "succeeded") {
    // J3: doch bezahlt → retrieve + complete, dann done
    let retrieved;
    try {
      retrieved = await provider.retrievePayment(job.account_ref, job.provider_ref);
    } catch (err) {
      await handleProviderError(deps, job, err, results);
      return;
    }
    if (retrieved.status === "succeeded") {
      let complete: CompleteResult;
      try {
        complete = await deps.store.completeOnlinePayment({
          providerRef: job.provider_ref,
          amountCents: retrieved.amountCents,
          currency: retrieved.currency,
          receivedAt: retrieved.receivedAt ?? new Date().toISOString(),
          livemode: retrieved.livemode,
        });
      } catch {
        await finishRetry(deps, job, "DB_ERROR", results);
        return;
      }
      if (!complete.ok) {
        await finishRetry(deps, job, complete.code || "DB_ERROR", results);
        return;
      }
      deps.log.info("provider_job.cancel_too_late", {
        job_id: job.job_id,
        kind: job.kind,
        code: complete.code,
      });
      await finishDone(deps, job, results, complete.code ?? undefined);
      return;
    }
    await finishRetry(deps, job, "UNEXPECTED", results);
    return;
  }

  // processing / requires_action / failed — erneut versuchen
  await finishRetry(deps, job, "UNEXPECTED", results);
}

async function processRefund(
  deps: JobsDeps,
  job: ProviderJobRow,
  results: JobsResult["results"],
): Promise<void> {
  if (!job.account_ref) {
    await finishFailed(deps, job, "ACCOUNT_MISSING", results);
    return;
  }
  if (!job.provider_ref || !job.payment_id || !job.refund_id) {
    await finishFailed(deps, job, "NOT_FOUND", results);
    return;
  }
  if (job.amount_cents == null || !Number.isInteger(job.amount_cents) || job.amount_cents <= 0) {
    await finishFailed(deps, job, "INVALID_AMOUNT", results);
    return;
  }

  const provider = deps.getProvider();
  let refund;
  try {
    refund = await provider.refundPayment({
      accountRef: job.account_ref,
      ref: job.provider_ref,
      amountCents: job.amount_cents,
      refundId: job.refund_id,
      idempotencyKey: job.refund_id,
      tenantId: job.tenant_id,
      paymentId: job.payment_id,
    });
  } catch (err) {
    if (err instanceof ProviderError && isImmediateFailProvider(err.code)) {
      try {
        await deps.store.markRefundFailed({
          refundId: job.refund_id,
          failureCode: err.code,
        });
      } catch {
        await finishRetry(deps, job, "DB_ERROR", results);
        return;
      }
      await finishFailed(deps, job, err.code, results);
      return;
    }
    await handleProviderError(deps, job, err, results);
    return;
  }

  if (refund.status === "failed") {
    try {
      await deps.store.markRefundFailed({
        refundId: job.refund_id,
        refundRef: refund.refundRef,
        failureCode: "REFUND_FAILED",
      });
    } catch {
      await finishRetry(deps, job, "DB_ERROR", results);
      return;
    }
    await finishFailed(deps, job, "REFUND_FAILED", results);
    return;
  }

  // pending / succeeded → record (E2)
  let recorded: RefundRecordResult;
  try {
    recorded = await deps.store.recordOnlineRefund({
      paymentId: job.payment_id,
      refundRef: refund.refundRef,
      amountCents: refund.amountCents,
      receivedAt: new Date().toISOString(),
      refundId: job.refund_id,
    });
  } catch {
    await finishRetry(deps, job, "DB_ERROR", results);
    return;
  }

  if (!recorded.ok) {
    if (recorded.code === "NOT_FOUND" || recorded.code === "INVALID_REF" || recorded.code === "INVALID_AMOUNT") {
      await finishFailed(deps, job, recorded.code, results);
      return;
    }
    await finishRetry(deps, job, recorded.code || "DB_ERROR", results);
    return;
  }

  await finishDone(deps, job, results, recorded.code ?? undefined);
}

export async function runJobs(deps: JobsDeps): Promise<JobsResult> {
  const budget = deps.timeBudgetMs ?? TIME_BUDGET_MS;
  const started = (deps.now ?? Date.now)();
  const rows = await deps.store.claimJobs(JOB_LIMIT);
  const results: JobsResult["results"] = [];

  for (let i = 0; i < rows.length; i++) {
    const elapsed = (deps.now ?? Date.now)() - started;
    if (elapsed >= budget) {
      // J2: nicht angefasste → retry
      for (let j = i; j < rows.length; j++) {
        await finishRetry(deps, rows[j], "TIME_BUDGET", results);
      }
      break;
    }

    const job = rows[i];
    if (job.kind === "cancel_payment_intent") {
      await processCancel(deps, job, results);
    } else if (job.kind === "refund_payment") {
      await processRefund(deps, job, results);
    } else {
      await finishFailed(deps, job, "UNKNOWN_KIND", results);
    }
  }

  return { processed: results.length, results };
}

export async function handleJobsRequest(
  req: Request,
  deps: JobsDeps,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const secret = deps.env(SECRET_ENV);
  if (!authorizeJobs(req, secret)) {
    deps.log.warn("payments-jobs unauthorized");
    return new Response(JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = await runJobs(deps);
  return new Response(JSON.stringify({ success: true, ...result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export function createDefaultLog(): ServiceLogger {
  return createServiceLogger();
}
