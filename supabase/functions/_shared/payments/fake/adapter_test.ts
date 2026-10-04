import { assertEquals, assertProviderError, definePortContract } from "../port_contract.ts";
import { FAKE_WEBHOOK_SECRET, FakePaymentProvider } from "./adapter.ts";

definePortContract("Fake", () => {
  const provider = new FakePaymentProvider();
  return {
    provider,
    webhookSecret: FAKE_WEBHOOK_SECRET,
    activateAccount: (ref) => provider.activateAccount(ref),
    signedEvent: async (type, ref) => {
      const rawBody = provider.buildEvent(type, ref);
      return { rawBody, signature: await provider.signWebhook(rawBody) };
    },
  };
});

Deno.test("Fake: setAccountState schaltet einzelne Felder um", async () => {
  const p = new FakePaymentProvider();
  const { ref } = await p.createConnectedAccount("t1", "k1");
  p.setAccountState(ref, { status: "action_required", detailsSubmitted: true, capabilities: { card: "pending" } });
  const s = await p.getAccountState(ref);
  assertEquals([s.status, s.detailsSubmitted, s.chargesEnabled, s.capabilities.card], [
    "action_required",
    true,
    false,
    "pending",
  ]);
});

Deno.test("Fake: Zeitstempel außerhalb der Toleranz → INVALID_SIGNATURE", async () => {
  const p = new FakePaymentProvider({ now: () => 2_000_000_000 });
  const { ref } = await p.createConnectedAccount("t1", "k1");
  const rawBody = p.buildEvent("account.updated", ref);
  const old = await p.signWebhook(rawBody, FAKE_WEBHOOK_SECRET, 2_000_000_000 - 301);
  await assertProviderError(() => p.verifyWebhook(rawBody, old, FAKE_WEBHOOK_SECRET), "INVALID_SIGNATURE");
});

Deno.test("Fake: Live-Event → LIVEMODE_MISMATCH", async () => {
  const p = new FakePaymentProvider();
  const { ref } = await p.createConnectedAccount("t1", "k1");
  const rawBody = p.buildEvent("account.updated", ref, { livemode: true });
  await assertProviderError(
    async () => p.verifyWebhook(rawBody, await p.signWebhook(rawBody), FAKE_WEBHOOK_SECRET),
    "LIVEMODE_MISMATCH",
  );
});

Deno.test("Fake: unbekanntes Konto → PROVIDER_REJECTED", async () => {
  await assertProviderError(() => new FakePaymentProvider().getAccountState("acct_nix"), "PROVIDER_REJECTED");
});

Deno.test("Fake: Zahlung succeed / decline / requires_action / provider_unavailable", async () => {
  const p = new FakePaymentProvider();
  const base = {
    accountRef: "acct_fake",
    amountCents: 1500,
    currency: "EUR" as const,
    attemptId: "att",
    tenantId: "t",
    registrationId: "r",
    subjectType: "registration" as const,
    subjectId: "r",
    idempotencyKey: "idem-1",
  };
  const { ref } = await p.createPaymentIntent(base);
  assertEquals((await p.confirmPaymentIntent({
    accountRef: "acct_fake",
    ref,
    confirmationToken: "ctoken_x",
    returnUrl: "https://example.test",
  })).status, "succeeded");

  p.setPaymentBehavior("decline");
  const d = await p.createPaymentIntent({ ...base, idempotencyKey: "idem-2" });
  assertEquals(
    await p.confirmPaymentIntent({
      accountRef: "acct_fake",
      ref: d.ref,
      confirmationToken: "ctoken_x",
      returnUrl: "https://example.test",
    }),
    { status: "failed", failureCode: "card_declined" },
  );

  p.setPaymentBehavior("requires_action");
  const a = await p.createPaymentIntent({ ...base, idempotencyKey: "idem-3" });
  const action = await p.confirmPaymentIntent({
    accountRef: "acct_fake",
    ref: a.ref,
    confirmationToken: "ctoken_x",
    returnUrl: "https://example.test",
  });
  assertEquals(action.status, "requires_action");
  assertEquals(typeof action.clientSecret, "string");

  p.setPaymentBehavior("provider_unavailable");
  await assertProviderError(
    () => p.createPaymentIntent({ ...base, idempotencyKey: "idem-4" }),
    "PROVIDER_UNAVAILABLE",
  );

  const secretCalls = JSON.stringify(p.paymentCalls);
  assertEquals(secretCalls.includes("ctoken"), false);
  assertEquals(secretCalls.includes("clientSecret"), false);
  assertEquals(secretCalls.includes("acct_"), false);
});

Deno.test("Fake: already_canceled und Domain idempotent", async () => {
  const p = new FakePaymentProvider();
  const { ref } = await p.createPaymentIntent({
    accountRef: "acct_fake",
    amountCents: 1000,
    currency: "EUR",
    attemptId: "a",
    tenantId: "t",
    registrationId: "r",
    subjectType: "registration",
    subjectId: "r",
    idempotencyKey: "k-c",
  });
  p.setPaymentBehavior("already_canceled");
  assertEquals((await p.cancelPaymentIntent("acct_fake", ref)).status, "canceled");
  assertEquals(await p.registerPaymentDomain("acct_fake", "demo.test"), { status: "registered" });
  assertEquals(await p.registerPaymentDomain("acct_fake", "demo.test"), { status: "already_registered" });
});
