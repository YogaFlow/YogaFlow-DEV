/**
 * Zahlungs-Port (Geldkette 1.2b / 2.2a-2). Anbieterfreie Schnittstelle für Edge Functions.
 *
 * Regel I8: Kein Typ und kein Import des Anbieter-SDK außerhalb von
 * `_shared/payments/stripe/`. Geprüft in CI durch scripts/check_provider_boundary.mjs.
 *
 * Zahlung: create → confirm (Q1); Erstattung mit Betrag + refund_id (E1); Domain-Registrierung (Q8).
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

/** Status nach Q4 (confirm / retrieve / cancel). */
export type PaymentIntentStatus =
  | "succeeded"
  | "processing"
  | "requires_action"
  | "failed"
  | "canceled";

/**
 * Beträge in Cent, immer vom Server (price_cents_at_booking), nie aus dem Request
 * des Clients.
 */
export interface CreatePaymentIntentCommand {
  accountRef: string;
  amountCents: number;
  currency: "EUR";
  attemptId: string;
  tenantId: string;
  registrationId: string;
  idempotencyKey: string;
}

export interface CreatePaymentIntentResult {
  ref: string;
}

export interface ConfirmPaymentIntentCommand {
  accountRef: string;
  ref: string;
  confirmationToken: string;
  returnUrl: string;
}

export interface ConfirmPaymentIntentResult {
  status: PaymentIntentStatus;
  /** Nur bei requires_action; nie speichern, nie loggen (Q5). */
  clientSecret?: string;
  failureCode?: string;
}

export interface RetrievedPayment {
  ref: string;
  status: PaymentIntentStatus;
  amountCents: number;
  currency: "EUR";
  livemode: boolean;
  /** Aus Metadaten attempt_id. */
  attemptId?: string;
  /** Zeitpunkt der erfolgreichen Belastung (ISO 8601). */
  receivedAt?: string;
  failureCode?: string;
}

/**
 * Erstattung (3.2b E1). Betrag und Idempotency-Key = refund_id (nicht payment_id).
 * Metadata beim Anbieter: refund_id, tenant_id, payment_id — kein reason-Freitext.
 */
export interface RefundPaymentCommand {
  accountRef: string;
  ref: string;
  amountCents: number;
  refundId: string;
  /** Immer = refundId. */
  idempotencyKey: string;
  tenantId: string;
  paymentId: string;
}

export interface RefundPaymentResult {
  refundRef: string;
  status: "succeeded" | "pending" | "failed";
  amountCents: number;
}

/** Eine Erstattung am Anbieter (listRefunds / Webhook R5). */
export interface RetrievedRefund {
  refundRef: string;
  paymentRef: string;
  status: "succeeded" | "pending" | "failed" | "canceled";
  amountCents: number;
  /** ISO 8601, wenn der Anbieter einen Zeitpunkt liefert. */
  receivedAt?: string;
  /** metadata.refund_id (UUID) oder null bei Dashboard-Erstattung. */
  refundId: string | null;
}

/** Dispute am Anbieter (R6). */
export interface RetrievedDispute {
  disputeRef: string;
  paymentRef: string;
  status: string;
  amountCents: number;
}

export type RegisterPaymentDomainResult = {
  status: "registered" | "already_registered";
};

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

/**
 * Zahlung geändert. Kein Status aus dem Event (Q6) — Function/Webhook lesen per
 * retrievePayment nach.
 */
export interface PaymentUpdatedEvent {
  type: "payment.updated";
  accountRef: string;
  ref: string;
  livemode: boolean;
}

/**
 * Erstattungen geändert (charge.refunded / refund.*). Webhook liest per
 * listRefunds nach (E3) — kein Status aus dem Event.
 */
export interface PaymentRefundsChangedEvent {
  type: "payment.refunds_changed";
  accountRef: string;
  /** PaymentIntent-Ref (pi_…). */
  ref: string;
  livemode: boolean;
}

/**
 * Dispute geändert (charge.dispute.*). Webhook liest per retrieveDispute nach (E4).
 */
