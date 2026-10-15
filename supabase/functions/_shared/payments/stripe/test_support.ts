/**
 * Testhilfen: ein fetch-Stub, der die benötigten Stripe-Endpunkte im Speicher
 * beantwortet, und signierte Events. Kein Netzwerk; die Tests laufen ohne --allow-net.
 */
import { Stripe, subtleCryptoProvider } from "./sdk.ts";

export const TEST_WEBHOOK_SECRET = "whsec_omlify_unit_test";
export const TEST_WEBHOOK_SECRET_THIN = "whsec_omlify_thin_unit_test";
export const TEST_SECRET_KEY = "sk_test_omlify_unit_test";

export interface StubCall {
  method: string;
  path: string;
  /** Form-Body (v1) oder leere Params. */
  params: URLSearchParams;
  /** JSON-Body (v2), sonst null. */
  jsonBody: unknown | null;
  query: URLSearchParams;
  idempotencyKey: string | null;
  /** Direct Charge: Stripe-Account-Header (acct_…). */
  stripeAccount: string | null;
}

export type StubAccount = {
  id: string;
  object: "v2.core.account";
  created: string;
  livemode: boolean;
  applied_configurations: string[];
  dashboard: string;
  identity: { country: string };
  configuration: {
    merchant: {
      applied: boolean;
      capabilities: {
        card_payments: { status: string; status_details: unknown[] };
        stripe_balance: { payouts: { status: string; status_details: unknown[] } };
      };
    };
  };
  requirements: {
    entries: Array<{
      awaiting_action_from: string;
      description: string;
      errors: unknown[];
      impact: Record<string, unknown>;
      minimum_deadline: { status: string };
      requested_reasons: Array<{ code: string }>;
    }>;
    summary: Record<string, unknown>;
  };
  metadata: Record<string, string>;
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "request-id": "req_stub" },
  });
}

function freshAccount(id: string, tenantId: string): StubAccount {
  return {
    id,
    object: "v2.core.account",
    created: "2026-09-28T12:00:00.000Z",
    livemode: false,
    applied_configurations: ["merchant"],
    dashboard: "full",
    identity: { country: "DE" },
    configuration: {
      merchant: {
        applied: true,
        capabilities: {
          card_payments: { status: "inactive", status_details: [] },
          stripe_balance: { payouts: { status: "inactive", status_details: [] } },
        },
      },
    },
    requirements: {
      entries: [{
        awaiting_action_from: "user",
        description: "business_type",
        errors: [],
        impact: {},
        minimum_deadline: { status: "past_due" },
        requested_reasons: [{ code: "routine_onboarding" }],
      }],
      summary: { minimum_deadline: { status: "past_due" } },
    },
    metadata: { omlify_tenant_id: tenantId },
  };
}

type StubPaymentIntent = {
  id: string;
  object: "payment_intent";
  amount: number;
  currency: string;
  status: string;
  livemode: boolean;
  client_secret: string | null;
  metadata: Record<string, string>;
  description: string | null;
  last_payment_error: { code: string } | null;
  latest_charge: string | { id: string; object: "charge"; created: number; amount: number } | null;
};

type StubRefund = {
  id: string;
  object: "refund";
  amount: number;
  currency: string;
  status: string;
  payment_intent: string;
  created: number;
  metadata: Record<string, string>;
};

type StubDispute = {
  id: string;
  object: "dispute";
  amount: number;
  currency: string;
  status: string;
  charge: { id: string; object: "charge"; payment_intent: string };
  payment_intent: string;
};

export type StripeStubOptions = {
  failWithStatus?: number;
  /** Steuert confirm: succeed | decline | requires_action | rate_limit | network_5xx */
  confirmOutcome?: "succeed" | "decline" | "requires_action" | "rate_limit" | "network_5xx";
  /** cancel wirft zuerst INVALID_REQUEST (bereits canceled/succeeded), dann retrieve. */
  cancelAlreadyFinal?: "canceled" | "succeeded";
  domainAlreadyExists?: boolean;
};

