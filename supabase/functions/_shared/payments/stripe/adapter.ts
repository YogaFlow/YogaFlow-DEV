/**
 * Stripe-Adapter für den Zahlungs-Port. Accounts v2 (Entscheidung P7 neu).
 *
 * Stripe ist Ausführungsorgan, nicht Quelle der Wahrheit: Die Datenbank erfährt
 * Zustände über Webhooks (1.4) und liest bei Konto-/Zahlungs-Ereignissen nach (W3/Q6).
 */
import type { ServiceLogger } from "../../service.ts";
import { createServiceLogger } from "../../service.ts";
import type { PaymentsMode } from "../config.ts";
import {
  type ConfirmPaymentIntentCommand,
  type ConfirmPaymentIntentResult,
  type CreateConnectedAccountOptions,
  type CreatePaymentIntentCommand,
  type CreatePaymentIntentResult,
  type DomainEvent,
  type PaymentIntentStatus,
  type PaymentProvider,
  type ProviderAccountState,
  ProviderError,
  type ProviderEvent,
  type RefundPaymentCommand,
  type RefundPaymentResult,
  type RegisterPaymentDomainResult,
  type RetrievedPayment,
} from "../port.ts";
import { mapStripeAccount, parseAccountSnapshot } from "./account_status.ts";
import {
  createStripeClient,
  Stripe,
  type StripeClientConfig,
  subtleCryptoProvider,
  toPaymentError,
  toProviderError,
} from "./sdk.ts";

/**
 * P7 neu: Accounts v2. Kein transfers / stripe_transfers, keine customer-Konfiguration.
 * RequestOptions.idempotencyKey unverändert (SDK RequestOptions).
 */
export const CONNECTED_ACCOUNT_PARAMS = {
  dashboard: "full",
  defaults: {
    responsibilities: {
      fees_collector: "stripe",
      losses_collector: "stripe",
    },
  },
  identity: {
    country: "DE",
  },
  configuration: {
    merchant: {
      capabilities: {
        card_payments: { requested: true },
      },
    },
  },
} as const satisfies Omit<Stripe.V2.Core.AccountCreateParams, "metadata">;

/** Stripe v2: statement_descriptor.descriptor — max. 22 Zeichen (Merchant Configuration). */
export const STATEMENT_DESCRIPTOR_MAX = 22;

/**
 * Studioname → zulässigen Statement Descriptor.
 * Quelle: Stripe API `configuration.merchant.statement_descriptor.descriptor`
 * (Accounts v2 Create, SDK stripe@22.6.2 / API 2026-08-26.dahlia).
 * Nur lateinische Buchstaben/Ziffern/Leerzeichen; Umlaute und Sonderzeichen entfallen.
 */
export function toStatementDescriptor(name: string): string | undefined {
  const ascii = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!ascii || !/[A-Za-z]/.test(ascii)) return undefined;
  return ascii.slice(0, STATEMENT_DESCRIPTOR_MAX).trim();
}

const ACCOUNT_INCLUDE = [
  "configuration.merchant",
  "requirements",
  "identity",
] as const satisfies ReadonlyArray<Stripe.V2.Core.AccountRetrieveParams.Include>;

const PAYMENT_DESCRIPTION = "Omlify Kursbuchung";

const PAYMENT_EVENT_TYPES = new Set([
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "payment_intent.canceled",
]);

/** v2.core.account…, nicht account_link / account_person. */
export function isV2CoreAccountEventType(type: string): boolean {
  return type === "v2.core.account.closed" ||
    type === "v2.core.account.created" ||
    type === "v2.core.account.updated" ||
    type.startsWith("v2.core.account[");
}

function peekObject(rawBody: string): string | null {
  try {
    const parsed = JSON.parse(rawBody) as { object?: unknown };
    return typeof parsed.object === "string" ? parsed.object : null;
  } catch {
    return null;
  }
}

function thinToProviderEvent(n: Stripe.V2.Core.EventNotification): ProviderEvent {
  const related = "related_object" in n && n.related_object && typeof n.related_object === "object"
    ? n.related_object as { id?: unknown }
    : null;
  const accountRef = typeof related?.id === "string" ? related.id : null;
  return {
    id: n.id,
    type: n.type,
    accountRef,
    livemode: n.livemode,
    payload: {
      id: n.id,
      object: n.object,
      type: n.type,
      created: n.created,
      livemode: n.livemode,
      related_object: "related_object" in n ? n.related_object : null,
    },
  };
}

function accountOpts(accountRef: string, idempotencyKey?: string): Stripe.RequestOptions {
  return idempotencyKey
    ? { stripeAccount: accountRef, idempotencyKey }
    : { stripeAccount: accountRef };
}

