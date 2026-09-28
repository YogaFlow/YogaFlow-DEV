/**
 * Stripe-Adapter für den Zahlungs-Port. Accounts v1 mit Controller-Eigenschaften
 * (Entscheidung P7), Direct Charges, verbundene Konten in DE.
 *
 * Stripe ist Ausführungsorgan, nicht Quelle der Wahrheit: Die Datenbank erfährt
 * Zustände über Webhooks (1.4) und liest bei account.updated per getAccountState nach.
 */
import type { PaymentsMode } from "../config.ts";
import {
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
 * P7: vollständiges Dashboard, Gebühren und Verluste beim Studio bzw. bei Stripe,
 * Stripe sammelt die Nachweise ein. `transfers` verlangt Stripe zusammen mit
 * `card_payments` („you must request both“, docs.stripe.com/connect/account-capabilities).
 */
export const CONNECTED_ACCOUNT_PARAMS = {
  country: "DE",
  controller: {
    stripe_dashboard: { type: "full" },
    fees: { payer: "account" },
    losses: { payments: "stripe" },
    requirement_collection: "stripe",
  },
  capabilities: {
    card_payments: { requested: true },
    transfers: { requested: true },
  },
} as const satisfies Omit<Stripe.AccountCreateParams, "metadata">;

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

  async createConnectedAccount(tenantId: string, idempotencyKey: string): Promise<ProviderAccountState> {
    if (!tenantId || !idempotencyKey) throw new ProviderError("PROVIDER_REJECTED", "missing_input");
    try {
      const account = await this.client.accounts.create(
        { ...CONNECTED_ACCOUNT_PARAMS, metadata: { omlify_tenant_id: tenantId } },
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
      const account = await this.client.accounts.retrieve(ref);
      return mapStripeAccount(account, this.livemode);
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
    if (e.type !== "account.updated") return null;

    const snapshot = parseAccountSnapshot(e.payload);
    if (!snapshot) throw new ProviderError("INVALID_EVENT", "account_payload");
    if (e.accountRef !== null && e.accountRef !== snapshot.id) {
      throw new ProviderError("INVALID_EVENT", "account_ref");
    }

    return {
      type: "provider_account.updated",
      id: e.id,
      accountRef: snapshot.id,
      livemode: e.livemode,
      payload: mapStripeAccount(snapshot, e.livemode),
    };
  }
}