export function createStripeStub(options: StripeStubOptions = {}) {
  const calls: StubCall[] = [];
  const accounts = new Map<string, StubAccount>();
  const idempotent = new Map<string, string>();
  const payments = new Map<string, StubPaymentIntent>();
  const paymentIdempotent = new Map<string, string>();
  const refundIdempotent = new Map<string, StubRefund>();
  const refundsByPi = new Map<string, StubRefund[]>();
  const disputes = new Map<string, StubDispute>();
  const domains = new Set<string>();
  let counter = 0;

  const fetchFn: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const headers = new Headers(init?.headers);
    const method = (init?.method ?? "GET").toUpperCase();
    const contentType = headers.get("content-type") ?? "";
    const rawBody = typeof init?.body === "string" ? init.body : "";
    let jsonBody: unknown | null = null;
    let params = new URLSearchParams();
    if (contentType.includes("application/json") && rawBody) {
      try {
        jsonBody = JSON.parse(rawBody);
      } catch {
        jsonBody = null;
      }
    } else if (rawBody) {
      params = new URLSearchParams(rawBody);
    }
    calls.push({
      method,
      path: url.pathname,
      params,
      jsonBody,
      query: url.searchParams,
      idempotencyKey: headers.get("idempotency-key"),
      stripeAccount: headers.get("stripe-account"),
    });
    await Promise.resolve();

    if (options.failWithStatus) {
      return json(options.failWithStatus, {
        error: { type: "api_error", message: "Interner Stripe-Text, darf nicht nach außen" },
      });
    }

    if (method === "POST" && url.pathname === "/v2/core/accounts") {
      const key = headers.get("idempotency-key");
      const known = key ? idempotent.get(key) : undefined;
      if (known) return json(200, accounts.get(known));
      counter += 1;
      const id = `acct_stub${String(counter).padStart(6, "0")}`;
      const meta = isPlain(jsonBody) && isPlain(jsonBody.metadata)
        ? String((jsonBody.metadata as Record<string, unknown>).omlify_tenant_id ?? "")
        : "";
      const acc = freshAccount(id, meta);
      accounts.set(id, acc);
      if (key) idempotent.set(key, id);
      return json(200, acc);
    }

    const m = url.pathname.match(/^\/v2\/core\/accounts\/(acct_[A-Za-z0-9]+)$/);
    if (method === "GET" && m) {
      const acc = accounts.get(m[1]);
      if (!acc) {
        return json(404, {
          error: {
            type: "invalid_request_error",
            code: "resource_missing",
            message: `No such account: '${m[1]}'`,
          },
        });
      }
      return json(200, acc);
    }

    if (method === "POST" && url.pathname === "/v1/account_sessions") {
      return json(200, {
        object: "account_session",
        account: params.get("account"),
        client_secret: "accs_secret_stub",
        expires_at: 1_900_000_000,
        livemode: false,
        components: {},
      });
    }

    if (method === "POST" && url.pathname === "/v1/payment_intents") {
      const key = headers.get("idempotency-key");
      const known = key ? paymentIdempotent.get(key) : undefined;
      if (known) return json(200, payments.get(known));
      counter += 1;
      const id = `pi_stub${String(counter).padStart(6, "0")}`;
      const meta: Record<string, string> = {};
      for (const [k, v] of params.entries()) {
        const mm = k.match(/^metadata\[(.+)\]$/);
        if (mm) meta[mm[1]] = v;
      }
      const pi: StubPaymentIntent = {
        id,
        object: "payment_intent",
        amount: Number(params.get("amount") ?? 0),
        currency: params.get("currency") ?? "eur",
        status: "requires_payment_method",
        livemode: false,
        client_secret: `${id}_secret_stub`,
        metadata: meta,
        description: params.get("description"),
        last_payment_error: null,
        latest_charge: null,
      };
      payments.set(id, pi);
      if (key) paymentIdempotent.set(key, id);
      return json(200, pi);
    }

    const confirmMatch = url.pathname.match(/^\/v1\/payment_intents\/(pi_[A-Za-z0-9_]+)\/confirm$/);
    if (method === "POST" && confirmMatch) {
      if (options.confirmOutcome === "rate_limit") {
        return json(429, {
          error: { type: "rate_limit_error", message: "Rate limit intern" },
        });
      }
      if (options.confirmOutcome === "network_5xx") {
        return json(500, {
          error: { type: "api_error", message: "Interner Stripe-Text" },
        });
      }
      if (options.confirmOutcome === "decline") {
        return json(402, {
          error: {
            type: "card_error",
            code: "card_declined",
            message: "Your card was declined (intern)",
            payment_intent: {
              id: confirmMatch[1],
              object: "payment_intent",
              status: "requires_payment_method",
              last_payment_error: { code: "card_declined" },
            },
          },
        });
      }
      const pi = payments.get(confirmMatch[1]);
      if (!pi) {
        return json(404, {
          error: { type: "invalid_request_error", code: "resource_missing", message: "No such payment_intent" },
        });
      }
      if (options.confirmOutcome === "requires_action") {
        pi.status = "requires_action";
        pi.client_secret = `${pi.id}_secret_action`;
        return json(200, pi);
      }
      pi.status = "succeeded";
      pi.last_payment_error = null;
      pi.latest_charge = {
        id: `ch_stub_${pi.id}`,
        object: "charge",
        created: 1_700_000_100,
        amount: pi.amount,
      };
      return json(200, pi);
    }

    const cancelMatch = url.pathname.match(/^\/v1\/payment_intents\/(pi_[A-Za-z0-9_]+)\/cancel$/);
    if (method === "POST" && cancelMatch) {
      const pi = payments.get(cancelMatch[1]);
      if (!pi) {
        return json(404, {
          error: { type: "invalid_request_error", code: "resource_missing", message: "No such payment_intent" },
        });
      }
      if (options.cancelAlreadyFinal) {
        pi.status = options.cancelAlreadyFinal;
        return json(400, {
          error: {
            type: "invalid_request_error",
            code: "payment_intent_unexpected_state",
            message: `You cannot cancel this PaymentIntent because it has a status of ${options.cancelAlreadyFinal}`,
          },
        });
      }
      pi.status = "canceled";
      return json(200, pi);
    }

    const retrieveMatch = url.pathname.match(/^\/v1\/payment_intents\/(pi_[A-Za-z0-9_]+)$/);
    if (method === "GET" && retrieveMatch) {
      const pi = payments.get(retrieveMatch[1]);
      if (!pi) {
        return json(404, {
          error: { type: "invalid_request_error", code: "resource_missing", message: "No such payment_intent" },
        });
      }
      const expand = url.searchParams.getAll("expand[]").concat(url.searchParams.getAll("expand[0]"));
      const body = { ...pi };
      if (!expand.some((e) => e === "latest_charge") && typeof body.latest_charge === "object") {
        body.latest_charge = body.latest_charge?.id ?? null;
      }
      return json(200, body);
    }

    if (method === "POST" && url.pathname === "/v1/refunds") {
      const key = headers.get("idempotency-key");
      if (key && refundIdempotent.has(key)) return json(200, refundIdempotent.get(key));
      const piRef = params.get("payment_intent") ?? "";
      const pi = payments.get(piRef);
      if (!pi) {
        return json(404, {
          error: { type: "invalid_request_error", code: "resource_missing", message: "No such payment_intent" },
        });
      }
      const amountRaw = params.get("amount");
      const amount = amountRaw != null ? Number(amountRaw) : pi.amount;
      const metadata: Record<string, string> = {};
      for (const [k, v] of params.entries()) {
        const m = /^metadata\[(.+)\]$/.exec(k);
        if (m) metadata[m[1]] = v;
      }
      counter += 1;
      const refund: StubRefund = {
        id: `re_stub${String(counter).padStart(6, "0")}`,
        object: "refund",
        amount: Number.isFinite(amount) ? amount : pi.amount,
        currency: pi.currency,
        status: "succeeded",
        payment_intent: piRef,
        created: 1_700_000_200,
        metadata,
      };
      if (key) refundIdempotent.set(key, refund);
      const list = refundsByPi.get(piRef) ?? [];
      list.push(refund);
      refundsByPi.set(piRef, list);
      return json(200, refund);
    }

    if (method === "GET" && url.pathname === "/v1/refunds") {
      const piRef = url.searchParams.get("payment_intent") ?? "";
      const data = refundsByPi.get(piRef) ?? [];
      return json(200, { object: "list", data, has_more: false });
    }

    const disputeMatch = url.pathname.match(/^\/v1\/disputes\/((?:dp_|du_)[A-Za-z0-9_]+)$/);
    if (method === "GET" && disputeMatch) {
      const row = disputes.get(disputeMatch[1]);
      if (!row) {
        return json(404, {
          error: { type: "invalid_request_error", code: "resource_missing", message: "No such dispute" },
        });
      }
      return json(200, row);
    }

    if (method === "POST" && url.pathname === "/v1/payment_method_domains") {
      const domain = params.get("domain_name") ?? "";
      if (options.domainAlreadyExists || domains.has(domain)) {
        return json(400, {
          error: {
            type: "invalid_request_error",
            code: "resource_already_exists",
            message: "A payment method domain with this domain name already exists.",
          },
        });
      }
      domains.add(domain);
      counter += 1;
      return json(200, {
        id: `pmd_stub${String(counter).padStart(6, "0")}`,
        object: "payment_method_domain",
        domain_name: domain,
        livemode: false,
      });
    }

    return json(404, { error: { type: "invalid_request_error", message: "unbekannter Stub-Pfad" } });
  };

  return {
    fetchFn,
    calls,
    accounts,
    payments,
    refundsByPi,
    disputes,
    seedPayment(pi: StubPaymentIntent) {
      payments.set(pi.id, pi);
    },
    seedRefund(refund: StubRefund) {
      const list = refundsByPi.get(refund.payment_intent) ?? [];
      list.push(refund);
      refundsByPi.set(refund.payment_intent, list);
    },
    seedDispute(dispute: StubDispute) {
      disputes.set(dispute.id, dispute);
    },
    activate(ref: string) {
      const acc = accounts.get(ref);
      if (!acc) throw new Error(`Stub: Konto ${ref} fehlt`);
      acc.configuration.merchant.capabilities.card_payments = { status: "active", status_details: [] };
      acc.configuration.merchant.capabilities.stripe_balance.payouts = { status: "active", status_details: [] };
      acc.requirements = { entries: [], summary: {} };
    },
  };
}

