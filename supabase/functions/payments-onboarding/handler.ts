/**
 * payments-onboarding (Geldkette 1.3a). Reine Logik, Abhängigkeiten injiziert.
 * Auth und Tenant kommen von außen (initService); die Rolle prüft
 * get_owner_payment_context über den Service-Store. Keine acct_… in Antworten.
 */
import {
  connectedAccountIdempotencyKey,
  type PaymentProvider,
  type ProviderAccountState,
  ProviderError,
  type ProviderId,
} from "../_shared/payments/port.ts";
import type { OnboardingSession } from "../_shared/payments/stripe/onboarding.ts";

export interface OnboardingLogger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export interface OwnerPaymentContext {
  isOwner: boolean;
  platformEnabled: boolean;
  accountRef: string | null;
  onboardingStatus: string;
}

export type UpsertResult = { ok: true } | { ok: false; code: string };

/** Setup-Status ohne interne Kontoreferenz (Antwort an den Client). */
export type PaymentSetupStatus = Record<string, unknown>;

export interface OnboardingStore {
  getOwnerContext(tenantId: string, memberId: string): Promise<OwnerPaymentContext>;
  upsertAccount(tenantId: string, provider: ProviderId, state: ProviderAccountState): Promise<UpsertResult>;
  /** Ruft get_payment_setup_status mit dem Nutzer-JWT auf. */
  getSetupStatus(): Promise<PaymentSetupStatus>;
}

export interface OnboardingDeps {
  provider: PaymentProvider;
  store: OnboardingStore;
  /** Account Session für die eingebettete Komponente (stripe/onboarding.ts). */
  createSession: (accountRef: string) => Promise<OnboardingSession>;
  log: OnboardingLogger;
  /** CORS/JSON-Helfer aus initService. */
  errorResponse: (status: number, code: string, message: string) => Response;
  corsHeaders: Record<string, string>;
}

export interface OnboardingCaller {
  tenantId: string;
  memberId: string;
}

function jsonOk(body: Record<string, unknown>, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function mapProviderHttp(err: unknown, errorResponse: OnboardingDeps["errorResponse"]): Response {
  if (err instanceof ProviderError) {
    if (err.code === "CONFIG_ERROR") {
      return errorResponse(500, "CONFIG_ERROR", "Zahlungen sind nicht konfiguriert");
    }
    if (err.code === "PROVIDER_UNAVAILABLE") {
      return errorResponse(503, "PROVIDER_UNAVAILABLE", "Zahlungsanbieter nicht erreichbar");
    }
  }
  return errorResponse(500, "PROVIDER_ERROR", "Zahlungsanbieter hat die Anfrage abgelehnt");
}

/** Stellt sicher, dass keine Kontoreferenz in die Antwort rutscht. */
function assertNoAccountRef(body: Record<string, unknown>): void {
  const text = JSON.stringify(body);
  if (/\bacct_[A-Za-z0-9_]+\b/.test(text)) {
    throw new Error("Antwort enthält Kontoreferenz");
  }
}

export async function handleOnboarding(
  req: Request,
  caller: OnboardingCaller,
  deps: OnboardingDeps,
): Promise<Response> {
  const { log, errorResponse, store } = deps;

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: deps.corsHeaders });
  }
  if (req.method !== "POST") {
    return errorResponse(405, "METHOD_NOT_ALLOWED", "Methode nicht erlaubt");
  }

  let action: string;
  try {
    const text = await req.text();
    const body = text.trim() === "" ? {} : JSON.parse(text);
    action = typeof body?.action === "string" ? body.action : "";
  } catch {
    return errorResponse(400, "INVALID_BODY", "Ungültiger JSON-Body");
  }

  if (action !== "start" && action !== "refresh") {
    return errorResponse(400, "INVALID_ACTION", "Unbekannte Aktion");
  }

  let ctx: OwnerPaymentContext;
  try {
    ctx = await store.getOwnerContext(caller.tenantId, caller.memberId);
  } catch {
    log.error("payments-onboarding", { result: "DB_ERROR", action });
    return errorResponse(500, "DB_ERROR", "Ein Fehler ist aufgetreten");
  }

  if (!ctx.isOwner) {
    log.info("payments-onboarding", { result: "FORBIDDEN", action });
    return errorResponse(403, "FORBIDDEN", "Nur die Studioleitung kann Online-Zahlung einrichten");
  }

  if (action === "start") {
    return await handleStart(ctx, caller, deps);
  }
  return await handleRefresh(ctx, caller, deps);
}

