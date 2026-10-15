/** Zentrale Texte für Online-Zahlung (2.2b). */

export const PAYMENT_SHEET_TITLE = 'Buchung abschließen';

/** Kurze Hold-Pille im Checkout-Kopf (UX-2 A4). */
export function paymentHoldPill(timeHm: string): string {
  return `Platz reserviert bis ${timeHm}`;
}

export const PAY_NOW_LABEL = 'Jetzt bezahlen';

/** UX-4 B2: freundlicher Hinweis ohne Schloss. */
export const ONLINE_REQUIRED_HINT = 'Du bezahlst direkt bei der Buchung';

/** Mobil Aktionsleiste, Zeile 2 (UX-4 N3). */
export const ONLINE_REQUIRED_HINT_SHORT = 'Bezahlung direkt bei der Buchung';

export const REGISTER_AND_PAY_LABEL = 'Anmelden und bezahlen';

/** `formattedAmount` z. B. aus formatCents — „24,00 € bezahlen“. */
export function payAmountLabel(formattedAmount: string): string {
  const amount = formattedAmount.trim();
  return amount ? `${amount} bezahlen` : 'Bezahlen';
}

export function paymentSecureHint(studioName: string): string {
  const name = studioName.trim() || 'dein Studio';
  return `Sichere Zahlung über Stripe. Das Geld geht direkt an ${name}.`;
}

/** Kurzer Stripe-Hinweis unter dem Buchungsknopf. */
export const PAYMENT_SECURE_SHORT = 'Sicher bezahlt über Stripe';

export function paymentHoldHint(timeHm: string, minutesLeft: number): string {
  const n = Math.max(0, Math.floor(minutesLeft));
  return `Dein Platz ist bis ${timeHm} Uhr reserviert (noch ${n} Min.).`;
}

export const PAYMENT_PROCESSING = 'Zahlung wird geprüft …';

export const PAYMENT_SUBMITTING = 'Zahlung läuft …';

export const PAYMENT_PROCESSING_TIMEOUT =
  'Wir melden uns per E-Mail, sobald die Zahlung bestätigt ist';

/** UX-4 B3 */
export const PAYMENT_SUCCESS_HEADLINE = 'Du bist dabei!';

export const PAYMENT_EMAIL_HINT = 'Bestätigung und Beleg kommen per E-Mail.';

export const PAYMENT_SUCCESS =
  'Du bist dabei! Bestätigung und Beleg kommen per E-Mail.';

export const PAYMENT_DONE_LABEL = 'Fertig';

export const PAYMENT_CALENDAR_LABEL = 'In Kalender eintragen';

export const PAYMENT_RECEIPT_LINK_LABEL = 'Beleg ansehen';

/** Eine Zeile unter der Erfolgsüberschrift: „Titel · Sa, 31. Okt · 10:30“. */
export function paymentSuccessSummaryLine(
  title: string | null | undefined,
  when: string | null | undefined,
): string {
  const t = title?.trim() ?? '';
  const w = when?.trim() ?? '';
  if (t && w) return `${t} · ${w}`;
  return t || w;
}

export const PAYMENT_ACK_LABEL = 'Verstanden';

export const PAYMENT_TO_COURSE_LABEL = 'Zum Kurs';

export const PAYMENT_RETRY_LABEL = 'Erneut bezahlen';

export const PAYMENT_CLOSE_LABEL = 'Schließen';

export const PAYMENT_REFUND_REQUIRED =
  'Zahlung eingegangen, aber der Platz war inzwischen vergeben. Du bekommst den Betrag automatisch zurück.';

export const PAYMENT_HOLD_EXPIRED =
  'Die Reservierung ist abgelaufen. Der Platz ist wieder frei – melde dich neu an, falls noch Plätze da sind.';

export const PAYMENT_CARD_DECLINED =
  'Die Zahlung wurde abgelehnt. Bitte prüfe die Angaben oder nimm eine andere Kreditkarte.';

export const PAYMENT_AUTH_FAILED =
  'Die Bestätigung bei deiner Bank hat nicht geklappt. Bitte versuch es noch einmal.';

export const PAYMENT_PROVIDER_UNAVAILABLE =
  'Der Zahlungsdienst ist gerade nicht erreichbar. Bitte versuch es gleich noch einmal.';

export const PAYMENT_ONLINE_DISABLED =
  'Online-Zahlung ist bei diesem Studio gerade nicht möglich. Bitte wende dich an das Studio.';

export const PAYMENT_NOT_PENDING =
  'Für diese Anmeldung ist keine Zahlung mehr offen.';

export const PAYMENT_GENERIC_ERROR =
  'Das hat nicht geklappt. Bitte lade die Seite neu.';

/** Text zu Browser-/Geschäftscode (prepare/confirm/status). */
export function paymentMessageForCode(code: string | null | undefined): string {
  switch (code) {
    case 'COMPLETED':
    case 'ALREADY_COMPLETED':
    case 'RESTORED':
      return PAYMENT_SUCCESS;
    case 'REFUND_REQUIRED':
      return PAYMENT_REFUND_REQUIRED;
    case 'HOLD_EXPIRED':
      return PAYMENT_HOLD_EXPIRED;
    case 'CARD_DECLINED':
      return PAYMENT_CARD_DECLINED;
    case 'AUTHENTICATION_REQUIRED':
      return PAYMENT_AUTH_FAILED;
    case 'PROVIDER_UNAVAILABLE':
      return PAYMENT_PROVIDER_UNAVAILABLE;
    case 'ONLINE_DISABLED':
      return PAYMENT_ONLINE_DISABLED;
    case 'NOT_PENDING':
      return PAYMENT_NOT_PENDING;
    case 'PROCESSING_TIMEOUT':
      return PAYMENT_PROCESSING_TIMEOUT;
    case 'FORBIDDEN':
    case 'INVALID_REQUEST':
      return PAYMENT_GENERIC_ERROR;
    default:
      return PAYMENT_GENERIC_ERROR;
  }
}
