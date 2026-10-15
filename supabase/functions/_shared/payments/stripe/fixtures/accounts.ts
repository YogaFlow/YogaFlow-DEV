/**
 * Kontofixtures in der Form von v2.core.Account, gekürzt auf die Felder,
 * die die Abbildung liest.
 */
import type { StripeAccountSnapshot } from "../account_status.ts";

/** 2026-10-12T10:00:00.000Z */
export const FIXTURE_DEADLINE_ISO = "2026-10-12T10:00:00.000Z";

type EntryStatus = "currently_due" | "past_due" | "eventually_due";
type AwaitingFrom = "user" | "stripe";

function entry(status: EntryStatus, description: string, awaiting: AwaitingFrom = "user") {
  return {
    awaiting_action_from: awaiting,
    description,
    errors: [] as [],
    impact: {},
    minimum_deadline: { status },
    requested_reasons: [{ code: "routine_onboarding" as const }],
  };
}

function account(
  id: string,
  opts: {
    card?: string;
    payouts?: string;
    entries?: Array<{ status: EntryStatus; awaiting?: AwaitingFrom; description?: string }>;
    deadlineTime?: string | null;
  },
): StripeAccountSnapshot & Record<string, unknown> {
  const entries = (opts.entries ?? []).map((e, i) =>
    entry(e.status, e.description ?? `req_${i}`, e.awaiting ?? "user")
  );
  const due = entries.filter((e) =>
    e.minimum_deadline.status === "currently_due" || e.minimum_deadline.status === "past_due"
  );
  const summaryDeadline = due.length > 0
    ? {
      status: due.some((e) => e.minimum_deadline.status === "past_due")
        ? "past_due" as const
        : "currently_due" as const,
      time: opts.deadlineTime === undefined ? undefined : opts.deadlineTime,
    }
    : undefined;

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
          card_payments: opts.card === undefined ? undefined : { status: opts.card },
          stripe_balance: opts.payouts === undefined
            ? undefined
            : { payouts: { status: opts.payouts } },
        },
      },
    },
    requirements: {
      entries,
      summary: summaryDeadline ? { minimum_deadline: summaryDeadline } : {},
    },
    metadata: { omlify_tenant_id: "00000000-0000-4000-8000-00000000c0de" },
  } as StripeAccountSnapshot & Record<string, unknown>;
}

/**
 * Frisches v2-Konto: Pflichtangaben sofort past_due, Nutzerin am Zug
 * (Kontosperre bis erledigt — nicht „Frist verpasst“ wie in v1).
 */
export const notSubmitted = account("acct_fixture_notsubmitted", {
  card: "inactive",
  payouts: "inactive",
  entries: [
    { status: "past_due", awaiting: "user", description: "business_type" },
    { status: "past_due", awaiting: "user", description: "tos_acceptance" },
  ],
});

/** currently_due, Nutzerin am Zug, Karte noch nicht aktiv. */
export const submittedCurrentlyDue = account("acct_fixture_currentlydue", {
  card: "pending",
  payouts: "inactive",
  entries: [{ status: "currently_due", awaiting: "user" }],
});

/** past_due, Nutzerin am Zug (weiter in_progress, nicht action_required). */
export const submittedPastDue = account("acct_fixture_pastdue", {
  card: "inactive",
  payouts: "inactive",
  entries: [
    { status: "past_due", awaiting: "user" },
    { status: "currently_due", awaiting: "user" },
  ],
});

/** Nach Einreichung: nur Stripe am Zug → in_review. */
export const stripeReviewing = account("acct_fixture_stripe_review", {
  card: "pending",
  payouts: "pending",
  entries: [{ status: "currently_due", awaiting: "stripe", description: "verification" }],
});

/** Nichts fällig, Karte pending — in Prüfung. */
export const inReview = account("acct_fixture_inreview", {
  card: "pending",
  payouts: "pending",
  entries: [],
});

/** Fertig. */
export const active = account("acct_fixture_active", {
  card: "active",
  payouts: "active",
  entries: [],
});

/** Active mit Frist (currently_due, Nutzerin am Zug, Karte weiter active). */
export const chargesEnabledCurrentlyDue = account("acct_fixture_chargescurrently", {
  card: "active",
  payouts: "active",
  entries: [{ status: "currently_due", awaiting: "user" }],
  deadlineTime: FIXTURE_DEADLINE_ISO,
});

/**
 * Karte active, aber Nutzerin hat past_due — kein active mehr;
 * Adapter liefert in_progress (kein action_required).
 */
export const chargesEnabledPastDue = account("acct_fixture_chargespastdue", {
  card: "active",
  payouts: "inactive",
  entries: [
    { status: "past_due", awaiting: "user" },
    { status: "currently_due", awaiting: "user" },
  ],
});

/** Keine card_payments-Capability. */
export const noCardCapability = account("acct_fixture_nocard", {
  entries: [],
});

/** Thin-Event-Beispiele (Umschlag object=v2.core.event). */
export function thinAccountEvent(
  type: string,
  accountId: string,
  opts: { id?: string; livemode?: boolean } = {},
): Record<string, unknown> {
  return {
    id: opts.id ?? `evt_thin_${crypto.randomUUID().replaceAll("-", "")}`,
    object: "v2.core.event",
    type,
    created: "2026-09-28T12:00:00.000Z",
    livemode: opts.livemode ?? false,
    related_object: {
      id: accountId,
      type: "v2.core.account",
      url: `/v2/core/accounts/${accountId}`,
    },
  };
}

export const thinRequirementsUpdated = thinAccountEvent(
  "v2.core.account[requirements].updated",
  active.id,
  { id: "evt_thin_requirements" },
);

export const thinMerchantCapabilityUpdated = thinAccountEvent(
  "v2.core.account[configuration.merchant].capability_status_updated",
  active.id,
  { id: "evt_thin_merchant_cap" },
);

export const thinAccountUpdated = thinAccountEvent(
  "v2.core.account.updated",
  active.id,
  { id: "evt_thin_account_updated" },
);

export const thinPing = {
  id: "evt_thin_ping",
  object: "v2.core.event",
  type: "v2.core.event_destination.ping",
  created: "2026-09-28T12:00:00.000Z",
  livemode: false,
  related_object: {
    id: "ed_fixture_ping",
    type: "v2.core.event_destination",
    url: "/v2/core/event_destinations/ed_fixture_ping",
  },
};
