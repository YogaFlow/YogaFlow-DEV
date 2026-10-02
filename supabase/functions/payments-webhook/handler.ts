/**
 * Webhook-Empfang (Geldkette 1.4). Reine Logik, alle Abhängigkeiten injiziert,
 * damit die Tests ohne Netzwerk laufen. Einstieg für Deno.serve: index.ts.
 *
 * Ablauf (Nachtrag 5c, W1–W7): prüfen → speichern → verarbeiten.
 * - Ungültige Signatur oder falscher Modus → 400, nichts gespeichert.
 * - 500 nur bei vorübergehenden Fehlern (Datenbank, Anbieter), damit Stripe erneut zustellt.
 * - Alles andere → 200, auch ignorierte Typen und fachliche Fehler.
 *
 * Geloggt werden nur Event-Typ, Event-ID und Ergebnis-Code. Nie Payload,
 * Signatur, Secrets oder Kontodaten.
 */
import { type PaymentsEnv, readPaymentsMode } from "../_shared/payments/config.ts";
import {
  type PaymentProvider,
  type ProviderAccountState,
  ProviderError,
  type ProviderEvent,
  type ProviderId,
} from "../_shared/payments/port.ts";

export const MAX_BODY_BYTES = 1024 * 1024;

const ERROR_CODE_RE = /^[A-Z_]{3,64}$/;

export interface WebhookLogger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export interface RecordEventInput {
  provider: ProviderId;
  eventId: string;
  eventType: string;
  accountRef: string | null;
  livemode: boolean;
  payload: unknown;
}

export type RecordEventResult =
  | { ok: true; id: string; tenantId: string | null; duplicate: boolean; alreadyProcessed: boolean }
  | { ok: false; code: string };

export type UpsertAccountResult = { ok: true } | { ok: false; code: string };
export type MarkDisconnectedResult = { ok: true; changed: boolean } | { ok: false; code: string };

export type PaymentAttemptLookup =
  | {
    found: true;
    attemptId: string;
    tenantId: string;
    /** Stripe-Konto des Studios (provider_accounts), nicht aus dem Event. */
    studioAccountRef: string | null;
  }
  | { found: false };

export type CompletePaymentResult = { ok: true; code: string | null } | { ok: false; code: string };
export type MarkFailedPaymentResult = { ok: true } | { ok: false; code: string };
export type RefundRecordResult = { ok: true; code: string | null } | { ok: false; code: string };
export type MarkRefundFailedResult = { ok: true } | { ok: false; code: string };
export type RecordDisputeResult = { ok: true; code?: string | null } | { ok: false; code: string };

export type PaymentLookup =
  | {
    found: true;
    paymentId: string;
    tenantId: string;
    studioAccountRef: string | null;
  }
  | { found: false };

/** Jede Methode wirft bei vorübergehenden Fehlern (Datenbank nicht erreichbar). */
export interface WebhookStore {
  recordEvent(input: RecordEventInput): Promise<RecordEventResult>;
  markProcessed(id: string, errorCode: string | null): Promise<void>;
  markFailed(id: string): Promise<void>;
  upsertAccount(tenantId: string, provider: ProviderId, state: ProviderAccountState): Promise<UpsertAccountResult>;
  markDisconnected(provider: ProviderId, accountRef: string): Promise<MarkDisconnectedResult>;
  /** Versuch über (stripe, pi_…) inkl. Studio-Konto. */
  findPaymentAttempt(provider: ProviderId, providerRef: string): Promise<PaymentAttemptLookup>;
  /** Original-Zahlung über payments.provider_ref (pi_…). */
  findPaymentByProviderRef(provider: ProviderId, providerRef: string): Promise<PaymentLookup>;
  completeOnlinePayment(input: {
    providerRef: string;
    amountCents: number;
    currency: string;
    receivedAt: string;
    livemode: boolean;
  }): Promise<CompletePaymentResult>;
  markOnlinePaymentFailed(
    providerRef: string,
    failureCode: string,
    status?: string,
  ): Promise<MarkFailedPaymentResult>;
  recordOnlineRefund(input: {
    paymentId: string;
    refundRef: string;
    amountCents: number;
    receivedAt: string;
    refundId: string | null;
  }): Promise<RefundRecordResult>;
  markRefundFailed(input: {
    refundId: string | null;
    refundRef: string | null;
    failureCode: string;
  }): Promise<MarkRefundFailedResult>;
  recordPaymentDispute(input: {
    paymentId: string;
    providerRef: string;
    amountCents: number;
    status: string;
  }): Promise<RecordDisputeResult>;
}

