/**
 * Vertragstest für PaymentProvider. Jeder Adapter meldet ihn mit eigenem Harness an
 * (fake/adapter_test.ts, stripe/adapter_test.ts). Kein Netzwerk: Der Stripe-Harness
 * ersetzt fetch durch einen Stub.
 */
import { connectedAccountIdempotencyKey, type PaymentProvider, ProviderError } from "./port.ts";

export interface PortHarness {
  provider: PaymentProvider;
  webhookSecret: string;
  /** Bringt das Konto beim (simulierten) Anbieter in den Zustand „bereit“. */
  activateAccount(ref: string): void;
  /** Signierter Event-Body mit aktuellem Kontostand bei account.updated. */
  signedEvent(type: string, accountRef: string): Promise<{ rawBody: string; signature: string }>;
}

const TENANT = "00000000-0000-4000-8000-00000000c0de";

export function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

export function assertEquals(actual: unknown, expected: unknown, msg = "assertEquals"): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}:\n  expected: ${e}\n  actual:   ${a}`);
}

export async function assertProviderError(
  fn: () => unknown,
  code: ProviderError["code"],
  msg = "assertProviderError",
): Promise<ProviderError> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof ProviderError && err.code === code) return err;
    const got = err instanceof ProviderError ? err.code : String(err);
    throw new Error(`${msg}: erwartet ${code}, erhalten ${got}`);
  }
  throw new Error(`${msg}: erwartet ${code}, aber kein Fehler`);
}

export function definePortContract(name: string, makeHarness: () => PortHarness): void {
  const t = (label: string, fn: (h: PortHarness) => Promise<void> | void) =>
    Deno.test(`Vertrag ${name}: ${label}`, () => fn(makeHarness()));

  t("id ist stripe", (h) => {
    assertEquals(h.provider.id, "stripe");
  });

  t("neues Konto ist in_progress, Testmodus, nichts freigeschaltet", async (h) => {
    const s = await h.provider.createConnectedAccount(TENANT, connectedAccountIdempotencyKey(TENANT));
    assert(s.ref.startsWith("acct_"), "ref beginnt mit acct_");
    assertEquals(
      { ...s, ref: "x" },
      {
        ref: "x",
        livemode: false,
        status: "in_progress",
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
        requirementsPending: true,
        requirementsDueAt: null,
        capabilities: { card: "inactive" },
      },
    );
  });

  t("gleicher Idempotency-Key → dasselbe Konto", async (h) => {
    const key = connectedAccountIdempotencyKey(TENANT);
    const a = await h.provider.createConnectedAccount(TENANT, key);
    const b = await h.provider.createConnectedAccount(TENANT, key);
    assertEquals(a.ref, b.ref);
  });

  t("getAccountState liest den aktuellen Stand nach", async (h) => {
    const { ref } = await h.provider.createConnectedAccount(TENANT, connectedAccountIdempotencyKey(TENANT));
    assertEquals((await h.provider.getAccountState(ref)).status, "in_progress");
    h.activateAccount(ref);
    const s = await h.provider.getAccountState(ref);
    assertEquals(
      [s.status, s.chargesEnabled, s.capabilities.card, s.requirementsPending],
      ["active", true, "active", false],
    );
  });

  t("account.updated → provider_account.updated; Stand über getAccountState", async (h) => {
    const { ref } = await h.provider.createConnectedAccount(TENANT, connectedAccountIdempotencyKey(TENANT));
    h.activateAccount(ref);
    const { rawBody, signature } = await h.signedEvent("account.updated", ref);
    const ev = await h.provider.verifyWebhook(rawBody, signature, h.webhookSecret);
    assertEquals([ev.type, ev.accountRef, ev.livemode], ["account.updated", ref, false]);
    const d = h.provider.toDomainEvent(ev);
    assert(d !== null, "Domain-Event erwartet");
    assert(d.type === "provider_account.updated", "Typ provider_account.updated");
    assertEquals([d.type, d.id, d.accountRef], ["provider_account.updated", ev.id, ref]);
    if (d.payload) {
      assertEquals([d.payload.status, d.payload.capabilities.card], ["active", "active"]);
    } else {
      const s = await h.provider.getAccountState(ref);
      assertEquals([s.status, s.capabilities.card], ["active", "active"]);
    }
  });

  t("unbekanntes Event → null", async (h) => {
    const { ref } = await h.provider.createConnectedAccount(TENANT, connectedAccountIdempotencyKey(TENANT));
    const { rawBody, signature } = await h.signedEvent("charge.succeeded", ref);
    const ev = await h.provider.verifyWebhook(rawBody, signature, h.webhookSecret);
    assertEquals(h.provider.toDomainEvent(ev), null);
  });

  t("payment_intent.succeeded → payment.updated ohne Status", async (h) => {
    const { ref } = await h.provider.createConnectedAccount(TENANT, connectedAccountIdempotencyKey(TENANT));
    const { rawBody, signature } = await h.signedEvent("payment_intent.succeeded", ref);
    const ev = await h.provider.verifyWebhook(rawBody, signature, h.webhookSecret);
    const d = h.provider.toDomainEvent(ev);
    assert(d !== null, "Domain-Event erwartet");
    assert(d.type === "payment.updated", "Typ payment.updated");
    assertEquals([d.accountRef, d.livemode], [ref, false]);
    assert(d.ref.startsWith("pi_"), "ref beginnt mit pi_");
  });

  t("falsches Secret → INVALID_SIGNATURE", async (h) => {
    const { ref } = await h.provider.createConnectedAccount(TENANT, connectedAccountIdempotencyKey(TENANT));
    const { rawBody, signature } = await h.signedEvent("account.updated", ref);
    await assertProviderError(
      () => h.provider.verifyWebhook(rawBody, signature, "whsec_falsch"),
      "INVALID_SIGNATURE",
    );
  });

  t("veränderter Body → INVALID_SIGNATURE", async (h) => {
    const { ref } = await h.provider.createConnectedAccount(TENANT, connectedAccountIdempotencyKey(TENANT));
    const { rawBody, signature } = await h.signedEvent("account.updated", ref);
    await assertProviderError(
      () => h.provider.verifyWebhook(rawBody.replace('"account.updated"', '"account.updatex"'), signature, h.webhookSecret),
      "INVALID_SIGNATURE",
    );
  });

}
