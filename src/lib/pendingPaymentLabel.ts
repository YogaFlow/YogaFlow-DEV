import { formatBerlinDateTime } from './courseDateTime';

/** Kurzlabel ohne Frist — Badge, Filter, coverageLabel. */
export const PAYMENT_PENDING_SHORT = 'Zahlung ausstehend';

/** Aktionslabel Meine Anmeldungen (S8). */
export const RELEASE_SEAT_LABEL = 'Platz freigeben';

/**
 * Nur die Fristzeile, z. B. „bis Mi., 01.10., 16:00 Uhr“.
 * Leer, wenn kein gültiger Zeitstempel.
 */
export function paymentPendingDeadlinePhrase(
  holdExpiresAt?: string | null,
): string {
  const until = formatBerlinDateTime(holdExpiresAt);
  return until ? `bis ${until}` : '';
}

/**
 * Zustandstext mit Frist. Frist immer über formatBerlinDateTime (Europe/Berlin).
 * Ohne gültige Frist: nur Kurzlabel.
 */
export function paymentPendingLabel(
  holdExpiresAt?: string | null,
): string {
  const phrase = paymentPendingDeadlinePhrase(holdExpiresAt);
  return phrase
    ? `${PAYMENT_PENDING_SHORT} ${phrase}`
    : PAYMENT_PENDING_SHORT;
}
