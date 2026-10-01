/**
 * payments-checkout (Geldkette 2.2a-3). Reine Logik, Abhängigkeiten injiziert.
 * Auth und Tenant kommen von außen (initService). Stripe nur über den Port.
 */
import {
  type PaymentProvider,
  ProviderError,
} from "../_shared/payments/port.ts";

export const MAX_BODY_BYTES = 16 * 1024;

export interface CheckoutLogger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export type PrepareResult =
  | {
    ok: true;
    attemptId: string;
    amountCents: number;
    currency: string;
    accountRef: string;
    providerRef: string | null;
    holdExpiresAt: string;
    livemode: boolean;
    registrationId: string;
  }
  | { ok: false; code: string };

export type AttachResult = { ok: true; providerRef: string } | { ok: false; code: string };
export type CheckResult = { ok: true } | { ok: false; code: string };
export type CompleteResult = { ok: true; code: string | null } | { ok: false; code: string };
export type MarkFailedResult = { ok: true } | { ok: false; code: string };

export interface CancelableAttempt {
  attemptId: string;
  providerRef: string;
}

export interface AttemptStatusView {
  attemptId: string;
  registrationId: string;
  providerRef: string | null;
  attemptStatus: string;
  registrationStatus: string;
  amountCents: number;
  currency: string;
  livemode: boolean;
  accountRef: string | null;
}

export interface CheckoutStore {
  prepareOnlinePayment(registrationId: string, userId: string): Promise<PrepareResult>;
  attachPaymentRef(attemptId: string, providerRef: string): Promise<AttachResult>;
  checkBeforeConfirm(attemptId: string, userId: string): Promise<CheckResult>;
  completeOnlinePayment(input: {
    providerRef: string;
    amountCents: number;
    currency: string;
    receivedAt: string;
    livemode: boolean;
  }): Promise<CompleteResult>;
  markOnlinePaymentFailed(providerRef: string, failureCode: string): Promise<MarkFailedResult>;
  listCancelableAttempts(registrationId: string, excludeAttemptId: string): Promise<CancelableAttempt[]>;
  getAttemptForMember(
    attemptId: string,
    memberId: string,
    tenantId: string,
  ): Promise<AttemptStatusView | null>;
}

export interface CheckoutDeps {
  provider: PaymentProvider;
  store: CheckoutStore;
  log: CheckoutLogger;
  errorResponse: (status: number, code: string, message: string) => Response;
  corsHeaders: Record<string, string>;
  /** z. B. omlify-dev.de — für return_url und Domain-Registrierung. */
  appBaseDomain: string;
  /** Studio-Slug aus x-omlify-tenant. */
  tenantSlug: string;
}

export interface CheckoutCaller {
  tenantId: string;
  memberId: string;
}

const BROWSER_CODES = new Set([
  "HOLD_EXPIRED",
  "NOT_PENDING",
  "ONLINE_DISABLED",
  "CARD_DECLINED",
  "AUTHENTICATION_REQUIRED",
  "PROVIDER_UNAVAILABLE",
  "FORBIDDEN",
  "INVALID_REQUEST",
]);

const ERROR_MESSAGES: Record<string, string> = {
  HOLD_EXPIRED: "Die Zahlungsfrist ist abgelaufen",
  NOT_PENDING: "Diese Buchung wartet nicht auf Zahlung",
  ONLINE_DISABLED: "Online-Zahlung ist nicht verfügbar",
  CARD_DECLINED: "Die Karte wurde abgelehnt",
  AUTHENTICATION_REQUIRED: "Zusätzliche Authentifizierung nötig",
  PROVIDER_UNAVAILABLE: "Zahlungsanbieter nicht erreichbar",
  FORBIDDEN: "Kein Zugriff",
  INVALID_REQUEST: "Ungültige Anfrage",
};

