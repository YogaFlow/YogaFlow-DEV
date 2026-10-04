/** ZW-1 / N1: Texte für Zahlart-Zeile und Primärknopf. */

export type BookingMethodKind = 'pass' | 'online' | 'onsite';

/** Primärknopf je Zahlart (Desktop und Mobil gleich). */
export const BOOK_PRIMARY_PASS = 'Mit 10er-Karte buchen';
export const BOOK_PRIMARY_ONLINE = 'Weiter zur Zahlung';
export const BOOK_PRIMARY_ONSITE = 'Weiter zur Buchung';

export const ONLINE_PAY_HINT_LINE = 'Du kannst jetzt direkt online bezahlen.';
export const CHANGE_PAY_METHOD_LABEL = 'Ändern';

/** Titel der Zahlart-Zeile (ohne Detail / Ändern). */
export function bookingMethodTitle(
  method: BookingMethodKind,
  passOption?: { label?: string | null } | null,
): string {
  if (method === 'pass') {
    const label = passOption?.label?.trim() || 'Karte';
    // „10er-Karte · noch 7“ bleibt als Zeilentitel
    return label;
  }
  if (method === 'online') return 'Online bezahlen';
  return 'Vor Ort bezahlen';
}

/** Kurzdetail hinter dem Titel (vor „Ändern“). */
export function bookingMethodDetail(method: BookingMethodKind): string | null {
  if (method === 'pass') return null;
  if (method === 'online') return 'Karte, Apple Pay';
  return 'im Studio';
}

/**
 * Komplette sichtbare Zeile (für Tests / Screenreader).
 * Pass: „10er-Karte · noch 7“; Online/Vor Ort mit Detail.
 */
export function bookingMethodLine(
  method: BookingMethodKind,
  passOption?: { label?: string | null } | null,
): string {
  const title = bookingMethodTitle(method, passOption);
  const detail = bookingMethodDetail(method);
  return detail ? `${title} · ${detail}` : title;
}

/** Primärknopf: pass → Mit …-Karte buchen; online → Zahlung; onsite → Buchung. */
export function bookingPrimaryLabel(
  method: BookingMethodKind,
  opts?: { passLabel?: string | null },
): string {
  if (method === 'pass') return passBookButtonLabel(opts?.passLabel);
  if (method === 'online') return BOOK_PRIMARY_ONLINE;
  return BOOK_PRIMARY_ONSITE;
}

export function passBookButtonLabel(passLabel?: string | null): string {
  const raw = passLabel?.trim() ?? '';
  // „10er-Karte · noch 7“ → „Mit 10er-Karte buchen“
  const name = raw.split('·')[0]?.trim() || 'Karte';
  if (/karte/i.test(name)) return `Mit ${name} buchen`;
  return `Mit ${name}-Karte buchen`;
}

/** @deprecated N1: durch Zahlart-Zeile mit „Ändern ›“ ersetzt */
export function altPayLabel(): string {
  return CHANGE_PAY_METHOD_LABEL;
}

export function methodChoiceTitle(method: BookingMethodKind): string {
  if (method === 'pass') return 'Mit Karte';
  if (method === 'online') return 'Online bezahlen';
  return 'Vor Ort bezahlen';
}

export function methodChoiceHint(method: BookingMethodKind): string {
  if (method === 'pass') return 'Guthaben von deiner Karte';
  if (method === 'online') return 'Karte, Apple Pay oder Google Pay';
  return 'Bar, PayPal oder Überweisung vor Ort';
}
