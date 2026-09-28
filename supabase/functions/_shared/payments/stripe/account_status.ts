/**
 * Reine Abbildung eines Stripe-Kontos auf ProviderAccountState. Ohne SDK-Import,
 * damit Fixtures und Webhook-Nutzlast (unknown) dieselbe Form durchlaufen.
 */
import type { CapabilityStatus, OnboardingStatus, ProviderAccountState } from "../port.ts";

/** Die Felder von Stripe.Account (v1), die die Abbildung liest. */
export interface StripeAccountSnapshot {
  id: string;
  details_submitted?: boolean | null;
  charges_enabled?: boolean | null;
  payouts_enabled?: boolean | null;
  requirements?: {
    currently_due?: string[] | null;
    past_due?: string[] | null;
    eventually_due?: string[] | null;
    /** Unix-Sekunden. */
    current_deadline?: number | null;
  } | null;
  capabilities?: {
    card_payments?: string | null;
  } | null;
}

function nonEmpty(list: string[] | null | undefined): boolean {
  return Array.isArray(list) && list.length > 0;
}

/**
 * Reihenfolge ist Teil der Regel:
 * 1. nicht eingereicht → in_progress
 * 2. charges_enabled und past_due leer → active (eventually_due und currently_due
 *    sperren nicht, solange Stripe Zahlungen zulässt)
 * 3. currently_due oder past_due gefüllt → action_required
 * 4. sonst → in_review
 */
export function mapOnboardingStatus(a: StripeAccountSnapshot): OnboardingStatus {
  if (a.details_submitted !== true) return "in_progress";
  const pastDue = nonEmpty(a.requirements?.past_due);
  if (a.charges_enabled === true && !pastDue) return "active";
  if (pastDue || nonEmpty(a.requirements?.currently_due)) return "action_required";
  return "in_review";
}

export function mapCardCapability(a: StripeAccountSnapshot): CapabilityStatus {
  const raw = a.capabilities?.card_payments;
  if (raw === "active") return "active";
  if (raw === "pending") return "pending";
  return "inactive";
}

export function mapRequirementsDueAt(a: StripeAccountSnapshot): string | null {
  const deadline = a.requirements?.current_deadline;
  if (typeof deadline !== "number" || !Number.isFinite(deadline)) return null;
  return new Date(deadline * 1000).toISOString();
}

/** Das v1-Konto hat kein livemode-Feld; es kommt aus dem Schlüssel bzw. dem Event. */
export function mapStripeAccount(a: StripeAccountSnapshot, livemode: boolean): ProviderAccountState {
  return {
    ref: a.id,
    livemode,
    status: mapOnboardingStatus(a),
    chargesEnabled: a.charges_enabled === true,
    payoutsEnabled: a.payouts_enabled === true,
    detailsSubmitted: a.details_submitted === true,
    requirementsPending: nonEmpty(a.requirements?.currently_due),
    requirementsDueAt: mapRequirementsDueAt(a),
    capabilities: { card: mapCardCapability(a) },
  };
}

function isStringArrayOrNull(v: unknown): boolean {
  return v === undefined || v === null || (Array.isArray(v) && v.every((x) => typeof x === "string"));
}

function isBoolOrNull(v: unknown): boolean {
  return v === undefined || v === null || typeof v === "boolean";
}

/** Prüft eine Webhook-Nutzlast (unknown) auf die Form eines Kontos. */
export function parseAccountSnapshot(value: unknown): StripeAccountSnapshot | null {
  if (typeof value !== "object" || value === null) return null;
  const o = value as Record<string, unknown>;
  if (o.object !== undefined && o.object !== "account") return null;
  if (typeof o.id !== "string" || !o.id.startsWith("acct_")) return null;
  if (!isBoolOrNull(o.details_submitted) || !isBoolOrNull(o.charges_enabled) || !isBoolOrNull(o.payouts_enabled)) {
    return null;
  }

  const req = o.requirements;
  if (req !== undefined && req !== null) {
    if (typeof req !== "object") return null;
    const r = req as Record<string, unknown>;
    if (!isStringArrayOrNull(r.currently_due) || !isStringArrayOrNull(r.past_due) || !isStringArrayOrNull(r.eventually_due)) {
      return null;
    }
    const deadline = r.current_deadline;
    if (deadline !== undefined && deadline !== null && (typeof deadline !== "number" || !Number.isFinite(deadline))) {
      return null;
    }
  }

  const caps = o.capabilities;
  if (caps !== undefined && caps !== null) {
    if (typeof caps !== "object") return null;
    const card = (caps as Record<string, unknown>).card_payments;
    if (card !== undefined && card !== null && typeof card !== "string") return null;
  }

  return o as unknown as StripeAccountSnapshot;
}
