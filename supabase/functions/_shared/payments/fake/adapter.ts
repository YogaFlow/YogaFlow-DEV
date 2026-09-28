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
  type CreateConnectedAccountOptions,
  type DomainEvent,
  type OnboardingStatus,
  type PaymentProvider,
  type PaymentRef,
  type ProviderAccountState,
  ProviderError,
  type ProviderEvent,
  type RefundRef,
} from "../port.ts";

export const FAKE_WEBHOOK_SECRET = "whsec_fake_omlify_test";
export const FAKE_WEBHOOK_TOLERANCE_SECONDS = 300;

const ONBOARDING_STATUSES: readonly OnboardingStatus[] = ["in_progress", "in_review", "active", "action_required"];
const CAPABILITY_STATUSES: readonly CapabilityStatus[] = ["active", "inactive", "pending"];

export interface FakeProviderOptions {
  /** Unix-Sekunden; für Tests mit festem Zeitpunkt. */
  now?: () => number;
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
  private readonly now: () => number;
  private counter = 0;

  constructor(options: FakeProviderOptions = {}) {
    this.now = options.now ?? (() => Math.floor(Date.now() / 1000));
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

  createPayment(): Promise<PaymentRef> {
    return Promise.reject(new ProviderError("NOT_IMPLEMENTED", "createPayment"));
  }

  refund(): Promise<RefundRef> {
    return Promise.reject(new ProviderError("NOT_IMPLEMENTED", "refund"));
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
      (type === "account.updated" && accountRef ? this.accounts.get(accountRef) : { id: `obj_fake${this.counter}` });
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
