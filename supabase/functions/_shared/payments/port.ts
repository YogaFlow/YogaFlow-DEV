/**
 * Zahlungs-Port (Geldkette 1.2b). Anbieterfreie Schnittstelle für Edge Functions.
 *
 * Regel I8: Kein Typ und kein Import des Anbieter-SDK außerhalb von
 * `_shared/payments/stripe/`. Geprüft in CI durch scripts/check_provider_boundary.mjs.
 *
 * Umfang bis 3.2: Konto anlegen, Kontostand lesen, Webhook prüfen und übersetzen.
 * createPayment (2.2) und refund (3.2) sind Gerüst und werfen NOT_IMPLEMENTED.
 * Keine Off-Session-Zahlung, keine Auszahlungen, keine Gebühren (SEPA bzw. 1b).
 */

export type ProviderId = "stripe";

/** `not_started` gibt es nur als „keine Zeile in provider_accounts“, nie aus einem Adapter. */
export type OnboardingStatus = "in_progress" | "in_review" | "active" | "action_required";

export type CapabilityStatus = "active" | "inactive" | "pending";

export interface ProviderAccountState {
  /** Opake Referenz beim Anbieter, z. B. acct_… — nie loggen (Maskierer). */
  ref: string;
  livemode: boolean;
  status: OnboardingStatus;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  /** Anbieter fordert Angaben nach (v2: currently_due oder past_due). Sperrt nicht, solange status active. */
  requirementsPending: boolean;
  /** Frist für die nachgeforderten Angaben, ISO 8601 (UTC), sonst null. */
  requirementsDueAt: string | null;
  /** Gleiches Format wie p_capabilities in upsert_provider_account (1.2a-10). */
  capabilities: { card: CapabilityStatus };
}

/**
 * Beträge in Cent, immer vom Server (price_cents_at_booking), nie aus dem Request
 * des Clients. Gerüst für 2.2.
 */
export interface CreatePaymentCommand {
  tenantId: string;
  accountRef: string;
  amountCents: number;
  currency: "EUR";
  method: "card";
  /** Versuchs-ID aus payment_attempts (2.1b-a). */
  attemptId: string;
  registrationId: string;
  idempotencyKey: string;
}

export interface PaymentRef {
  ref: string;
  /** Für das Payment Element im Browser; nie loggen. */
  clientSecret: string;
}

/** Betrag in Cent, serverseitig gegen den erstattbaren Rest geprüft. Gerüst für 3.2. */
export interface RefundCommand {
  tenantId: string;
  accountRef: string;
  paymentRef: string;
  amountCents: number;
  idempotencyKey: string;
}

export interface RefundRef {
  ref: string;
}

/** Geprüftes Anbieter-Event, ohne Anbieter-Typen. */
export interface ProviderEvent {
  id: string;
  type: string;
  /** Verbundenes Konto, bei Plattform-Events null. */
  accountRef: string | null;
  livemode: boolean;
  /** Snapshot-Objekt des Events. Nur der Adapter kennt die Form. */
  payload: unknown;
}

export interface ProviderAccountUpdatedEvent {
  type: "provider_account.updated";
  id: string;
  accountRef: string;
  livemode: boolean;
  /**
   * Optionaler Snapshot-Stand. Der Webhook liest immer nach (W3); Stripe-Thin-Events
   * und Snapshot-account.updated liefern hier keinen Stand mehr.
   */
  payload?: ProviderAccountState;
}

/** Studio hat die Verbindung zur Plattform getrennt (Stripe: account.application.deauthorized). */
export interface ProviderAccountDisconnectedEvent {
  type: "provider_account.disconnected";
  id: string;
  accountRef: string;
  livemode: boolean;
}

/** Zahlungstypen kommen mit 2.2. */
export type DomainEvent = ProviderAccountUpdatedEvent | ProviderAccountDisconnectedEvent;

export interface PaymentProvider {
  readonly id: ProviderId;
  createConnectedAccount(tenantId: string, idempotencyKey: string): Promise<ProviderAccountState>;
  getAccountState(ref: string): Promise<ProviderAccountState>;
  /** Gerüst, wirft NOT_IMPLEMENTED bis 2.2. */
  createPayment(cmd: CreatePaymentCommand): Promise<PaymentRef>;
  /** Gerüst, wirft NOT_IMPLEMENTED bis 3.2. */
  refund(cmd: RefundCommand): Promise<RefundRef>;
  verifyWebhook(rawBody: string, signature: string, secret: string): Promise<ProviderEvent>;
  /** null = bewusst ignorieren. */
  toDomainEvent(e: ProviderEvent): DomainEvent | null;
}

export type ProviderErrorCode =
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED"
  | "INVALID_SIGNATURE"
  | "INVALID_EVENT"
  | "LIVEMODE_MISMATCH"
  | "NOT_IMPLEMENTED"
  | "CONFIG_ERROR";

const PROVIDER_ERROR_MESSAGES: Record<ProviderErrorCode, string> = {
  PROVIDER_UNAVAILABLE: "Zahlungsanbieter nicht erreichbar",
  PROVIDER_REJECTED: "Zahlungsanbieter hat die Anfrage abgelehnt",
  INVALID_SIGNATURE: "Signatur ungültig",
  INVALID_EVENT: "Event hat eine unerwartete Form",
  LIVEMODE_MISMATCH: "Modus passt nicht zur Umgebung",
  NOT_IMPLEMENTED: "Noch nicht umgesetzt",
  CONFIG_ERROR: "Zahlungen sind nicht konfiguriert",
};

/**
 * Einziger Fehlertyp des Ports. Die Meldung ist fest je Code; Texte des Anbieters
 * werden nie übernommen. `detail` trägt höchstens Fehlertyp/-code des Anbieters
 * (z. B. `StripeInvalidRequestError/resource_missing`) für interne Logs.
 */
export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly detail?: string;

  constructor(code: ProviderErrorCode, detail?: string) {
    super(PROVIDER_ERROR_MESSAGES[code]);
    this.name = "ProviderError";
    this.code = code;
    this.detail = detail;
  }
}

/** Idempotency-Key für das Anlegen des verbundenen Kontos, einer je Studio. */
export function connectedAccountIdempotencyKey(tenantId: string): string {
  return `acct-create-${tenantId}`;
}
