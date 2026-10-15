/**
 * Fake-Adapter im Speicher. Für Deno-Tests und später Tests der Edge Functions
 * ohne Anbieter. Nur im Testmodus (getPaymentProvider erzwingt das).
 *
 * `id` ist `stripe`, weil der Fake im Datenmodell an dessen Stelle steht
 * (payment_provider kennt nur stripe und manual).
 *
 * Webhook-Format: Header `t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<body>")>`,
 * Body `{ id, type, account, livemode, data: { object } }`. Bei account.updated ist
 * `object` ein ProviderAccountState.
 */
import {
  type CapabilityStatus,
  type ConfirmPaymentIntentCommand,
  type ConfirmPaymentIntentResult,
  type CreateConnectedAccountOptions,
  type CreatePaymentIntentCommand,
  type CreatePaymentIntentResult,
  type DomainEvent,
  type OnboardingStatus,
  type PaymentIntentStatus,
  type PaymentProvider,
  type ProviderAccountState,
  ProviderError,
  type ProviderEvent,
  type RefundPaymentCommand,
  type RefundPaymentResult,
  type RegisterPaymentDomainResult,
  type RetrievedDispute,
  type RetrievedPayment,
  type RetrievedRefund,
} from "../port.ts";

export const FAKE_WEBHOOK_SECRET = "whsec_fake_omlify_test";
export const FAKE_WEBHOOK_TOLERANCE_SECONDS = 300;

const ONBOARDING_STATUSES: readonly OnboardingStatus[] = ["in_progress", "in_review", "active", "action_required"];
const CAPABILITY_STATUSES: readonly CapabilityStatus[] = ["active", "inactive", "pending"];

const PAYMENT_EVENT_TYPES = new Set([
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "payment_intent.canceled",
]);

const REFUND_EVENT_TYPES = new Set([
  "charge.refunded",
  "refund.created",
  "refund.updated",
  "refund.failed",
]);