/** Q4-Statusabbildung. Exportiert für Deno-Tests mit gespeicherten Beispielobjekten. */
export function mapPaymentIntentStatus(pi: {
  status: string;
  client_secret?: string | null;
  last_payment_error?: { code?: string | null } | null;
}): {
  status: PaymentIntentStatus;
  clientSecret?: string;
  failureCode?: string;
} {
  switch (pi.status) {
    case "succeeded":
      return { status: "succeeded" };
    case "processing":
      return { status: "processing" };
    case "requires_action":
      return {
        status: "requires_action",
        clientSecret: typeof pi.client_secret === "string" ? pi.client_secret : undefined,
      };
    case "canceled":
      return { status: "canceled" };
    case "requires_payment_method":
      return {
        status: "failed",
        failureCode: pi.last_payment_error?.code ?? undefined,
      };
    default:
      throw new ProviderError("INVALID_REQUEST", `unexpected_status/${pi.status}`);
  }
}

function mapIntentStatus(pi: Stripe.PaymentIntent): {
  status: PaymentIntentStatus;
  clientSecret?: string;
  failureCode?: string;
} {
  return mapPaymentIntentStatus(pi);
}

function chargeReceivedAt(pi: Stripe.PaymentIntent): string | undefined {
  if (pi.status !== "succeeded") return undefined;
  const charge = pi.latest_charge;
  if (typeof charge === "object" && charge !== null && typeof charge.created === "number") {
    return new Date(charge.created * 1000).toISOString();
  }
  return undefined;
}

function mapRefundStatus(status: string | null): RefundPaymentResult["status"] {
  if (status === "succeeded" || status === "pending" || status === "failed") return status;
  if (status === "canceled") return "failed";
  return "pending";
}

function isDomainAlreadyRegistered(err: unknown): boolean {
  if (!(err instanceof Stripe.errors.StripeInvalidRequestError)) return false;
  const code = (err.code ?? "").toLowerCase();
  const message = (err.message ?? "").toLowerCase();
  return code.includes("already") ||
    message.includes("already exists") ||
    message.includes("already been registered");
}

export type StripePaymentProviderConfig = StripeClientConfig & {
  /** Tests: Logger-Spion; Produktion: createServiceLogger. */
  logger?: ServiceLogger;
};

export class StripePaymentProvider implements PaymentProvider {
  readonly id = "stripe" as const;
  readonly mode: PaymentsMode;
  private readonly client: Stripe;
  private readonly log: ServiceLogger;

  constructor(config: StripePaymentProviderConfig) {
    const { logger, ...clientConfig } = config;
    this.client = createStripeClient(clientConfig);
    this.mode = config.mode;
    this.log = logger ?? createServiceLogger();
  }

  private get livemode(): boolean {
    return this.mode === "live";
  }

  /** Erlaubt: Methode, pi_…/re_…, Ergebnis-Code — nie Secrets, nie acct_…. */
  private logPayment(method: string, fields: Record<string, string | undefined>): void {
    this.log.info({ method, ...fields });
  }

  async createConnectedAccount(
    tenantId: string,
    idempotencyKey: string,
    options?: CreateConnectedAccountOptions,
  ): Promise<ProviderAccountState> {
    if (!tenantId || !idempotencyKey) throw new ProviderError("PROVIDER_REJECTED", "missing_input");
    try {
      const descriptor = options?.statementDescriptor
        ? toStatementDescriptor(options.statementDescriptor)
        : undefined;
      const merchant: Stripe.V2.Core.AccountCreateParams.Configuration.Merchant = {
        capabilities: {
          card_payments: { requested: true },
        },
        ...(descriptor
          ? { statement_descriptor: { descriptor } }
          : {}),
      };
      const account = await this.client.v2.core.accounts.create(
        {
          dashboard: CONNECTED_ACCOUNT_PARAMS.dashboard,
          defaults: CONNECTED_ACCOUNT_PARAMS.defaults,
          identity: CONNECTED_ACCOUNT_PARAMS.identity,
          configuration: { merchant },
          include: [...ACCOUNT_INCLUDE],
          metadata: { omlify_tenant_id: tenantId },
        },
        { idempotencyKey },
      );
      return mapStripeAccount(account, this.livemode);
    } catch (err) {
      throw toProviderError(err);
    }
  }

