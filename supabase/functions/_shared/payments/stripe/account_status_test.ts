import { assertEquals } from "../port_contract.ts";
import {
  mapCardCapability,
  mapDetailsSubmitted,
  mapOnboardingStatus,
  mapStripeAccount,
  parseAccountSnapshot,
} from "./account_status.ts";
import * as fx from "./fixtures/accounts.ts";

Deno.test("Status: frisches v2 (past_due, Nutzerin am Zug) → in_progress", () => {
  assertEquals(mapOnboardingStatus(fx.notSubmitted), "in_progress");
});

Deno.test("Status: currently_due, Nutzerin am Zug, Karte nicht active → in_progress", () => {
  assertEquals(mapOnboardingStatus(fx.submittedCurrentlyDue), "in_progress");
});

Deno.test("Status: past_due, Nutzerin am Zug → in_progress (kein action_required)", () => {
  assertEquals(mapOnboardingStatus(fx.submittedPastDue), "in_progress");
});

Deno.test("Status: nach Einreichung nur Stripe am Zug → in_review", () => {
  assertEquals(mapOnboardingStatus(fx.stripeReviewing), "in_review");
});

Deno.test("Status: nichts fällig, Karte pending → in_review", () => {
  assertEquals(mapOnboardingStatus(fx.inReview), "in_review");
});

Deno.test("Status: Karte active → active", () => {
  assertEquals(mapOnboardingStatus(fx.active), "active");
});

Deno.test("1.2b-2: Karte active, currently_due (Nutzerin) → active", () => {
  assertEquals(mapOnboardingStatus(fx.chargesEnabledCurrentlyDue), "active");
});

Deno.test("Grenzfall: Karte active, Nutzerin past_due → in_progress", () => {
  assertEquals(mapOnboardingStatus(fx.chargesEnabledPastDue), "in_progress");
});

Deno.test("Status: Adapter erzeugt nie action_required / not_started", () => {
  const all = [
    fx.notSubmitted,
    fx.submittedCurrentlyDue,
    fx.submittedPastDue,
    fx.stripeReviewing,
    fx.inReview,
    fx.active,
    fx.chargesEnabledCurrentlyDue,
    fx.chargesEnabledPastDue,
    fx.noCardCapability,
  ];
  for (const a of all) {
    const s = mapOnboardingStatus(a);
    if (s === "action_required" || (s as string) === "not_started") {
      throw new Error(`${a.id} → ${s}`);
    }
  }
});

Deno.test("Karte: card_payments active / pending / sonst inactive", () => {
  assertEquals(mapCardCapability(fx.active), "active");
  assertEquals(mapCardCapability(fx.inReview), "pending");
  assertEquals(mapCardCapability(fx.submittedPastDue), "inactive");
  assertEquals(mapCardCapability(fx.noCardCapability), "inactive");
});

Deno.test("details_submitted abgeleitet: keine currently_due/past_due", () => {
  assertEquals(mapDetailsSubmitted(fx.active), true);
  assertEquals(mapDetailsSubmitted(fx.inReview), true);
  assertEquals(mapDetailsSubmitted(fx.notSubmitted), false);
  assertEquals(mapDetailsSubmitted(fx.submittedCurrentlyDue), false);
  assertEquals(mapDetailsSubmitted(fx.submittedPastDue), false);
  assertEquals(mapDetailsSubmitted(fx.chargesEnabledCurrentlyDue), false);
  assertEquals(mapDetailsSubmitted(fx.stripeReviewing), false);
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

Deno.test("Active mit Frist → active + requirementsPending + DueAt", () => {
  const s = mapStripeAccount(fx.chargesEnabledCurrentlyDue, false);
  assertEquals(
    [s.status, s.chargesEnabled, s.requirementsPending, s.detailsSubmitted, s.requirementsDueAt],
    ["active", true, true, false, fx.FIXTURE_DEADLINE_ISO],
  );
});

Deno.test("Nachforderung: currently_due oder past_due, eventually_due nicht allein", () => {
  assertEquals(mapStripeAccount(fx.active, false).requirementsPending, false);
  assertEquals(mapStripeAccount(fx.submittedCurrentlyDue, false).requirementsPending, true);
  assertEquals(mapStripeAccount(fx.submittedPastDue, false).requirementsPending, true);
  assertEquals(mapStripeAccount({ ...fx.active, requirements: null }, false).requirementsPending, false);
});

Deno.test("Frist: fehlt oder ungültig → null", () => {
  assertEquals(mapStripeAccount(fx.active, false).requirementsDueAt, null);
  assertEquals(mapStripeAccount({ ...fx.active, requirements: null }, false).requirementsDueAt, null);
  assertEquals(
    mapStripeAccount({
      ...fx.chargesEnabledCurrentlyDue,
      requirements: {
        entries: fx.chargesEnabledCurrentlyDue.requirements?.entries,
        summary: { minimum_deadline: { status: "currently_due", time: "kein-datum" } },
      },
    }, false).requirementsDueAt,
    null,
  );
});

Deno.test("Fallback ohne awaiting_action_from: currently_due/past_due → in_progress", () => {
  const withoutField = {
    ...fx.notSubmitted,
    requirements: {
      entries: [{ minimum_deadline: { status: "past_due" } }],
      summary: { minimum_deadline: { status: "past_due" } },
    },
  };
  assertEquals(mapOnboardingStatus(withoutField), "in_progress");
  assertEquals(mapOnboardingStatus({ ...fx.inReview, requirements: { entries: [] } }), "in_review");
});

Deno.test("parseAccountSnapshot: gültig, fremdes Objekt", () => {
  assertEquals(parseAccountSnapshot(fx.active)?.id, "acct_fixture_active");
  assertEquals(parseAccountSnapshot({ id: "acct_1", object: "account" }), null);
  assertEquals(parseAccountSnapshot({ id: "pi_123", object: "payment_intent" }), null);
  assertEquals(parseAccountSnapshot(null), null);
});
