/**
 * Reine Abbildung eines Stripe-Kontos (Accounts v2) auf ProviderAccountState.
 * Ohne SDK-Import, damit Fixtures und geparste Antworten dieselbe Form durchlaufen.
 *
 * Abbildung V2 (Nachtrag 5d): details_submitted gibt es in v2 nicht — abgeleitet.
 * action_required erzeugt der Adapter vorerst nicht (Enum bleibt im Port).
 *
 * Quelle „wer ist am Zug“: requirements.entries[].awaiting_action_from = user | stripe
 * (Stripe API Account object / SDK V2.Core.Account.Requirements.Entry,
 * docs.stripe.com/api/v2/core/accounts/object, API 2026-08-26.dahlia).
 */
import type { CapabilityStatus, OnboardingStatus, ProviderAccountState } from "../port.ts";

export interface RequirementEntry {
  awaiting_action_from?: string | null;
  minimum_deadline?: { status?: string | null } | null;
}

/** Felder von v2.core.Account, die die Abbildung liest. */
export interface StripeAccountSnapshot {
  id: string;
  object?: string;
  livemode?: boolean;
  configuration?: {
    merchant?: {
      capabilities?: {
        card_payments?: { status?: string | null } | null;
        stripe_balance?: {
          payouts?: { status?: string | null } | null;
        } | null;
      } | null;
    } | null;
  } | null;
  requirements?: {
    entries?: RequirementEntry[] | null;
    summary?: {
      minimum_deadline?: {
        status?: string | null;
        /** RFC 3339. */
        time?: string | null;
      } | null;
    } | null;
  } | null;
}

function entriesOf(a: StripeAccountSnapshot): RequirementEntry[] {
  return Array.isArray(a.requirements?.entries) ? a.requirements!.entries! : [];
}

function entryStatus(entry: RequirementEntry): string | null {
  const s = entry.minimum_deadline?.status;
  return typeof s === "string" ? s : null;
}

function hasEntryStatus(a: StripeAccountSnapshot, status: string): boolean {
  return entriesOf(a).some((e) => entryStatus(e) === status);
}

function hasCurrentlyDue(a: StripeAccountSnapshot): boolean {
  return hasEntryStatus(a, "currently_due");
}

function hasPastDue(a: StripeAccountSnapshot): boolean {
  return hasEntryStatus(a, "past_due");
}

/** Mindestens ein Eintrag trägt awaiting_action_from als String. */
function hasAwaitingActionFrom(a: StripeAccountSnapshot): boolean {
  return entriesOf(a).some((e) => typeof e.awaiting_action_from === "string");
}

function isUserAction(entry: RequirementEntry): boolean {
  return entry.awaiting_action_from === "user";
}

function hasUserPastDue(a: StripeAccountSnapshot): boolean {
  return entriesOf(a).some((e) => isUserAction(e) && entryStatus(e) === "past_due");
}

function hasUserAction(a: StripeAccountSnapshot): boolean {
  return entriesOf(a).some((e) => isUserAction(e));
}

export function mapCardCapability(a: StripeAccountSnapshot): CapabilityStatus {
  const raw = a.configuration?.merchant?.capabilities?.card_payments?.status;
  if (raw === "active") return "active";
  if (raw === "pending") return "pending";
  return "inactive";
}

/**
 * Status-Abbildung (ohne action_required):
 * Mit awaiting_action_from:
 * 1. Karte active und kein user+past_due → active
 * 2. mindestens ein Eintrag mit Nutzerin am Zug → in_progress
 * 3. sonst → in_review
 * Ohne das Feld (Fallback): Karte active und kein past_due → active;
 * sonst currently_due/past_due → in_progress; sonst in_review.
 */
export function mapOnboardingStatus(a: StripeAccountSnapshot): OnboardingStatus {
  const card = mapCardCapability(a);

  if (hasAwaitingActionFrom(a)) {
    if (card === "active" && !hasUserPastDue(a)) return "active";
    if (hasUserAction(a)) return "in_progress";
    return "in_review";
  }

  // Fallback ohne awaiting_action_from: in_review nur bei keinen fälligen Einträgen.
  if (card === "active" && !hasPastDue(a)) return "active";
  if (hasCurrentlyDue(a) || hasPastDue(a)) return "in_progress";
  return "in_review";
}

export function mapRequirementsDueAt(a: StripeAccountSnapshot): string | null {
  const time = a.requirements?.summary?.minimum_deadline?.time;
  if (typeof time !== "string" || time.trim() === "") return null;
  const ms = Date.parse(time);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

/** details_submitted abgeleitet: keine currently_due- und keine past_due-Einträge. */
export function mapDetailsSubmitted(a: StripeAccountSnapshot): boolean {
  return !hasCurrentlyDue(a) && !hasPastDue(a);
}

export function mapStripeAccount(a: StripeAccountSnapshot, livemode: boolean): ProviderAccountState {
  const card = mapCardCapability(a);
  const payouts =
    a.configuration?.merchant?.capabilities?.stripe_balance?.payouts?.status === "active";
  return {
    ref: a.id,
    livemode,
    status: mapOnboardingStatus(a),
    chargesEnabled: card === "active",
    payoutsEnabled: payouts,
    detailsSubmitted: mapDetailsSubmitted(a),
    requirementsPending: hasCurrentlyDue(a) || hasPastDue(a),
    requirementsDueAt: mapRequirementsDueAt(a),
    capabilities: { card },
  };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Prüft eine API-Antwort (unknown) auf die Form eines v2-Kontos. */
export function parseAccountSnapshot(value: unknown): StripeAccountSnapshot | null {
  if (!isPlainObject(value)) return null;
  if (value.object !== undefined && value.object !== "v2.core.account") return null;
  if (typeof value.id !== "string" || !value.id.startsWith("acct_")) return null;
  return value as unknown as StripeAccountSnapshot;
}