function jsonOk(body: Record<string, unknown>, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function mapRpcCode(code: string): string {
  if (BROWSER_CODES.has(code)) return code;
  if (code === "ATTEMPT_NOT_ACTIVE" || code === "ATTEMPT_NOT_FOUND") return "INVALID_REQUEST";
  if (code === "REF_ALREADY_SET" || code === "INVALID_REF" || code === "NOT_FOUND") {
    return "INVALID_REQUEST";
  }
  return "INVALID_REQUEST";
}

function respondCode(
  deps: CheckoutDeps,
  code: string,
  httpOverride?: number,
): Response {
  const mapped = mapRpcCode(code);
  const status = httpOverride ??
    (mapped === "FORBIDDEN"
      ? 403
      : mapped === "PROVIDER_UNAVAILABLE"
      ? 503
      : mapped === "HOLD_EXPIRED" || mapped === "NOT_PENDING" || mapped === "ONLINE_DISABLED"
      ? 409
      : 400);
  return deps.errorResponse(
    status,
    mapped,
    ERROR_MESSAGES[mapped] ?? ERROR_MESSAGES.INVALID_REQUEST,
  );
}

function mapProviderHttp(err: unknown, deps: CheckoutDeps): Response {
  if (err instanceof ProviderError) {
    if (err.code === "PROVIDER_UNAVAILABLE" || err.code === "RATE_LIMITED") {
      return respondCode(deps, "PROVIDER_UNAVAILABLE");
    }
    if (err.code === "CARD_DECLINED") return respondCode(deps, "CARD_DECLINED");
    if (err.code === "AUTHENTICATION_REQUIRED") {
      return respondCode(deps, "AUTHENTICATION_REQUIRED");
    }
    if (err.code === "CONFIG_ERROR") {
      return deps.errorResponse(500, "CONFIG_ERROR", "Zahlungen sind nicht konfiguriert");
    }
  }
  return respondCode(deps, "INVALID_REQUEST");
}

/** return_url serverseitig — nie aus dem Browser (F3). */
export function buildPaymentReturnUrl(tenantSlug: string, appBaseDomain: string): string {
  const domain = appBaseDomain.trim().toLowerCase();
  const slug = tenantSlug.trim().toLowerCase();
  if (!domain || !slug) throw new ProviderError("CONFIG_ERROR", "APP_BASE_DOMAIN");
  if (domain.includes("localhost")) {
    const host = domain.includes(":") ? domain : `${domain}:5173`;
    return `http://${slug}.${host}/my-registrations?payment=return&tenant=${encodeURIComponent(slug)}`;
  }
  return `https://${slug}.${domain}/my-registrations?payment=return`;
}

function failureCodeForBrowser(raw: string | undefined): string {
  if (!raw) return "CARD_DECLINED";
  const upper = raw.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  if (upper === "AUTHENTICATION_REQUIRED") return "AUTHENTICATION_REQUIRED";
  if (BROWSER_CODES.has(upper)) return upper;
  return "CARD_DECLINED";
}

function failureCodeForDb(browserCode: string): string {
  return browserCode;
}

export async function handleCheckout(
  req: Request,
  caller: CheckoutCaller,
  deps: CheckoutDeps,
): Promise<Response> {
  const { log, errorResponse, corsHeaders } = deps;

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return errorResponse(405, "METHOD_NOT_ALLOWED", "Methode nicht erlaubt");
  }

  const contentLength = req.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    return errorResponse(413, "PAYLOAD_TOO_LARGE", "Anfrage zu groß");
  }

  let body: Record<string, unknown>;
  try {
    const text = await req.text();
    if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
      return errorResponse(413, "PAYLOAD_TOO_LARGE", "Anfrage zu groß");
    }
    body = text.trim() === "" ? {} : JSON.parse(text) as Record<string, unknown>;
  } catch {
    return errorResponse(400, "INVALID_REQUEST", ERROR_MESSAGES.INVALID_REQUEST);
  }

  const action = typeof body.action === "string" ? body.action : "";
  if (action !== "prepare" && action !== "confirm" && action !== "status") {
    return errorResponse(400, "INVALID_REQUEST", "Unbekannte Aktion");
  }

  try {
    if (action === "prepare") return await handlePrepare(body, caller, deps);
    if (action === "confirm") return await handleConfirm(body, caller, deps);
    return await handleStatus(body, caller, deps);
  } catch (err) {
    if (err instanceof ProviderError && err.code === "PROVIDER_UNAVAILABLE") {
      log.error("payments-checkout", { action, result: "PROVIDER_UNAVAILABLE" });
      return respondCode(deps, "PROVIDER_UNAVAILABLE");
    }
    log.error("payments-checkout", {
      action,
      result: err instanceof ProviderError ? err.code : "INTERNAL",
    });
    if (err instanceof ProviderError) return mapProviderHttp(err, deps);
    return errorResponse(500, "INTERNAL", "Ein Fehler ist aufgetreten");
  }
}

