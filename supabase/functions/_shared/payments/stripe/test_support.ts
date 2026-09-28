/**
 * Testhilfen: ein fetch-Stub, der die benötigten Stripe-Endpunkte im Speicher
 * beantwortet, und signierte Events. Kein Netzwerk; die Tests laufen ohne --allow-net.
 */
import { Stripe, subtleCryptoProvider } from "./sdk.ts";

export const TEST_WEBHOOK_SECRET = "whsec_omlify_unit_test";
export const TEST_SECRET_KEY = "sk_test_omlify_unit_test";

export interface StubCall {
  method: string;
  path: string;
  params: URLSearchParams;
  idempotencyKey: string | null;
}

export type StubAccount = {
  id: string;
  object: "account";
  details_submitted: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  requirements: { currently_due: string[]; past_due: string[]; eventually_due: string[] };
  capabilities: { card_payments?: string; transfers?: string };
  metadata: Record<string, string>;
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "request-id": "req_stub" },
  });
}

export function createStripeStub(options: { failWithStatus?: number } = {}) {
  const calls: StubCall[] = [];
  const accounts = new Map<string, StubAccount>();
  const idempotent = new Map<string, string>();
  let counter = 0;

  const fetchFn: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const headers = new Headers(init?.headers);
    const method = (init?.method ?? "GET").toUpperCase();
    const params = new URLSearchParams(typeof init?.body === "string" ? init.body : "");
    calls.push({ method, path: url.pathname, params, idempotencyKey: headers.get("idempotency-key") });
    await Promise.resolve();

    if (options.failWithStatus) {
      return json(options.failWithStatus, {
        error: { type: "api_error", message: "Interner Stripe-Text, darf nicht nach außen" },
      });
    }

    if (method === "POST" && url.pathname === "/v1/accounts") {
      const key = headers.get("idempotency-key");
      const known = key ? idempotent.get(key) : undefined;
      if (known) return json(200, accounts.get(known));
      counter += 1;
      const id = `acct_stub${String(counter).padStart(6, "0")}`;
      const acc: StubAccount = {
        id,
        object: "account",
        details_submitted: false,
        charges_enabled: false,
        payouts_enabled: false,
        requirements: { currently_due: ["business_type"], past_due: [], eventually_due: ["business_type"] },
        capabilities: { card_payments: "inactive", transfers: "inactive" },
        metadata: { omlify_tenant_id: params.get("metadata[omlify_tenant_id]") ?? "" },
      };
      accounts.set(id, acc);
      if (key) idempotent.set(key, id);
      return json(200, acc);
    }

    const m = url.pathname.match(/^\/v1\/accounts\/(acct_[A-Za-z0-9]+)$/);
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

    return json(404, { error: { type: "invalid_request_error", message: "unbekannter Stub-Pfad" } });
  };

  return {
    fetchFn,
    calls,
    accounts,
    activate(ref: string) {
      const acc = accounts.get(ref);
      if (!acc) throw new Error(`Stub: Konto ${ref} fehlt`);
      acc.details_submitted = true;
      acc.charges_enabled = true;
      acc.payouts_enabled = true;
      acc.requirements = { currently_due: [], past_due: [], eventually_due: [] };
      acc.capabilities = { card_payments: "active", transfers: "active" };
    },
  };
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
