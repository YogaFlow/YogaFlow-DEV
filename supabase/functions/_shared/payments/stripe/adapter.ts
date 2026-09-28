/**
 * Stripe-Adapter für den Zahlungs-Port. Accounts v2 (Entscheidung P7 neu).
 *
 * Stripe ist Ausführungsorgan, nicht Quelle der Wahrheit: Die Datenbank erfährt
 * Zustände über Webhooks (1.4) und liest bei Konto-Ereignissen per getAccountState nach (W3).
 */
import type { PaymentsMode } from "../config.ts";
import {
  type CreateConnectedAccountOptions,
  type DomainEvent,
  type PaymentProvider,
  type PaymentRef,
  type ProviderAccountState,
  ProviderError,
  type ProviderEvent,
  type RefundRef,
} from "../port.ts";
import { mapStripeAccount, parseAccountSnapshot } from "./account_status.ts";
import {
  createStripeClient,
  Stripe,
  type StripeClientConfig,
  subtleCryptoProvider,
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

export class StripePaymentProvider implements PaymentProvider {
  readonly id = "stripe" as const;
  readonly mode: PaymentsMode;
  private readonly client: Stripe;

  constructor(config: StripeClientConfig) {
    this.client = createStripeClient(config);
    this.mode = config.mode;
  }

  private get livemode(): boolean {
    return this.mode === "live";
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

  createPayment(): Promise<PaymentRef> {
    return Promise.reject(new ProviderError("NOT_IMPLEMENTED", "createPayment"));
  }

  refund(): Promise<RefundRef> {
    return Promise.reject(new ProviderError("NOT_IMPLEMENTED", "refund"));
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

    return null;
  }
}
