/**
 * UX-10 — Zusammenfassung und Beruhigungszeile im Kurs-/Kurskarten-Checkout.
 */

export const COURSE_CANCEL_REASSURANCE_EXPIRED =
  'Die kostenlose Abmeldefrist ist vorbei.';

export const PASS_CHECKOUT_REASSURANCE =
  'Gilt für alle Kurse mit dem Hinweis „mit Kurskarte buchbar“';

export const PAYMENT_HOW_TO_PAY = 'Wie möchtest du bezahlen?';

/** Unter der Zahlarten-Überschrift, mit Schloss. */
export const PAYMENT_SECURE_CARD_HINT =
  'Sichere Zahlung über Stripe. Deine Kartendaten sehen wir nicht.';

/** Meta-Zeile: Wann · Ort · mit Lehrerin. */
export function courseCheckoutMetaLine(input: {
  whenLabel: string;
  place?: string | null;
  teacher?: string | null;
}): string {
  const parts: string[] = [];
  const when = input.whenLabel.trim();
  if (when) parts.push(when);
  const place = input.place?.trim();
  if (place) parts.push(place);
  const teacher = input.teacher?.trim();
  if (teacher) parts.push(`mit ${teacher}`);
  return parts.join(' · ');
}

/**
 * Beruhigungszeile Abmeldefrist.
 * `deadlineLabel` gesetzt = Frist noch in der Zukunft (bereits formatiert).
 */
export function courseCancelReassurance(deadlineLabel: string | null | undefined): {
  text: string;
  withCheck: boolean;
} {
  const label = deadlineLabel?.trim();
  if (label) {
    return { text: `Kostenlos abmelden bis ${label}`, withCheck: true };
  }
  return { text: COURSE_CANCEL_REASSURANCE_EXPIRED, withCheck: false };
}
