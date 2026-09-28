/**
 * Kontofixtures in der Form von Stripe.Account (v1), gekürzt auf die Felder,
 * die die Abbildung liest, plus einige Begleitfelder wie in echten Antworten.
 */
import type { StripeAccountSnapshot } from "../account_status.ts";

type Req = { currently_due: string[]; past_due: string[]; eventually_due: string[]; current_deadline?: number | null };

/** 2026-10-12T10:00:00.000Z */
const FIXTURE_DEADLINE_UNIX = 1791799200;

function account(
  id: string,
  flags: { details: boolean; charges: boolean; payouts: boolean },
  requirements: Req,
  card: string | undefined,
): StripeAccountSnapshot & Record<string, unknown> {
  const raw = {
    id,
    object: "account",
    country: "DE",
    type: "standard",
    details_submitted: flags.details,
    charges_enabled: flags.charges,
    payouts_enabled: flags.payouts,
    requirements: {
      current_deadline: null,
      ...requirements,
      disabled_reason: null,
      pending_verification: [],
    },
    capabilities: card === undefined ? {} : { card_payments: card, transfers: card },
    metadata: { omlify_tenant_id: "00000000-0000-4000-8000-00000000c0de" },
  };
  return raw;
}

const none: Req = { currently_due: [], past_due: [], eventually_due: [] };

/** Frisch angelegt, noch nichts eingereicht. */
export const notSubmitted = account(
  "acct_fixture_notsubmitted",
  { details: false, charges: false, payouts: false },
  { currently_due: ["business_type", "tos_acceptance.date"], past_due: [], eventually_due: ["business_type"] },
  "inactive",
);

/** Eingereicht, Stripe fordert etwas nach. */
export const submittedCurrentlyDue = account(
  "acct_fixture_currentlydue",
  { details: true, charges: false, payouts: false },
  { currently_due: ["individual.verification.document"], past_due: [], eventually_due: [] },
  "pending",
);

/** Eingereicht, Frist abgelaufen. */
export const submittedPastDue = account(
  "acct_fixture_pastdue",
  { details: true, charges: false, payouts: false },
  { currently_due: ["external_account"], past_due: ["external_account"], eventually_due: [] },
  "inactive",
);

/** Eingereicht, nichts fällig, Stripe prüft noch. */
export const inReview = account(
  "acct_fixture_inreview",
  { details: true, charges: false, payouts: false },
  none,
  "pending",
);

/** Fertig. */
export const active = account(
  "acct_fixture_active",
  { details: true, charges: true, payouts: true },
  none,
  "active",
);

/** Grenzfall: aktiv, später werden weitere Angaben fällig. */
export const activeEventuallyDue = account(
  "acct_fixture_eventually",
  { details: true, charges: true, payouts: true },
  { currently_due: [], past_due: [], eventually_due: ["company.tax_id"] },
  "active",
);

/** Grenzfall: Zahlungen noch an, aber eine Frist ist abgelaufen. */
export const chargesEnabledPastDue = account(
  "acct_fixture_chargespastdue",
  { details: true, charges: true, payouts: false },
  { currently_due: ["individual.id_number"], past_due: ["individual.id_number"], eventually_due: [] },
  "active",
);

/** Grenzfall: Zahlungen an, Angabe fällig mit laufender Frist (noch nicht past_due). */
export const chargesEnabledCurrentlyDue = account(
  "acct_fixture_chargescurrently",
  { details: true, charges: true, payouts: true },
  {
    currently_due: ["individual.id_number"],
    past_due: [],
    eventually_due: ["individual.id_number"],
    current_deadline: FIXTURE_DEADLINE_UNIX,
  },
  "active",
);

/** Grenzfall: capabilities ohne card_payments. */
export const noCardCapability = account(
  "acct_fixture_nocard",
  { details: true, charges: false, payouts: false },
  none,
  undefined,
);
