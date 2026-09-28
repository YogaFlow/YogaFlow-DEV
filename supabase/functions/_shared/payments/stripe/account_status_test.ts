import { assertEquals } from "../port_contract.ts";
import { mapCardCapability, mapOnboardingStatus, mapStripeAccount, parseAccountSnapshot } from "./account_status.ts";
import * as fx from "./fixtures/accounts.ts";

Deno.test("Status: nicht eingereicht → in_progress", () => {
  assertEquals(mapOnboardingStatus(fx.notSubmitted), "in_progress");
});

Deno.test("Status: eingereicht, currently_due gefüllt → action_required", () => {
  assertEquals(mapOnboardingStatus(fx.submittedCurrentlyDue), "action_required");
});

Deno.test("Status: eingereicht, past_due gefüllt → action_required", () => {
  assertEquals(mapOnboardingStatus(fx.submittedPastDue), "action_required");
});

Deno.test("Status: eingereicht, nichts fällig, charges aus → in_review", () => {
  assertEquals(mapOnboardingStatus(fx.inReview), "in_review");
});

Deno.test("Status: charges an, past_due leer → active", () => {
  assertEquals(mapOnboardingStatus(fx.active), "active");
});

Deno.test("Grenzfall: active trotz gefülltem eventually_due", () => {
  assertEquals(mapOnboardingStatus(fx.activeEventuallyDue), "active");
});

Deno.test("Grenzfall: charges an, past_due gefüllt → action_required", () => {
  assertEquals(mapOnboardingStatus(fx.chargesEnabledPastDue), "action_required");
});

Deno.test("Grenzfall: charges an, nur currently_due gefüllt → active", () => {
  assertEquals(mapOnboardingStatus(fx.chargesEnabledCurrentlyDue), "active");
});

Deno.test("Grenzfall: details_submitted false schlägt charges_enabled", () => {
  assertEquals(mapOnboardingStatus({ ...fx.active, details_submitted: false }), "in_progress");
});

Deno.test("Grenzfall: requirements null → wie leer", () => {
  assertEquals(mapOnboardingStatus({ ...fx.inReview, requirements: null }), "in_review");
});

Deno.test("Status: nie not_started aus dem Adapter", () => {
  for (const a of Object.values(fx)) {
    const s = mapOnboardingStatus(a);
    if ((s as string) === "not_started") throw new Error(`${a.id} → not_started`);
  }
});

Deno.test("Karte: card_payments active / pending / sonst inactive", () => {
  assertEquals(mapCardCapability(fx.active), "active");
  assertEquals(mapCardCapability(fx.inReview), "pending");
  assertEquals(mapCardCapability(fx.submittedPastDue), "inactive");
  assertEquals(mapCardCapability(fx.noCardCapability), "inactive");
  assertEquals(mapCardCapability({ ...fx.active, capabilities: { card_payments: "unrequested" } }), "inactive");
  assertEquals(mapCardCapability({ ...fx.active, capabilities: null }), "inactive");
});

Deno.test("Gesamtabbildung aktives Konto", () => {
  assertEquals(mapStripeAccount(fx.active, false), {
    ref: "acct_fixture_active",
    livemode: false,
    status: "active",
    chargesEnabled: true,
    payoutsEnabled: true,
    detailsSubmitted: true,
    requirementsPending: false,
    requirementsDueAt: null,
    capabilities: { card: "active" },
  });
});

Deno.test("1.2b-2: charges an, currently_due mit Frist → active, Nachforderung und Frist sichtbar", () => {
  const s = mapStripeAccount(fx.chargesEnabledCurrentlyDue, false);
  assertEquals(
    [s.status, s.chargesEnabled, s.requirementsPending, s.requirementsDueAt],
    ["active", true, true, "2026-10-12T10:00:00.000Z"],
  );
});

Deno.test("Nachforderung: nur currently_due zählt, eventually_due nicht", () => {
  assertEquals(mapStripeAccount(fx.activeEventuallyDue, false).requirementsPending, false);
  assertEquals(mapStripeAccount(fx.submittedCurrentlyDue, false).requirementsPending, true);
  assertEquals(mapStripeAccount({ ...fx.active, requirements: null }, false).requirementsPending, false);
});

Deno.test("Frist: fehlt, null oder kein endlicher Wert → null", () => {
  assertEquals(mapStripeAccount(fx.active, false).requirementsDueAt, null);
  assertEquals(mapStripeAccount({ ...fx.active, requirements: null }, false).requirementsDueAt, null);
  assertEquals(
    mapStripeAccount({ ...fx.active, requirements: { currently_due: [], current_deadline: Number.NaN } }, false)
      .requirementsDueAt,
    null,
  );
});

Deno.test("parseAccountSnapshot: gültig, fremdes Objekt, kaputte Felder", () => {
  assertEquals(parseAccountSnapshot(fx.active)?.id, "acct_fixture_active");
  assertEquals(parseAccountSnapshot({ id: "pi_123", object: "payment_intent" }), null);
  assertEquals(parseAccountSnapshot({ id: "acct_1", charges_enabled: "yes" }), null);
  assertEquals(parseAccountSnapshot({ id: "acct_1", requirements: { past_due: [1] } }), null);
  assertEquals(parseAccountSnapshot({ id: "acct_1", requirements: { current_deadline: "morgen" } }), null);
  assertEquals(parseAccountSnapshot({ id: "acct_1", requirements: { current_deadline: 1791799200 } })?.id, "acct_1");
  assertEquals(parseAccountSnapshot(null), null);
});
