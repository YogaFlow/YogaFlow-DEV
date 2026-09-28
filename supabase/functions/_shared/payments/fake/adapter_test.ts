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
