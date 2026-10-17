/**
 * Stripe-Kartengebühr (Listenpreis Standard EWR): 1,5 % + 0,25 €.
 * Tatsächliche Balance-Transaction-Gebühr speichern wir noch nicht (→ 1b).
 */

/** Anteil in Prozent. Stand 10/2026, Stripe-Listenpreis. */
export const STRIPE_CARD_FEE_PERCENT = 1.5;
/** Fester Anteil in Cent. Stand 10/2026, Stripe-Listenpreis. */
export const STRIPE_CARD_FEE_FIXED_CENTS = 25;

/** Geschätzte Stripe-Gebühr in Cent, auf den nächsten Cent gerundet. */
export function estimateStripeFeeCents(amountCents: number): number {
  if (!Number.isFinite(amountCents) || amountCents <= 0) return 0;
  return Math.round(amountCents * (STRIPE_CARD_FEE_PERCENT / 100) + STRIPE_CARD_FEE_FIXED_CENTS);
}

/**
 * Summe der geschätzten Gebühren für mehrere Online-Zahlungen.
 * Ohne Einzelbeträge: Mittelwert aus Gesamterstattung ÷ Anzahl.
 */
export function estimateStripeFeeCentsForPayments(
  paidCount: number,
  totalAmountCents: number,
): number {
  if (paidCount <= 0 || totalAmountCents <= 0) return 0;
  if (paidCount === 1) return estimateStripeFeeCents(totalAmountCents);
  const avg = Math.round(totalAmountCents / paidCount);
  return paidCount * estimateStripeFeeCents(avg);
}