const DISPUTE_EVENT_TYPES = new Set([
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.dispute.closed",
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type FakePaymentBehavior =
  | "succeed"
  | "decline"
  | "requires_action"
  | "provider_unavailable"
  | "already_canceled";

export interface FakeProviderOptions {
  /** Unix-Sekunden; für Tests mit festem Zeitpunkt. */
  now?: () => number;
}

/** Aufrufprotokoll ohne Secrets (kein client_secret, Confirmation Token, acct_…). */
export type FakePaymentCall = {
  method: string;
  ref?: string;
  idempotencyKey?: string;
  amountCents?: number;
  refundId?: string;
  domain?: string;
};

interface FakePaymentRecord {
  ref: string;
  amountCents: number;
  currency: "EUR";
  livemode: false;
  attemptId: string;
  tenantId: string;
  registrationId: string | null;
  subjectType: "registration" | "pass_product";
  subjectId: string;
  status: PaymentIntentStatus;
  failureCode?: string;
  receivedAt?: string;
  clientSecret?: string;
}

interface FakeRefundRecord {
  refundRef: string;
  paymentRef: string;
  status: RetrievedRefund["status"];
  amountCents: number;
  refundId: string | null;
  receivedAt?: string;
}

interface FakeDisputeRecord {
  disputeRef: string;
  paymentRef: string;
  status: string;
  amountCents: number;
}

const encoder = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function parseHeader(header: string): { t: number; v1: string[] } | null {
  let t: number | null = null;
  const v1: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=", 2);
    if (k === "t" && v && /^\d+$/.test(v)) t = Number(v);
    if (k === "v1" && v) v1.push(v);
  }
  return t === null || v1.length === 0 ? null : { t, v1 };
}

function isAccountState(v: unknown): v is ProviderAccountState {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  const caps = o.capabilities as Record<string, unknown> | null | undefined;
  return typeof o.ref === "string" &&
    typeof o.livemode === "boolean" &&
    ONBOARDING_STATUSES.includes(o.status as OnboardingStatus) &&
    typeof o.chargesEnabled === "boolean" &&
    typeof o.payoutsEnabled === "boolean" &&
    typeof o.detailsSubmitted === "boolean" &&
    typeof o.requirementsPending === "boolean" &&
    (o.requirementsDueAt === null || typeof o.requirementsDueAt === "string") &&
    typeof caps === "object" && caps !== null &&
    CAPABILITY_STATUSES.includes(caps.card as CapabilityStatus);
}

export class FakePaymentProvider implements PaymentProvider {
  readonly id = "stripe" as const;
  private readonly accounts = new Map<string, ProviderAccountState>();
  private readonly byIdempotencyKey = new Map<string, string>();
  private readonly payments = new Map<string, FakePaymentRecord>();
  private readonly paymentByIdempotency = new Map<string, string>();
  private readonly refundByIdempotency = new Map<string, RefundPaymentResult>();
  private readonly refundsByPayment = new Map<string, FakeRefundRecord[]>();
  private readonly disputes = new Map<string, FakeDisputeRecord>();
  private readonly domains = new Set<string>();
  private readonly now: () => number;
  private counter = 0;
  private behavior: FakePaymentBehavior = "succeed";
  /** Aufrufe ohne Secrets — für Assertions. */
  readonly paymentCalls: FakePaymentCall[] = [];

  constructor(options: FakeProviderOptions = {}) {
    this.now = options.now ?? (() => Math.floor(Date.now() / 1000));
  }

  setPaymentBehavior(behavior: FakePaymentBehavior): void {
    this.behavior = behavior;
  }

  /** Test-Hilfe: Erstattung ohne Stripe-Aufruf einspielen (Webhook vor Job). */
  seedRefund(record: FakeRefundRecord): void {
    const list = this.refundsByPayment.get(record.paymentRef) ?? [];
    list.push({ ...record });
    this.refundsByPayment.set(record.paymentRef, list);
  }

  seedDispute(record: FakeDisputeRecord): void {
    this.disputes.set(record.disputeRef, { ...record });
  }

  createConnectedAccount(
    tenantId: string,
    idempotencyKey: string,
    options?: CreateConnectedAccountOptions,
  ): Promise<ProviderAccountState> {
    void options;
    if (!tenantId || !idempotencyKey) {
      return Promise.reject(new ProviderError("PROVIDER_REJECTED", "missing_input"));
    }
    const existing = this.byIdempotencyKey.get(idempotencyKey);
    if (existing) return Promise.resolve(structuredClone(this.accounts.get(existing)!));

    this.counter += 1;
    const ref = `acct_fake${String(this.counter).padStart(6, "0")}`;
    const state: ProviderAccountState = {
      ref,
      livemode: false,
      status: "in_progress",
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
      requirementsPending: true,
      requirementsDueAt: null,
      capabilities: { card: "inactive" },
    };
    this.accounts.set(ref, state);
    this.byIdempotencyKey.set(idempotencyKey, ref);
    return Promise.resolve(structuredClone(state));
  }

  getAccountState(ref: string): Promise<ProviderAccountState> {
    const state = this.accounts.get(ref);
    if (!state) return Promise.reject(new ProviderError("PROVIDER_REJECTED", "resource_missing"));
    return Promise.resolve(structuredClone(state));
  }

  createPaymentIntent(cmd: CreatePaymentIntentCommand): Promise<CreatePaymentIntentResult> {
    this.paymentCalls.push({
      method: "createPaymentIntent",
      idempotencyKey: cmd.idempotencyKey,
      amountCents: cmd.amountCents,
    });
    if (this.behavior === "provider_unavailable") {
      return Promise.reject(new ProviderError("PROVIDER_UNAVAILABLE"));
    }
    if (!cmd.accountRef || !cmd.idempotencyKey || !cmd.attemptId || !cmd.subjectType || !cmd.subjectId) {
      return Promise.reject(new ProviderError("INVALID_REQUEST", "missing_input"));
    }
    const known = this.paymentByIdempotency.get(cmd.idempotencyKey);
    if (known) return Promise.resolve({ ref: known });

    this.counter += 1;
    const ref = `pi_fake${String(this.counter).padStart(6, "0")}`;
    this.payments.set(ref, {
      ref,
      amountCents: cmd.amountCents,
      currency: "EUR",
      livemode: false,
      attemptId: cmd.attemptId,
      tenantId: cmd.tenantId,
      registrationId: cmd.registrationId ?? (cmd.subjectType === "registration" ? cmd.subjectId : null),
      subjectType: cmd.subjectType,
      subjectId: cmd.subjectId,
      status: "processing",
    });
    this.paymentByIdempotency.set(cmd.idempotencyKey, ref);
    return Promise.resolve({ ref });
  }

  confirmPaymentIntent(cmd: ConfirmPaymentIntentCommand): Promise<ConfirmPaymentIntentResult> {
    this.paymentCalls.push({ method: "confirmPaymentIntent", ref: cmd.ref });
    if (this.behavior === "provider_unavailable") {
      return Promise.reject(new ProviderError("PROVIDER_UNAVAILABLE"));
    }
    const payment = this.payments.get(cmd.ref);
    if (!payment) return Promise.reject(new ProviderError("NOT_FOUND", "resource_missing"));

    if (this.behavior === "decline") {
      payment.status = "failed";
      payment.failureCode = "card_declined";
      return Promise.resolve({ status: "failed", failureCode: "card_declined" });
    }
    if (this.behavior === "requires_action") {
      payment.status = "requires_action";
      payment.clientSecret = `pi_fake_secret_${cmd.ref}`;
      return Promise.resolve({
        status: "requires_action",
        clientSecret: payment.clientSecret,
      });
    }

    payment.status = "succeeded";
    payment.receivedAt = new Date(this.now() * 1000).toISOString();
    payment.failureCode = undefined;
    payment.clientSecret = undefined;
    return Promise.resolve({ status: "succeeded" });
  }

  retrievePayment(accountRef: string, ref: string): Promise<RetrievedPayment> {
    void accountRef;
    this.paymentCalls.push({ method: "retrievePayment", ref });
    if (this.behavior === "provider_unavailable") {
      return Promise.reject(new ProviderError("PROVIDER_UNAVAILABLE"));
    }
    const payment = this.payments.get(ref);
    if (!payment) return Promise.reject(new ProviderError("NOT_FOUND", "resource_missing"));
    return Promise.resolve({
      ref: payment.ref,
      status: payment.status,
      amountCents: payment.amountCents,
      currency: payment.currency,
      livemode: payment.livemode,
      attemptId: payment.attemptId,
      receivedAt: payment.receivedAt,
      failureCode: payment.failureCode,
    });
  }

  cancelPaymentIntent(accountRef: string, ref: string): Promise<{ status: PaymentIntentStatus }> {
    void accountRef;
    this.paymentCalls.push({ method: "cancelPaymentIntent", ref });
    if (this.behavior === "provider_unavailable") {
      return Promise.reject(new ProviderError("PROVIDER_UNAVAILABLE"));
    }
    const payment = this.payments.get(ref);
    if (!payment) return Promise.reject(new ProviderError("NOT_FOUND", "resource_missing"));

    if (this.behavior === "already_canceled" || payment.status === "canceled") {
      payment.status = "canceled";
      return Promise.resolve({ status: "canceled" });
    }
    if (payment.status === "succeeded") {
      return Promise.resolve({ status: "succeeded" });
    }
    payment.status = "canceled";
    return Promise.resolve({ status: "canceled" });
  }

  refundPayment(cmd: RefundPaymentCommand): Promise<RefundPaymentResult> {
    this.paymentCalls.push({
      method: "refundPayment",
      ref: cmd.ref,
      idempotencyKey: cmd.idempotencyKey,
      amountCents: cmd.amountCents,
      refundId: cmd.refundId,
    });
    if (this.behavior === "provider_unavailable") {
      return Promise.reject(new ProviderError("PROVIDER_UNAVAILABLE"));
    }
    if (
      !cmd.accountRef || !cmd.ref || !cmd.idempotencyKey || !cmd.refundId ||
      !cmd.tenantId || !cmd.paymentId ||
      !Number.isInteger(cmd.amountCents) || cmd.amountCents <= 0
    ) {
      return Promise.reject(new ProviderError("INVALID_REQUEST", "missing_input"));
    }
    const known = this.refundByIdempotency.get(cmd.idempotencyKey);
    if (known) return Promise.resolve({ ...known });

    const payment = this.payments.get(cmd.ref);
    if (!payment) return Promise.reject(new ProviderError("NOT_FOUND", "resource_missing"));
    if (payment.status !== "succeeded") {
      return Promise.reject(new ProviderError("INVALID_REQUEST", "not_succeeded"));
    }

    this.counter += 1;
    const result: RefundPaymentResult = {
      refundRef: `re_fake${String(this.counter).padStart(6, "0")}`,
      status: "succeeded",
      amountCents: cmd.amountCents,
    };
    this.refundByIdempotency.set(cmd.idempotencyKey, result);
    const list = this.refundsByPayment.get(cmd.ref) ?? [];
    list.push({
      refundRef: result.refundRef,
      paymentRef: cmd.ref,
      status: "succeeded",
      amountCents: cmd.amountCents,
      refundId: UUID_RE.test(cmd.refundId) ? cmd.refundId : null,
      receivedAt: new Date(this.now() * 1000).toISOString(),
    });
    this.refundsByPayment.set(cmd.ref, list);
    return Promise.resolve({ ...result });
  }

  listRefunds(accountRef: string, paymentRef: string): Promise<RetrievedRefund[]> {
    this.paymentCalls.push({ method: "listRefunds", ref: paymentRef });
    if (!accountRef || !paymentRef) {
      return Promise.reject(new ProviderError("INVALID_REQUEST", "missing_input"));
    }
    if (this.behavior === "provider_unavailable") {
      return Promise.reject(new ProviderError("PROVIDER_UNAVAILABLE"));
    }
    const list = this.refundsByPayment.get(paymentRef) ?? [];
    return Promise.resolve(list.map((r) => ({
      refundRef: r.refundRef,
      paymentRef: r.paymentRef,
      status: r.status,
      amountCents: r.amountCents,
      receivedAt: r.receivedAt,
      refundId: r.refundId,
    })));
  }

  retrieveDispute(accountRef: string, disputeRef: string): Promise<RetrievedDispute> {
    this.paymentCalls.push({ method: "retrieveDispute", ref: disputeRef });
    if (!accountRef || !disputeRef) {
      return Promise.reject(new ProviderError("INVALID_REQUEST", "missing_input"));
    }
    if (this.behavior === "provider_unavailable") {
      return Promise.reject(new ProviderError("PROVIDER_UNAVAILABLE"));
    }
    const row = this.disputes.get(disputeRef);
    if (!row) return Promise.reject(new ProviderError("NOT_FOUND", "resource_missing"));
    return Promise.resolve({ ...row });
  }

  registerPaymentDomain(accountRef: string, domain: string): Promise<RegisterPaymentDomainResult> {
    void accountRef;
    this.paymentCalls.push({ method: "registerPaymentDomain", domain });
    if (this.behavior === "provider_unavailable") {
      return Promise.reject(new ProviderError("PROVIDER_UNAVAILABLE"));
    }
    if (!domain) return Promise.reject(new ProviderError("INVALID_REQUEST", "missing_input"));
    if (this.domains.has(domain)) {
      return Promise.resolve({ status: "already_registered" });
    }
    this.domains.add(domain);
    return Promise.resolve({ status: "registered" });
  }

  async verifyWebhook(rawBody: string, signature: string, secret: string): Promise<ProviderEvent> {
    if (!secret || !secret.startsWith("whsec_")) throw new ProviderError("CONFIG_ERROR", "webhook_secret");
    const header = parseHeader(signature ?? "");
    if (!header) throw new ProviderError("INVALID_SIGNATURE", "header");

    const expected = await hmacHex(secret, `${header.t}.${rawBody}`);
    if (!header.v1.some((s) => constantTimeEqual(s, expected))) {
      throw new ProviderError("INVALID_SIGNATURE", "mismatch");
    }
    if (Math.abs(this.now() - header.t) > FAKE_WEBHOOK_TOLERANCE_SECONDS) {
      throw new ProviderError("INVALID_SIGNATURE", "timestamp");
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      throw new ProviderError("INVALID_SIGNATURE", "json");
    }
    if (typeof body.id !== "string" || typeof body.type !== "string" || typeof body.livemode !== "boolean") {
      throw new ProviderError("INVALID_EVENT", "envelope");
    }
    if (body.livemode !== false) throw new ProviderError("LIVEMODE_MISMATCH", "live_event");

    const data = body.data as Record<string, unknown> | undefined;
    return {
      id: body.id,
      type: body.type,
      accountRef: typeof body.account === "string" ? body.account : null,
      livemode: body.livemode,
      payload: data?.object,
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

    if (PAYMENT_EVENT_TYPES.has(e.type)) {
      if (!e.accountRef) throw new ProviderError("INVALID_EVENT", "missing_account");
      const payload = e.payload as { id?: unknown } | null;
      if (typeof payload?.id !== "string" || !payload.id.startsWith("pi_")) {
        throw new ProviderError("INVALID_EVENT", "missing_payment_ref");
      }
      return {
        type: "payment.updated",
        accountRef: e.accountRef,
        ref: payload.id,
        livemode: e.livemode,
      };
    }

    if (REFUND_EVENT_TYPES.has(e.type)) {
      if (!e.accountRef) throw new ProviderError("INVALID_EVENT", "missing_account");
      const payload = e.payload as Record<string, unknown> | null;
      let pi: string | null = null;
      if (e.type === "charge.refunded") {
        const raw = payload?.payment_intent;
        if (typeof raw === "string" && raw.startsWith("pi_")) pi = raw;
      } else {
        const raw = payload?.payment_intent;
        if (typeof raw === "string" && raw.startsWith("pi_")) pi = raw;
      }
      if (!pi) throw new ProviderError("INVALID_EVENT", "missing_payment_ref");
      return {
        type: "payment.refunds_changed",
        accountRef: e.accountRef,
        ref: pi,
        livemode: e.livemode,
      };
    }

    if (DISPUTE_EVENT_TYPES.has(e.type)) {
      if (!e.accountRef) throw new ProviderError("INVALID_EVENT", "missing_account");
      const id = (e.payload as { id?: unknown } | null)?.id;
      // Stripe API 2026-08-26.dahlia: Dispute-IDs sind du_… (früher dp_…).
      if (typeof id !== "string" || !(id.startsWith("du_") || id.startsWith("dp_"))) {
        throw new ProviderError("INVALID_EVENT", "missing_dispute_ref");
      }
      return {
        type: "payment.dispute_changed",
        accountRef: e.accountRef,
        disputeRef: id,
        livemode: e.livemode,
      };
    }

    if (e.type !== "account.updated") return null;
    if (!isAccountState(e.payload)) throw new ProviderError("INVALID_EVENT", "account_payload");
    if (e.accountRef !== null && e.accountRef !== e.payload.ref) {
      throw new ProviderError("INVALID_EVENT", "account_ref");
    }
    return {
      type: "provider_account.updated",
      id: e.id,
      accountRef: e.payload.ref,
      livemode: e.livemode,
      payload: structuredClone(e.payload),
    };
  }

  // --- Testhilfen ---------------------------------------------------------

  /** Schaltet den Kontostand um, wie es Stripe beim Onboarding täte. */
  setAccountState(ref: string, patch: Partial<Omit<ProviderAccountState, "ref" | "livemode">>): ProviderAccountState {
    const state = this.accounts.get(ref);
    if (!state) throw new ProviderError("PROVIDER_REJECTED", "resource_missing");
    const next: ProviderAccountState = {
      ...state,
      ...patch,
      capabilities: { ...state.capabilities, ...patch.capabilities },
    };
    this.accounts.set(ref, next);
    return structuredClone(next);
  }

  /** Konto vollständig bereit: active, charges an, Karte active. */
  activateAccount(ref: string): ProviderAccountState {
    return this.setAccountState(ref, {
      status: "active",
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
      requirementsPending: false,
      requirementsDueAt: null,
      capabilities: { card: "active" },
    });
  }

  /** Baut einen Event-Body. Bei account.updated mit dem aktuellen Kontostand. */
  buildEvent(type: string, accountRef: string | null, options: { livemode?: boolean; object?: unknown } = {}): string {
    this.counter += 1;
    const object = options.object ??
      (type === "account.updated" && accountRef
        ? this.accounts.get(accountRef)
        : PAYMENT_EVENT_TYPES.has(type)
        ? { id: `pi_fake${String(this.counter).padStart(6, "0")}`, object: "payment_intent" }
        : { id: `obj_fake${this.counter}` });
    return JSON.stringify({
      id: `evt_fake${String(this.counter).padStart(6, "0")}`,
      type,
      account: accountRef,
      livemode: options.livemode ?? false,
      data: { object },
    });
  }

  async signWebhook(rawBody: string, secret = FAKE_WEBHOOK_SECRET, timestamp = this.now()): Promise<string> {
    return `t=${timestamp},v1=${await hmacHex(secret, `${timestamp}.${rawBody}`)}`;
  }
}