async function handlePrepare(
  body: Record<string, unknown>,
  caller: CheckoutCaller,
  deps: CheckoutDeps,
): Promise<Response> {
  const { store, provider, log, corsHeaders } = deps;
  const registrationId = typeof body.registration_id === "string" ? body.registration_id : "";
  if (!registrationId) return respondCode(deps, "INVALID_REQUEST");

  let prepared: PrepareResult;
  try {
    prepared = await store.prepareOnlinePayment(registrationId, caller.memberId);
  } catch {
    log.error("payments-checkout", { action: "prepare", result: "DB_ERROR" });
    return deps.errorResponse(500, "DB_ERROR", "Ein Fehler ist aufgetreten");
  }

  if (!prepared.ok) {
    log.info("payments-checkout", { action: "prepare", result: prepared.code });
    return respondCode(deps, prepared.code);
  }

  // Ältere failed/canceled Versuche mit pi_… best effort stornieren (F2).
  try {
    const old = await store.listCancelableAttempts(registrationId, prepared.attemptId);
    for (const row of old) {
      try {
        await provider.cancelPaymentIntent(prepared.accountRef, row.providerRef);
        log.info("payments-checkout", {
          action: "prepare",
          result: "CANCEL_OLD",
          attempt_id: row.attemptId,
          ref: row.providerRef,
        });
      } catch (err) {
        log.warn("payments-checkout", {
          action: "prepare",
          result: err instanceof ProviderError ? err.code : "CANCEL_OLD_FAILED",
          attempt_id: row.attemptId,
          ref: row.providerRef,
        });
      }
    }
  } catch {
    log.warn("payments-checkout", { action: "prepare", result: "LIST_OLD_FAILED" });
  }

  let providerRef = prepared.providerRef;
  if (!providerRef) {
    let created;
    try {
      created = await provider.createPaymentIntent({
        accountRef: prepared.accountRef,
        amountCents: prepared.amountCents,
        currency: "EUR",
        attemptId: prepared.attemptId,
        tenantId: caller.tenantId,
        registrationId,
        idempotencyKey: prepared.attemptId,
      });
    } catch (err) {
      log.error("payments-checkout", {
        action: "prepare",
        result: err instanceof ProviderError ? err.code : "PROVIDER_ERROR",
        attempt_id: prepared.attemptId,
      });
      return mapProviderHttp(err, deps);
    }

    let attached: AttachResult;
    try {
      attached = await store.attachPaymentRef(prepared.attemptId, created.ref);
    } catch {
      log.error("payments-checkout", {
        action: "prepare",
        result: "DB_ERROR",
        attempt_id: prepared.attemptId,
        ref: created.ref,
      });
      return deps.errorResponse(500, "DB_ERROR", "Ein Fehler ist aufgetreten");
    }
    if (!attached.ok) {
      log.error("payments-checkout", {
        action: "prepare",
        result: attached.code,
        attempt_id: prepared.attemptId,
        ref: created.ref,
      });
      return respondCode(deps, attached.code);
    }
    providerRef = attached.providerRef;
  }

  log.info("payments-checkout", {
    action: "prepare",
    result: "OK",
    attempt_id: prepared.attemptId,
    ref: providerRef,
  });

  return jsonOk({
    attempt_id: prepared.attemptId,
    amount_cents: prepared.amountCents,
    currency: prepared.currency,
    hold_expires_at: prepared.holdExpiresAt,
    account_ref: prepared.accountRef,
  }, corsHeaders);
}