  async getAccountState(ref: string): Promise<ProviderAccountState> {
    if (!ref) throw new ProviderError("PROVIDER_REJECTED", "missing_input");
    try {
      const account = await this.client.v2.core.accounts.retrieve(ref, {
        include: [...ACCOUNT_INCLUDE],
      });
      const snapshot = parseAccountSnapshot(account);
      if (!snapshot) throw new ProviderError("PROVIDER_REJECTED", "account_shape");
      return mapStripeAccount(snapshot, this.livemode);
    } catch (err) {
      throw toProviderError(err);
    }
  }

  async createPaymentIntent(cmd: CreatePaymentIntentCommand): Promise<CreatePaymentIntentResult> {
    if (!cmd.accountRef || !cmd.idempotencyKey || !cmd.attemptId) {
      throw new ProviderError("INVALID_REQUEST", "missing_input");
    }
    try {
      const pi = await this.client.paymentIntents.create(
        {
          amount: cmd.amountCents,
          currency: "eur",
          payment_method_types: ["card"],
          description: PAYMENT_DESCRIPTION,
          metadata: {
            attempt_id: cmd.attemptId,
            tenant_id: cmd.tenantId,
            registration_id: cmd.registrationId,
          },
        },
        accountOpts(cmd.accountRef, cmd.idempotencyKey),
      );
      this.logPayment("createPaymentIntent", { ref: pi.id, result: "created" });
      return { ref: pi.id };
    } catch (err) {
      throw toPaymentError(err);
    }
  }

  async confirmPaymentIntent(cmd: ConfirmPaymentIntentCommand): Promise<ConfirmPaymentIntentResult> {
    if (!cmd.accountRef || !cmd.ref || !cmd.confirmationToken || !cmd.returnUrl) {
      throw new ProviderError("INVALID_REQUEST", "missing_input");
    }
    try {
      const pi = await this.client.paymentIntents.confirm(
        cmd.ref,
        {
          confirmation_token: cmd.confirmationToken,
          return_url: cmd.returnUrl,
        },
        accountOpts(cmd.accountRef),
      );
      const mapped = mapIntentStatus(pi);
      this.logPayment("confirmPaymentIntent", {
        ref: cmd.ref,
        result: mapped.status,
        failureCode: mapped.failureCode,
      });
      return mapped;
    } catch (err) {
      if (err instanceof Stripe.errors.StripeCardError) {
        const failureCode = err.code ?? "card_declined";
        this.logPayment("confirmPaymentIntent", {
          ref: cmd.ref,
          result: "failed",
          failureCode,
        });
        return { status: "failed", failureCode };
      }
      throw toPaymentError(err);
    }
  }

  async retrievePayment(accountRef: string, ref: string): Promise<RetrievedPayment> {
    if (!accountRef || !ref) throw new ProviderError("INVALID_REQUEST", "missing_input");
    try {
      const pi = await this.client.paymentIntents.retrieve(
        ref,
        { expand: ["latest_charge"] },
        accountOpts(accountRef),
      );
      if (pi.currency !== "eur") {
        throw new ProviderError("INVALID_REQUEST", `currency/${pi.currency}`);
      }
      const mapped = mapIntentStatus(pi);
      const attemptId = typeof pi.metadata?.attempt_id === "string" ? pi.metadata.attempt_id : undefined;
      const result: RetrievedPayment = {
        ref: pi.id,
        status: mapped.status,
        amountCents: pi.amount,
        currency: "EUR",
        livemode: pi.livemode,
        attemptId,
        receivedAt: chargeReceivedAt(pi),
        failureCode: mapped.failureCode,
      };
      this.logPayment("retrievePayment", { ref, result: mapped.status });
      return result;
    } catch (err) {
      throw toPaymentError(err);
    }
  }

  async cancelPaymentIntent(
    accountRef: string,
    ref: string,
  ): Promise<{ status: PaymentIntentStatus }> {
    if (!accountRef || !ref) throw new ProviderError("INVALID_REQUEST", "missing_input");
    try {
      const pi = await this.client.paymentIntents.cancel(ref, undefined, accountOpts(accountRef));
      const mapped = mapIntentStatus(pi);
      this.logPayment("cancelPaymentIntent", { ref, result: mapped.status });
      return { status: mapped.status };
    } catch (err) {
      const mapped = toPaymentError(err);
      if (mapped.code === "INVALID_REQUEST") {
        const current = await this.retrievePayment(accountRef, ref);
        if (current.status === "canceled" || current.status === "succeeded") {
          this.logPayment("cancelPaymentIntent", { ref, result: current.status });
          return { status: current.status };
        }
      }
      throw mapped;
    }
  }

