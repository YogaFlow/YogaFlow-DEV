/** ZW-1 / N1: Texte für Zahlart-Zeile und Primärknopf. */

export type BookingMethodKind = 'pass' | 'online' | 'onsite';

/** Primärknopf je Zahlart (Desktop und Mobil gleich). */
export const BOOK_PRIMARY_PASS = 'Mit 10er-Karte buchen';
export const BOOK_PRIMARY_ONLINE = 'Weiter zur Zahlung';
export const BOOK_PRIMARY_ONSITE = 'Weiter zur Buchung';

export const ONLINE_PAY_HINT_LINE = 'Du kannst jetzt direkt online bezahlen.';
/** Z8: wenn Vor Ort Standard ist — Tipp wechselt auf Online. */
export const ONLINE_PAY_HINT_SWITCH_LINE = 'Neu: Du kannst jetzt auch online bezahlen ›';
export const CHANGE_PAY_METHOD_LABEL = 'Ändern';

export type OnlinePayHintUi = {
  showBadge: boolean;
  hintLine: string | null;
  /** Hinweiszeile tippbar → Auswahl Online, nichts gebucht. */
  hintSwitchesToOnline: boolean;
};

/**
 * Z8: Hinweis-UI für Online-Standard / Vor-Ort-Standard × gesehen ja/nein.
 * `showOnlinePayHint` kommt von `booking_payment_options` (serverseitig).
 */
export function onlinePayHintUi(opts: {
  showOnlinePayHint: boolean;
  activeMethod: BookingMethodKind;
}): OnlinePayHintUi {
  if (!opts.showOnlinePayHint) {
    return { showBadge: false, hintLine: null, hintSwitchesToOnline: false };
  }
  if (opts.activeMethod === 'online') {
    return {
      showBadge: true,
      hintLine: ONLINE_PAY_HINT_LINE,
      hintSwitchesToOnline: false,
    };
  }
  if (opts.activeMethod === 'onsite') {
    return {
      showBadge: true,
      hintLine: ONLINE_PAY_HINT_SWITCH_LINE,
      hintSwitchesToOnline: true,
    };
  }
  return { showBadge: false, hintLine: null, hintSwitchesToOnline: false };
}

/** Titel der Zahlart-Zeile (ohne Detail / Ändern). */
export function bookingMethodTitle(
  method: BookingMethodKind,
  passOption?: { label?: string | null } | null,
): string {
  if (method === 'pass') {
    const label = passOption?.label?.trim() || 'Kurskarte';
    // „10er-Karte · noch 7“ bleibt als Zeilentitel
    return label;
  }
  if (method === 'online') return 'Online bezahlen';
  return 'Vor Ort bezahlen';
}

/** Kurzdetail hinter dem Titel (vor „Ändern“). */
export function bookingMethodDetail(method: BookingMethodKind): string | null {
  if (method === 'pass') return null;
  if (method === 'online') return 'Kreditkarte, Apple Pay, Google Pay';
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
  const name = raw.split('·')[0]?.trim() || 'Kurskarte';
  if (/karte/i.test(name)) return `Mit ${name} buchen`;
  return `Mit ${name}-Karte buchen`;
}

/** @deprecated N1: durch Zahlart-Zeile mit „Ändern ›“ ersetzt */
export function altPayLabel(): string {
  return CHANGE_PAY_METHOD_LABEL;
}

export function methodChoiceTitle(method: BookingMethodKind): string {
  if (method === 'pass') return 'Mit Kurskarte';
  if (method === 'online') return 'Online bezahlen';
  return 'Vor Ort bezahlen';
}

export function methodChoiceHint(method: BookingMethodKind): string {
  if (method === 'pass') return 'Guthaben von deiner Kurskarte';
  if (method === 'online') return 'Kreditkarte, Apple Pay oder Google Pay';
  return 'Bar, PayPal oder Überweisung vor Ort';
}