async function handleStart(
  ctx: OwnerPaymentContext,
  caller: OnboardingCaller,
  deps: OnboardingDeps,
): Promise<Response> {
  const { log, errorResponse, corsHeaders, store, provider, createSession } = deps;

  if (!ctx.platformEnabled) {
    log.info("payments-onboarding", { result: "PLATFORM_DISABLED", action: "start" });
    return errorResponse(409, "PLATFORM_DISABLED", "Online-Zahlung ist auf der Plattform noch nicht freigeschaltet");
  }

  if (ctx.onboardingStatus === "disconnected") {
    log.info("payments-onboarding", { result: "ACCOUNT_DISCONNECTED", action: "start" });
    return errorResponse(409, "ACCOUNT_DISCONNECTED", "Die Verbindung zu Stripe wurde getrennt");
  }

  let accountRef = ctx.accountRef;
  let onboardingStatus = ctx.onboardingStatus;

  if (!accountRef) {
    let state: ProviderAccountState;
    try {
      state = await provider.createConnectedAccount(
        caller.tenantId,
        connectedAccountIdempotencyKey(caller.tenantId),
      );
    } catch (err) {
      log.error("payments-onboarding", {
        result: err instanceof ProviderError ? err.code : "PROVIDER_ERROR",
        action: "start",
      });
      return mapProviderHttp(err, errorResponse);
    }

    let upsert: UpsertResult;
    try {
      upsert = await store.upsertAccount(caller.tenantId, provider.id, state);
    } catch {
      log.error("payments-onboarding", { result: "DB_ERROR", action: "start" });
      return errorResponse(500, "DB_ERROR", "Ein Fehler ist aufgetreten");
    }
    if (!upsert.ok) {
      log.error("payments-onboarding", { result: upsert.code, action: "start" });
      return errorResponse(500, "DB_ERROR", "Ein Fehler ist aufgetreten");
    }

    accountRef = state.ref;
    onboardingStatus = state.status;
  }

  let session: OnboardingSession;
  try {
    session = await createSession(accountRef);
  } catch (err) {
    log.error("payments-onboarding", {
      result: err instanceof ProviderError ? err.code : "PROVIDER_ERROR",
      action: "start",
    });
    return mapProviderHttp(err, errorResponse);
  }

  const body = {
    client_secret: session.clientSecret,
    expires_at: session.expiresAt,
    onboarding_status: onboardingStatus,
  };
  assertNoAccountRef(body);
  log.info("payments-onboarding", { result: "STARTED", action: "start", onboarding_status: onboardingStatus });
  return jsonOk(body, corsHeaders);
}

async function handleRefresh(
  ctx: OwnerPaymentContext,
  caller: OnboardingCaller,
  deps: OnboardingDeps,
): Promise<Response> {
  const { log, errorResponse, corsHeaders, store, provider } = deps;

  if (ctx.accountRef) {
    if (ctx.onboardingStatus === "disconnected") {
      // Kein Nachlesen bei getrenntem Konto — Status aus der DB reicht.
    } else {
      let state: ProviderAccountState;
      try {
        state = await provider.getAccountState(ctx.accountRef);
      } catch (err) {
        log.error("payments-onboarding", {
          result: err instanceof ProviderError ? err.code : "PROVIDER_ERROR",
          action: "refresh",
        });
        return mapProviderHttp(err, errorResponse);
      }

      let upsert: UpsertResult;
      try {
        upsert = await store.upsertAccount(caller.tenantId, provider.id, state);
      } catch {
        log.error("payments-onboarding", { result: "DB_ERROR", action: "refresh" });
        return errorResponse(500, "DB_ERROR", "Ein Fehler ist aufgetreten");
      }
      if (!upsert.ok) {
        // ACCOUNT_DISCONNECTED o. ä.: trotzdem den Setup-Status liefern.
        log.warn("payments-onboarding", { result: upsert.code, action: "refresh" });
      }
    }
  }

  let status: PaymentSetupStatus;
  try {
    status = await store.getSetupStatus();
  } catch {
    log.error("payments-onboarding", { result: "DB_ERROR", action: "refresh" });
    return errorResponse(500, "DB_ERROR", "Ein Fehler ist aufgetreten");
  }

  if (status.success === false) {
    const code = typeof status.error === "string" ? status.error : "FORBIDDEN";
    log.info("payments-onboarding", { result: code, action: "refresh" });
    return errorResponse(code === "FORBIDDEN" ? 403 : 500, code, "Status konnte nicht gelesen werden");
  }

  assertNoAccountRef(status);
  log.info("payments-onboarding", {
    result: "REFRESHED",
    action: "refresh",
    onboarding_status: status.onboarding_status ?? null,
  });
  return jsonOk(status, corsHeaders);
}