  async refundPayment(cmd: RefundPaymentCommand): Promise<RefundPaymentResult> {
    if (!cmd.accountRef || !cmd.ref || !cmd.idempotencyKey) {
      throw new ProviderError("INVALID_REQUEST", "missing_input");
    }
    try {
      const refund = await this.client.refunds.create(
        { payment_intent: cmd.ref },
        accountOpts(cmd.accountRef, cmd.idempotencyKey),
      );
      const status = mapRefundStatus(refund.status);
      this.logPayment("refundPayment", {
        ref: cmd.ref,
        refundRef: refund.id,
        result: status,
      });
      return {
        refundRef: refund.id,
        status,
        amountCents: refund.amount,
      };
    } catch (err) {
      throw toPaymentError(err);
    }
  }

  async registerPaymentDomain(
    accountRef: string,
    domain: string,
  ): Promise<RegisterPaymentDomainResult> {
    if (!accountRef || !domain) throw new ProviderError("INVALID_REQUEST", "missing_input");
    try {
      await this.client.paymentMethodDomains.create(
        { domain_name: domain },
        accountOpts(accountRef),
      );
      this.logPayment("registerPaymentDomain", { result: "registered" });
      return { status: "registered" };
    } catch (err) {
      if (isDomainAlreadyRegistered(err)) {
        this.logPayment("registerPaymentDomain", { result: "already_registered" });
        return { status: "already_registered" };
      }
      throw toPaymentError(err);
    }
  }

  async verifyWebhook(rawBody: string, signature: string, secret: string): Promise<ProviderEvent> {
    if (!secret || !secret.startsWith("whsec_")) {
      throw new ProviderError("CONFIG_ERROR", "STRIPE_WEBHOOK_SECRET");
    }
    if (!signature) throw new ProviderError("INVALID_SIGNATURE", "missing_header");

    const object = peekObject(rawBody);

    if (object === "v2.core.event") {
      let notification: Stripe.V2.Core.EventNotification;
      try {
        notification = await this.client.parseEventNotificationAsync(
          rawBody,
          signature,
          secret,
          undefined,
          subtleCryptoProvider,
        );
      } catch (err) {
        const mapped = toProviderError(err);
        throw mapped.code === "PROVIDER_UNAVAILABLE" ? new ProviderError("INVALID_SIGNATURE") : mapped;
      }
      if (notification.livemode !== this.livemode) {
        throw new ProviderError("LIVEMODE_MISMATCH", notification.livemode ? "live_event" : "test_event");
      }
      return thinToProviderEvent(notification);
    }

    let event: Stripe.Event;
    try {
      event = await this.client.webhooks.constructEventAsync(
        rawBody,
        signature,
        secret,
        undefined,
        subtleCryptoProvider,
      );
    } catch (err) {
      const mapped = toProviderError(err);
      // Kaputtes JSON bei gültiger Signatur ist ebenso abzulehnen.
      throw mapped.code === "PROVIDER_UNAVAILABLE" ? new ProviderError("INVALID_SIGNATURE") : mapped;
    }

    if (event.livemode !== this.livemode) {
      throw new ProviderError("LIVEMODE_MISMATCH", event.livemode ? "live_event" : "test_event");
    }

    return {
      id: event.id,
      type: event.type,
      accountRef: event.account ?? null,
      livemode: event.livemode,
      payload: event.data?.object,
    };
  }

  toDomainEvent(e: ProviderEvent): DomainEvent | null {
    if (e.type === "account.application.deauthorized") {
      if (!e.accountRef) throw new ProviderError("INVALID_EVENT", "missing_account");
      return {
        type: "provider_account.disconnected",
        id: e.id,
        accountRef: e.accountRef,
        livemode: e.livemode,
      };
    }

    if (e.type === "account.updated" || isV2CoreAccountEventType(e.type)) {
      if (!e.accountRef) throw new ProviderError("INVALID_EVENT", "missing_account");
      // W3: Stand wird beim Verarbeiten nachgelesen; kein Snapshot im Domain-Event.
      return {
        type: "provider_account.updated",
        id: e.id,
        accountRef: e.accountRef,
        livemode: e.livemode,
      };
    }

    if (PAYMENT_EVENT_TYPES.has(e.type)) {
      if (!e.accountRef) throw new ProviderError("INVALID_EVENT", "missing_account");
      const payload = e.payload as { id?: unknown } | null;
      if (typeof payload?.id !== "string" || !payload.id.startsWith("pi_")) {
        throw new ProviderError("INVALID_EVENT", "missing_payment_ref");
      }
      // Q6: kein Status aus dem Event.
      return {
        type: "payment.updated",
        accountRef: e.accountRef,
        ref: payload.id,
        livemode: e.livemode,
      };
    }

    return null;
  }
}