async function handleConfirm(
  body: Record<string, unknown>,
  caller: CheckoutCaller,
  deps: CheckoutDeps,
): Promise<Response> {
  const { store, provider, log, corsHeaders, tenantSlug, appBaseDomain } = deps;
  const attemptId = typeof body.attempt_id === "string" ? body.attempt_id : "";
  const confirmationToken = typeof body.confirmation_token === "string" ? body.confirmation_token : "";
  // return_url aus dem Body wird ignoriert (F3 / Test).
  void body.return_url;

  if (!attemptId || !confirmationToken) return respondCode(deps, "INVALID_REQUEST");

  let check: CheckResult;
  try {
    check = await store.checkBeforeConfirm(attemptId, caller.memberId);
  } catch {
    log.error("payments-checkout", { action: "confirm", result: "DB_ERROR", attempt_id: attemptId });
    return deps.errorResponse(500, "DB_ERROR", "Ein Fehler ist aufgetreten");
  }
  if (!check.ok) {
    log.info("payments-checkout", { action: "confirm", result: check.code, attempt_id: attemptId });
    return respondCode(deps, check.code);
  }

  let view: AttemptStatusView | null;
  try {
    view = await store.getAttemptForMember(attemptId, caller.memberId, caller.tenantId);
  } catch {
    log.error("payments-checkout", { action: "confirm", result: "DB_ERROR", attempt_id: attemptId });
    return deps.errorResponse(500, "DB_ERROR", "Ein Fehler ist aufgetreten");
  }
  if (!view || !view.providerRef || !view.accountRef) {
    log.info("payments-checkout", { action: "confirm", result: "FORBIDDEN", attempt_id: attemptId });
    return respondCode(deps, "FORBIDDEN");
  }

  const returnUrl = buildPaymentReturnUrl(tenantSlug, appBaseDomain);

  let confirmed;
  try {
    confirmed = await provider.confirmPaymentIntent({
      accountRef: view.accountRef,
      ref: view.providerRef,
      confirmationToken,
      returnUrl,
    });
  } catch (err) {
    log.error("payments-checkout", {
      action: "confirm",
      result: err instanceof ProviderError ? err.code : "PROVIDER_ERROR",
      attempt_id: attemptId,
      ref: view.providerRef,
    });
    return mapProviderHttp(err, deps);
  }

  if (confirmed.status === "requires_action") {
    log.info("payments-checkout", {
      action: "confirm",
      result: "REQUIRES_ACTION",
      attempt_id: attemptId,
      ref: view.providerRef,
    });
    return jsonOk({
      status: "requires_action",
      client_secret: confirmed.clientSecret ?? null,
      attempt_id: attemptId,
    }, corsHeaders);
  }

  if (confirmed.status === "failed") {
    const browserCode = failureCodeForBrowser(confirmed.failureCode);
    try {
      await store.markOnlinePaymentFailed(view.providerRef, failureCodeForDb(browserCode));
    } catch {
      log.error("payments-checkout", {
        action: "confirm",
        result: "DB_ERROR",
        attempt_id: attemptId,
        ref: view.providerRef,
      });
    }
    log.info("payments-checkout", {
      action: "confirm",
      result: browserCode,
      attempt_id: attemptId,
      ref: view.providerRef,
    });
    return respondCode(deps, browserCode);
  }

  if (confirmed.status === "succeeded" || confirmed.status === "processing") {
    if (confirmed.status === "succeeded") {
      let retrieved;
      try {
        retrieved = await provider.retrievePayment(view.accountRef, view.providerRef);
      } catch (err) {
        log.error("payments-checkout", {
          action: "confirm",
          result: err instanceof ProviderError ? err.code : "PROVIDER_ERROR",
          attempt_id: attemptId,
          ref: view.providerRef,
        });
        return mapProviderHttp(err, deps);
      }
      if (retrieved.status === "succeeded") {
        try {
          await store.completeOnlinePayment({
            providerRef: view.providerRef,
            amountCents: retrieved.amountCents,
            currency: retrieved.currency,
            receivedAt: retrieved.receivedAt ?? new Date().toISOString(),
            livemode: retrieved.livemode,
          });
        } catch {
          log.error("payments-checkout", {
            action: "confirm",
            result: "DB_ERROR",
            attempt_id: attemptId,
            ref: view.providerRef,
          });
          return deps.errorResponse(500, "DB_ERROR", "Ein Fehler ist aufgetreten");
        }
      }
    }

    let after: AttemptStatusView | null;
    try {
      after = await store.getAttemptForMember(attemptId, caller.memberId, caller.tenantId);
    } catch {
      after = view;
    }

    log.info("payments-checkout", {
      action: "confirm",
      result: confirmed.status === "succeeded" ? "SUCCEEDED" : "PROCESSING",
      attempt_id: attemptId,
      ref: view.providerRef,
    });

    return jsonOk({
      status: confirmed.status,
      attempt_id: attemptId,
      attempt_status: after?.attemptStatus ?? null,
      registration_status: after?.registrationStatus ?? null,
    }, corsHeaders);
  }

  if (confirmed.status === "canceled") {
    try {
      await store.markOnlinePaymentFailed(view.providerRef, "CANCELED");
    } catch {
      // best effort
    }
    log.info("payments-checkout", {
      action: "confirm",
      result: "CANCELED",
      attempt_id: attemptId,
      ref: view.providerRef,
    });
    return respondCode(deps, "INVALID_REQUEST");
  }

  return respondCode(deps, "INVALID_REQUEST");
}

