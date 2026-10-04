/** ZW-1: Texte für Ein-Tipp-Buchung und „Anders bezahlen“. */

export type BookingMethodKind = 'pass' | 'online' | 'onsite';

/** Gleichlautend zu legalCheckoutTexts (B1 K4) — hier lokal für Node-Unit-Tests. */
const CONTINUE_DESKTOP = 'Weiter zur Buchung';
const CONTINUE_MOBILE = 'Zur Buchung';

/** Zeile unter dem Preis / in der Mobil-Leiste. */
export function bookingMethodLine(
  method: BookingMethodKind,
  passOption?: { label?: string | null } | null,
): string {
  if (method === 'pass') {
    const label = passOption?.label?.trim() || 'Karte';
    return `✓ Mit deiner ${label}`;
  }
  if (method === 'online') return 'Online bezahlen';
  return 'Du bezahlst vor Ort';
}

/** Primärknopf: pass → Mit …-Karte buchen; online/onsite → Zur Buchung. */
export function bookingPrimaryLabel(
  method: BookingMethodKind,
  opts?: { desktop?: boolean; passLabel?: string | null },
): string {
  if (method === 'pass') return passBookButtonLabel(opts?.passLabel);
  if (opts?.desktop) return CONTINUE_DESKTOP;
  return CONTINUE_MOBILE;
}

export function passBookButtonLabel(passLabel?: string | null): string {
  const raw = passLabel?.trim() ?? '';
  // „10er-Karte · noch 7“ → „Mit 10er-Karte buchen“
  const name = raw.split('·')[0]?.trim() || 'Karte';
  if (/karte/i.test(name)) return `Mit ${name} buchen`;
  return `Mit ${name}-Karte buchen`;
}

export function altPayLabel(): string {
  return 'Anders bezahlen';
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