export interface PaymentDisputeChangedEvent {
  type: "payment.dispute_changed";
  accountRef: string;
  disputeRef: string;
  livemode: boolean;
}

export type DomainEvent =
  | ProviderAccountUpdatedEvent
  | ProviderAccountDisconnectedEvent
  | PaymentUpdatedEvent
  | PaymentRefundsChangedEvent
  | PaymentDisputeChangedEvent;

export interface CreateConnectedAccountOptions {
  /**
   * Text auf Kontoauszügen (Stripe v2:
   * `configuration.merchant.statement_descriptor.descriptor`, max. 22 Zeichen).
   */
  statementDescriptor?: string;
}

export interface PaymentProvider {
  readonly id: ProviderId;
  createConnectedAccount(
    tenantId: string,
    idempotencyKey: string,
    options?: CreateConnectedAccountOptions,
  ): Promise<ProviderAccountState>;
  getAccountState(ref: string): Promise<ProviderAccountState>;
  createPaymentIntent(cmd: CreatePaymentIntentCommand): Promise<CreatePaymentIntentResult>;
  confirmPaymentIntent(cmd: ConfirmPaymentIntentCommand): Promise<ConfirmPaymentIntentResult>;
  retrievePayment(accountRef: string, ref: string): Promise<RetrievedPayment>;
  /** Idempotent: schon storniert/erfolgreich → Status zurück, kein Fehler. */
  cancelPaymentIntent(accountRef: string, ref: string): Promise<{ status: PaymentIntentStatus }>;
  refundPayment(cmd: RefundPaymentCommand): Promise<RefundPaymentResult>;
  /** Alle Erstattungen eines PaymentIntents (Webhook R5). */
  listRefunds(accountRef: string, paymentRef: string): Promise<RetrievedRefund[]>;
  retrieveDispute(accountRef: string, disputeRef: string): Promise<RetrievedDispute>;
  registerPaymentDomain(accountRef: string, domain: string): Promise<RegisterPaymentDomainResult>;
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
  | "CONFIG_ERROR"
  | "CARD_DECLINED"
  | "AUTHENTICATION_REQUIRED"
  | "RATE_LIMITED"
  | "INVALID_REQUEST"
  | "NOT_FOUND";

const PROVIDER_ERROR_MESSAGES: Record<ProviderErrorCode, string> = {
  PROVIDER_UNAVAILABLE: "Zahlungsanbieter nicht erreichbar",
  PROVIDER_REJECTED: "Zahlungsanbieter hat die Anfrage abgelehnt",
  INVALID_SIGNATURE: "Signatur ungültig",
  INVALID_EVENT: "Event hat eine unerwartete Form",
  LIVEMODE_MISMATCH: "Modus passt nicht zur Umgebung",
  NOT_IMPLEMENTED: "Noch nicht umgesetzt",
  CONFIG_ERROR: "Zahlungen sind nicht konfiguriert",
  CARD_DECLINED: "Karte abgelehnt",
  AUTHENTICATION_REQUIRED: "Zusätzliche Authentifizierung nötig",
  RATE_LIMITED: "Zu viele Anfragen beim Zahlungsanbieter",
  INVALID_REQUEST: "Ungültige Zahlungsanfrage",
  NOT_FOUND: "Zahlungsobjekt nicht gefunden",
};

/**
 * Einziger Fehlertyp des Ports (PaymentProviderError). Die Meldung ist fest je Code;
 * Texte des Anbieters werden nie übernommen. `detail` trägt höchstens Fehlertyp/-code
 * des Anbieters (z. B. `StripeInvalidRequestError/resource_missing`) für interne Logs.
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

/** Alias laut Port-Sprache; dieselbe Klasse wie ProviderError. */
export { ProviderError as PaymentProviderError };

/** Idempotency-Key für das Anlegen des verbundenen Kontos, einer je Studio. */
export function connectedAccountIdempotencyKey(tenantId: string): string {
  return `acct-create-${tenantId}`;
}