function isPlain(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const signer = new Stripe(TEST_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient(() => {
  throw new Error("signer macht keine Anfragen");
}) });

export async function signStripeEvent(opts: {
  type: string;
  account: string | null;
  object: unknown;
  livemode?: boolean;
  secret?: string;
  /** Unix-Sekunden; Standard jetzt. */
  timestamp?: number;
  id?: string;
}): Promise<{ rawBody: string; signature: string }> {
  const rawBody = JSON.stringify({
    id: opts.id ?? `evt_test_${crypto.randomUUID().replaceAll("-", "")}`,
    object: "event",
    api_version: "2026-08-26.dahlia",
    created: opts.timestamp ?? Math.floor(Date.now() / 1000),
    type: opts.type,
    account: opts.account ?? undefined,
    livemode: opts.livemode ?? false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: { object: opts.object },
  });
  const signature = await signer.webhooks.generateTestHeaderStringAsync({
    payload: rawBody,
    secret: opts.secret ?? TEST_WEBHOOK_SECRET,
    timestamp: opts.timestamp,
    cryptoProvider: subtleCryptoProvider,
  });
  return { rawBody, signature };
}

/** Signierter Thin-Event-Umschlag (object = v2.core.event). */
export async function signStripeThinEvent(
  envelope: Record<string, unknown>,
  opts: { secret?: string; timestamp?: number } = {},
): Promise<{ rawBody: string; signature: string }> {
  const rawBody = JSON.stringify(envelope);
  const signature = await signer.webhooks.generateTestHeaderStringAsync({
    payload: rawBody,
    secret: opts.secret ?? TEST_WEBHOOK_SECRET_THIN,
    timestamp: opts.timestamp,
    cryptoProvider: subtleCryptoProvider,
  });
  return { rawBody, signature };
}