async function handleStatus(
  body: Record<string, unknown>,
  caller: CheckoutCaller,
  deps: CheckoutDeps,
): Promise<Response> {
  const { store, provider, log, corsHeaders } = deps;
  const attemptId = typeof body.attempt_id === "string" ? body.attempt_id : "";
  if (!attemptId) return respondCode(deps, "INVALID_REQUEST");

  let view: AttemptStatusView | null;
  try {
    view = await store.getAttemptForMember(attemptId, caller.memberId, caller.tenantId);
  } catch {
    log.error("payments-checkout", { action: "status", result: "DB_ERROR", attempt_id: attemptId });
    return deps.errorResponse(500, "DB_ERROR", "Ein Fehler ist aufgetreten");
  }
  if (!view) {
    log.info("payments-checkout", { action: "status", result: "FORBIDDEN", attempt_id: attemptId });
    return respondCode(deps, "FORBIDDEN");
  }

  if (view.providerRef && view.accountRef) {
    let retrieved;
    try {
      retrieved = await provider.retrievePayment(view.accountRef, view.providerRef);
    } catch (err) {
      log.error("payments-checkout", {
        action: "status",
        result: err instanceof ProviderError ? err.code : "PROVIDER_ERROR",
        attempt_id: attemptId,
        ref: view.providerRef,
      });
      return mapProviderHttp(err, deps);
    }

    if (retrieved.status === "succeeded") {
      try {
        await store.completeOnlinePayment({
          providerRef: view.providerRef,
          amountCents: retrieved.amountCents,
          currency: retrieved.currency,
          receivedAt: retrieved.receivedAt ?? new Date().toISOString(),
          livemode: retrieved.livemode,
        });
      } catch {
        log.error("payments-checkout", {
          action: "status",
          result: "DB_ERROR",
          attempt_id: attemptId,
          ref: view.providerRef,
        });
        return deps.errorResponse(500, "DB_ERROR", "Ein Fehler ist aufgetreten");
      }
    } else if (retrieved.status === "failed" || retrieved.status === "canceled") {
      try {
        await store.markOnlinePaymentFailed(
          view.providerRef,
          failureCodeForDb(failureCodeForBrowser(retrieved.failureCode)),
        );
      } catch {
        // best effort
      }
    }

    try {
      view = await store.getAttemptForMember(attemptId, caller.memberId, caller.tenantId) ?? view;
    } catch {
      // keep previous view
    }
  }

  log.info("payments-checkout", {
    action: "status",
    result: "OK",
    attempt_id: attemptId,
    ref: view.providerRef ?? undefined,
  });

  return jsonOk({
    attempt_id: attemptId,
    attempt_status: view.attemptStatus,
    registration_status: view.registrationStatus,
  }, corsHeaders);
}