export interface WebhookDeps {
  /** PAYMENTS_MODE, STRIPE_WEBHOOK_SECRET, optional _2 und _THIN. */
  env: PaymentsEnv;
  /** Wirft bei fehlender Konfiguration. */
  getProvider: () => PaymentProvider;
  /** Wirft bei fehlender Konfiguration. */
  getStore: () => WebhookStore;
  log: WebhookLogger;
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const received = () => json(200, { received: true });
const failure = (status: number, code: string) => json(status, { code });

/**
 * Gesetzte Webhook-Secrets in fester Reihenfolge.
 * `_2` für Snapshot-Rotation, `_THIN` für das zweite Stripe-Ziel (Thin-Nutzlast).
 */
export function readWebhookSecrets(env: PaymentsEnv): string[] {
  return ["STRIPE_WEBHOOK_SECRET", "STRIPE_WEBHOOK_SECRET_2", "STRIPE_WEBHOOK_SECRET_THIN"]
    .map((key) => env.get(key)?.trim() ?? "")
    .filter((value) => value !== "");
}

/** null = Body größer als `max` Bytes. */
async function readBodyLimited(req: Request, max: number): Promise<string | null> {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

type VerifyOutcome = { ok: true; event: ProviderEvent } | { ok: false; code: string };

async function verifyWithAnySecret(
  provider: PaymentProvider,
  rawBody: string,
  signature: string,
  secrets: string[],
): Promise<VerifyOutcome> {
  for (const secret of secrets) {
    try {
      return { ok: true, event: await provider.verifyWebhook(rawBody, signature, secret) };
    } catch (err) {
      if (err instanceof ProviderError && err.code === "INVALID_SIGNATURE") continue;
      if (err instanceof ProviderError) return { ok: false, code: err.code };
      return { ok: false, code: "INVALID_SIGNATURE" };
    }
  }
  return { ok: false, code: "INVALID_SIGNATURE" };
}

export async function handleWebhook(req: Request, deps: WebhookDeps): Promise<Response> {
  const { log } = deps;
  const logResult = (result: string, event?: ProviderEvent) =>
    log.info("payments-webhook", { type: event?.type ?? null, event_id: event?.id ?? null, result });

  if (req.method !== "POST") return failure(405, "METHOD_NOT_ALLOWED");

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    logResult("PAYLOAD_TOO_LARGE");
    return failure(413, "PAYLOAD_TOO_LARGE");
  }

  let mode: "test" | "live";
  let provider: PaymentProvider;
  let store: WebhookStore;
  const secrets = readWebhookSecrets(deps.env);
  try {
    mode = readPaymentsMode(deps.env);
    if (secrets.length === 0) throw new ProviderError("CONFIG_ERROR", "STRIPE_WEBHOOK_SECRET");
    if (secrets.some((s) => !s.startsWith("whsec_"))) {
      throw new ProviderError("CONFIG_ERROR", "STRIPE_WEBHOOK_SECRET_FORMAT");
    }
    provider = deps.getProvider();
    store = deps.getStore();
  } catch {
    log.error("payments-webhook", { result: "CONFIG_ERROR" });
    return failure(500, "CONFIG_ERROR");
  }

  const signature = req.headers.get("stripe-signature")?.trim() ?? "";
  if (!signature) {
    logResult("MISSING_SIGNATURE");
    return failure(400, "MISSING_SIGNATURE");
  }

  const rawBody = await readBodyLimited(req, MAX_BODY_BYTES);
  if (rawBody === null) {
    logResult("PAYLOAD_TOO_LARGE");
    return failure(413, "PAYLOAD_TOO_LARGE");
  }

  const verified = await verifyWithAnySecret(provider, rawBody, signature, secrets);
  if (!verified.ok) {
    logResult(verified.code);
    return failure(verified.code === "CONFIG_ERROR" ? 500 : 400, verified.code);
  }
  const event = verified.event;

  if (event.livemode !== (mode === "live")) {
    logResult("LIVEMODE_MISMATCH", event);
    return failure(400, "LIVEMODE_MISMATCH");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    logResult("INVALID_EVENT", event);
    return failure(400, "INVALID_EVENT");
  }

  let record: RecordEventResult;
  try {
    record = await store.recordEvent({
      provider: provider.id,
      eventId: event.id,
      eventType: event.type,
      accountRef: event.accountRef,
      livemode: event.livemode,
      payload,
    });
  } catch {
    logResult("DB_ERROR", event);
    return failure(500, "DB_ERROR");
  }

  if (!record.ok) {
    // FORBIDDEN heißt: die Function spricht nicht als service_role.
    if (record.code === "FORBIDDEN") {
      logResult("CONFIG_ERROR", event);
      return failure(500, "CONFIG_ERROR");
    }
    logResult(record.code, event);
    return received();
  }

  if (record.alreadyProcessed) {
    logResult("ALREADY_PROCESSED", event);
    return received();
  }

  const recordId = record.id;
  const failTransient = async (code: string) => {
    try {
      await store.markFailed(recordId);
    } catch {
      logResult("DB_ERROR", event);
    }
    logResult(code, event);
    return failure(500, code);
  };

  let processingError: string | null = null;

  let domain: ReturnType<PaymentProvider["toDomainEvent"]> = null;
  try {
    domain = provider.toDomainEvent(event);
  } catch (err) {
    processingError = err instanceof ProviderError ? err.code : "INVALID_EVENT";
  }

  if (domain?.type === "provider_account.updated") {
    if (record.tenantId === null) {
      processingError = "TENANT_NOT_RESOLVED";
    } else {
      let state: ProviderAccountState | null = null;
      try {
        // W3: Stand beim Anbieter nachlesen, nicht aus dem Event übernehmen.
        state = await provider.getAccountState(domain.accountRef);
      } catch (err) {
        if (err instanceof ProviderError && err.code === "PROVIDER_REJECTED") {
          processingError = "PROVIDER_REJECTED";
        } else {
          return await failTransient("PROVIDER_UNAVAILABLE");
        }
      }

      if (state) {
        let upsert: UpsertAccountResult;
        try {
          upsert = await store.upsertAccount(record.tenantId, provider.id, state);
        } catch {
          return await failTransient("DB_ERROR");
        }
        if (!upsert.ok) {
          processingError = ERROR_CODE_RE.test(upsert.code) ? upsert.code : "UPSERT_FAILED";
        }
      }
    }
  } else if (domain?.type === "provider_account.disconnected") {
    let marked: MarkDisconnectedResult;
    try {
      marked = await store.markDisconnected(provider.id, domain.accountRef);
    } catch {
      return await failTransient("DB_ERROR");
    }
    if (!marked.ok) {
      processingError = ERROR_CODE_RE.test(marked.code) ? marked.code : "DISCONNECT_FAILED";
    }
  } else if (domain?.type === "payment.updated") {
    // J6–J8: retrievePayment (Q6), dann nach Stripe-Stand handeln.
    let lookup: PaymentAttemptLookup;
    try {
      lookup = await store.findPaymentAttempt(provider.id, domain.ref);
    } catch {
      return await failTransient("DB_ERROR");
    }

    if (!lookup.found) {
      let retrieved;
      try {
        retrieved = await provider.retrievePayment(domain.accountRef, domain.ref);
      } catch (err) {
        if (err instanceof ProviderError && err.code === "PROVIDER_UNAVAILABLE") {
          return await failTransient("PROVIDER_UNAVAILABLE");
        }
        if (err instanceof ProviderError && err.code === "RATE_LIMITED") {
          return await failTransient("RATE_LIMITED");
        }
        log.info("payments-webhook", {
          type: event.type,
          event_id: event.id,
          result: "payment.unknown",
          ref: domain.ref,
        });
        try {
          await store.markProcessed(recordId, null);
        } catch {
          return await failTransient("DB_ERROR");
        }
        logResult("PROCESSED", event);
        return received();
      }
      if (retrieved.status === "succeeded") {
        log.error("payments-webhook", {
          type: event.type,
          event_id: event.id,
          result: "payment.orphan",
          ref: domain.ref,
        });
      } else {
        log.info("payments-webhook", {
          type: event.type,
          event_id: event.id,
          result: "payment.unknown",
          ref: domain.ref,
        });
      }
      try {
        await store.markProcessed(recordId, retrieved.status === "succeeded" ? "ORPHAN" : null);
      } catch {
        return await failTransient("DB_ERROR");
      }
      logResult(retrieved.status === "succeeded" ? "ORPHAN" : "PROCESSED", event);
      return received();
    } else {
      // Mandanten-Schutz: Event-Konto = Studio-Konto
      if (
        !lookup.studioAccountRef ||
        lookup.studioAccountRef !== domain.accountRef
      ) {
        log.warn("payments-webhook", {
          type: event.type,
          event_id: event.id,
          result: "payment.account_mismatch",
          ref: domain.ref,
        });
        try {
          await store.markProcessed(recordId, "ACCOUNT_MISMATCH");
        } catch {
          return await failTransient("DB_ERROR");
        }
        logResult("ACCOUNT_MISMATCH", event);
        return received();
      }

      let retrieved;
      try {
        retrieved = await provider.retrievePayment(domain.accountRef, domain.ref);
      } catch (err) {
        if (err instanceof ProviderError && (err.code === "PROVIDER_UNAVAILABLE" || err.code === "RATE_LIMITED")) {
          return await failTransient(err.code);
        }
        processingError = err instanceof ProviderError ? err.code : "PROVIDER_UNAVAILABLE";
        try {
          await store.markProcessed(recordId, processingError);
        } catch {
          return await failTransient("DB_ERROR");
        }
        logResult(processingError, event);
        return received();
      }

      if (retrieved.status === "succeeded") {
        let complete: CompletePaymentResult;
        try {
          complete = await store.completeOnlinePayment({
            providerRef: domain.ref,
            amountCents: retrieved.amountCents,
            currency: retrieved.currency,
            receivedAt: retrieved.receivedAt ?? new Date().toISOString(),
            livemode: retrieved.livemode,
          });
        } catch {
          return await failTransient("DB_ERROR");
        }
        if (!complete.ok) {
          // Fachlicher Fehler → 200
          processingError = ERROR_CODE_RE.test(complete.code) ? complete.code : "COMPLETE_FAILED";
        }
      } else if (retrieved.status === "failed") {
        const raw = retrieved.failureCode ?? "PAYMENT_FAILED";
        const code = raw.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
        try {
          await store.markOnlinePaymentFailed(domain.ref, code || "PAYMENT_FAILED");
        } catch {
          return await failTransient("DB_ERROR");
        }
      } else if (retrieved.status === "canceled") {
        try {
          await store.markOnlinePaymentFailed(domain.ref, "CANCELED", "canceled");
        } catch {
          return await failTransient("DB_ERROR");
        }
      }
      // processing / requires_action → nichts
    }
  } else if (domain?.type === "payment.refunds_changed") {
    let lookup: PaymentLookup;
    try {
      lookup = await store.findPaymentByProviderRef(provider.id, domain.ref);
    } catch {
      return await failTransient("DB_ERROR");
    }

    if (!lookup.found) {
      log.info("payments-webhook", {
        type: event.type,
        event_id: event.id,
        result: "refund.unknown",
        ref: domain.ref,
      });
      try {
        await store.markProcessed(recordId, null);
      } catch {
        return await failTransient("DB_ERROR");
      }
      logResult("PROCESSED", event);
      return received();
    }

    if (!lookup.studioAccountRef || lookup.studioAccountRef !== domain.accountRef) {
      log.warn("payments-webhook", {
        type: event.type,
        event_id: event.id,
        result: "refund.account_mismatch",
        ref: domain.ref,
      });
      try {
        await store.markProcessed(recordId, "ACCOUNT_MISMATCH");
      } catch {
        return await failTransient("DB_ERROR");
      }
      logResult("ACCOUNT_MISMATCH", event);
      return received();
    }

    let listed;
    try {
      listed = await provider.listRefunds(domain.accountRef, domain.ref);
    } catch (err) {
      if (err instanceof ProviderError && (err.code === "PROVIDER_UNAVAILABLE" || err.code === "RATE_LIMITED")) {
        return await failTransient(err.code);
      }
      processingError = err instanceof ProviderError ? err.code : "PROVIDER_UNAVAILABLE";
      try {
        await store.markProcessed(recordId, processingError);
      } catch {
        return await failTransient("DB_ERROR");
      }
      logResult(processingError, event);
      return received();
    }

    for (const item of listed) {
      if (item.status === "succeeded" || item.status === "pending") {
        let recorded: RefundRecordResult;
        try {
          recorded = await store.recordOnlineRefund({
            paymentId: lookup.paymentId,
            refundRef: item.refundRef,
            amountCents: item.amountCents,
            receivedAt: item.receivedAt ?? new Date().toISOString(),
            refundId: item.refundId,
          });
        } catch {
          return await failTransient("DB_ERROR");
        }
        if (!recorded.ok) {
          processingError = ERROR_CODE_RE.test(recorded.code) ? recorded.code : "REFUND_RECORD_FAILED";
        }
      } else if (item.status === "failed" || item.status === "canceled") {
        try {
          await store.markRefundFailed({
            refundId: item.refundId,
            refundRef: item.refundRef,
            failureCode: item.status === "canceled" ? "CANCELED" : "REFUND_FAILED",
          });
        } catch {
          return await failTransient("DB_ERROR");
        }
      }
    }
  } else if (domain?.type === "payment.dispute_changed") {
    let dispute;
    try {
      dispute = await provider.retrieveDispute(domain.accountRef, domain.disputeRef);
    } catch (err) {
      if (err instanceof ProviderError && (err.code === "PROVIDER_UNAVAILABLE" || err.code === "RATE_LIMITED")) {
        return await failTransient(err.code);
      }
      processingError = err instanceof ProviderError ? err.code : "PROVIDER_UNAVAILABLE";
      try {
        await store.markProcessed(recordId, processingError);
      } catch {
        return await failTransient("DB_ERROR");
      }
      logResult(processingError, event);
      return received();
    }

    let lookup: PaymentLookup;
    try {
      lookup = await store.findPaymentByProviderRef(provider.id, dispute.paymentRef);
    } catch {
      return await failTransient("DB_ERROR");
    }

    if (!lookup.found) {
      // createDispute-Karten feuern oft vor complete_online_payment → Stripe soll retryen.
      log.info("payments-webhook", {
        type: event.type,
        event_id: event.id,
        result: "dispute.unknown",
        ref: dispute.paymentRef,
      });
      return await failTransient("PAYMENT_NOT_READY");
    }

    if (!lookup.studioAccountRef || lookup.studioAccountRef !== domain.accountRef) {
      log.warn("payments-webhook", {
        type: event.type,
        event_id: event.id,
        result: "dispute.account_mismatch",
        ref: dispute.paymentRef,
      });
      try {
        await store.markProcessed(recordId, "ACCOUNT_MISMATCH");
      } catch {
        return await failTransient("DB_ERROR");
      }
      logResult("ACCOUNT_MISMATCH", event);
      return received();
    }

    let recorded: RecordDisputeResult;
    try {
      recorded = await store.recordPaymentDispute({
        paymentId: lookup.paymentId,
        providerRef: dispute.disputeRef,
        amountCents: dispute.amountCents,
        status: dispute.status,
      });
    } catch {
      return await failTransient("DB_ERROR");
    }
    if (!recorded.ok) {
      processingError = ERROR_CODE_RE.test(recorded.code) ? recorded.code : "DISPUTE_RECORD_FAILED";
    }
  }

  try {
    await store.markProcessed(recordId, processingError);
  } catch {
    logResult("DB_ERROR", event);
    return failure(500, "DB_ERROR");
  }

  logResult(processingError ?? (record.duplicate ? "REPROCESSED" : "PROCESSED"), event);
  return received();
}
