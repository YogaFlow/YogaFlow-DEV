import { formatBerlinDateTime } from './courseDateTime';

/** Kurzlabel ohne Frist — Badge, Filter, coverageLabel. */
export const PAYMENT_PENDING_SHORT = 'Zahlung ausstehend';

/** Aktionslabel Meine Anmeldungen (S8). */
export const RELEASE_SEAT_LABEL = 'Platz freigeben';

/**
 * Zustandstext mit Frist. Frist immer über formatBerlinDateTime (Europe/Berlin).
 * Ohne gültige Frist: nur Kurzlabel.
 */
export function paymentPendingLabel(
  holdExpiresAt?: string | null,
): string {
  const until = formatBerlinDateTime(holdExpiresAt);
  return until
    ? `Zahlung ausstehend bis ${until}`
    : PAYMENT_PENDING_SHORT;
}
