/** B1 K4–K9: Kaufprozess-, Beleg- und Mail-Texte. Eine Quelle. */

export const CONTINUE_TO_BOOKING_LABEL = 'Weiter zur Buchung';

/** Mobil Aktionsleiste: kurz, damit der Knopf nie umbricht (UX-4 N3). */
export const CONTINUE_TO_BOOKING_LABEL_SHORT = 'Zur Buchung';

export const BINDING_BOOK_LABEL = 'Zahlungspflichtig buchen';

export const WITHDRAWAL_NOTICE =
  'Für Kurse mit festem Termin besteht kein Widerrufsrecht (§ 312g Abs. 2 Nr. 9 BGB).';

export const CANCEL_NO_LONGER = 'Eine kostenlose Abmeldung ist nicht mehr möglich.';

export const PRICE_ABOVE_LIMIT_HINT =
  'Über 250,00 € ist keine Online-Zahlung möglich – Teilnehmende zahlen vor Ort.';

export const LEGAL_PROFILE_ATTENTION =
  'Anbieterangaben fehlen – ohne sie ist keine Online-Zahlung möglich.';

export const RECEIPT_HEADING = 'Beleg';

export const RECEIPT_PRINT_LABEL = 'Drucken / als PDF speichern';

export const RECEIPT_LINK_LABEL = 'Beleg';

export const PAYMENT_METHOD_ONLINE = 'Kreditkarte (online)';

export const ONLINE_AMOUNT_LIMIT_CENTS = 25000;

/** UX-9: Steuerhinweis neben dem Betrag (Checkout / Kauf-Sheet). */
export const CHECKOUT_TAX_SMALL_BUSINESS = 'Endpreis · keine USt (§ 19 UStG)';

export type TaxRegime = 'regular' | 'small_business';

export function formatLegalCents(cents: number): string {
  const rounded = Math.round(cents);
  const sign = rounded < 0 ? '−' : '';
  const abs = Math.abs(rounded);
  const euros = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, '0');
  return `${sign}${euros},${rest} €`;
}

export function vatPercentFromBp(vatRateBp: number): number {
  return Math.round(vatRateBp / 100);
}

/** Betrag + Steuerhinweis in einer Zeile (Mails / ältere Aufrufer). */
export function checkoutPriceLine(
  amountCents: number,
  regime: TaxRegime,
  vatRateBp: number,
): string {
  const amount = formatLegalCents(Math.abs(amountCents));
  return `${amount} · ${checkoutTaxLineAlone(regime, vatRateBp)}`;
}

/** Voller Satz auf Belegseite und in der Bestätigungsmail (N5). */
export const RECEIPT_TAX_SMALL_BUSINESS_FULL =
  'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.';

/** Kurzform im Schnappschuss / K5-Checkout (K8). */
export const RECEIPT_TAX_SMALL_BUSINESS_SHORT = 'gemäß § 19 UStG ohne USt';

export function receiptTaxLine(regime: TaxRegime, vatRateBp: number): string {
  if (regime === 'small_business') return RECEIPT_TAX_SMALL_BUSINESS_SHORT;
  return `enthält ${vatPercentFromBp(vatRateBp)} % USt`;
}

/** Anzeige: nie die Kurzform aus dem Schnappschuss allein zeigen. */
export function displayReceiptTaxText(
  regime: string | null | undefined,
  taxText: string | null | undefined,
): string {
  if (
    regime === 'small_business' ||
    taxText === RECEIPT_TAX_SMALL_BUSINESS_SHORT ||
    taxText === RECEIPT_TAX_SMALL_BUSINESS_FULL
  ) {
    return RECEIPT_TAX_SMALL_BUSINESS_FULL;
  }
  return taxText?.trim() || '';
}

export function receiptServiceText(title: string, dateIso: string, time: string): string {
  const [y, m, d] = dateIso.split('-');
  const date = y && m && d ? `${d}.${m}.${y}` : dateIso;
  const hm = time.slice(0, 5);
  return `Yogakurs ‚${title}‘ am ${date} ${hm}`;
}

export function cancelRuleLine(deadlineLabel: string | null | undefined): string {
  if (!deadlineLabel) return CANCEL_NO_LONGER;
  return `Kostenlos abmelden bis ${deadlineLabel} – du bekommst den vollen Betrag zurück. Danach keine Erstattung.`;
}

/** Kompakt für Checkout-Fuß (UX-2 A4), max. kurz. */
export function cancelRuleLineCompact(deadlineLabel: string | null | undefined): string {
  if (!deadlineLabel) return 'Keine Erstattung bei Abmeldung (Frist vorbei)';
  return `Kostenlos abmelden bis ${deadlineLabel}`;
}

export const WITHDRAWAL_NOTICE_COMPACT =
  'Kein Widerrufsrecht bei festem Termin';

/** Steuerzeile allein (Fußbereich), ohne Betrag. UX-9: § 19 kurz neben dem Endpreis. */
export function checkoutTaxLineAlone(regime: TaxRegime, vatRateBp: number): string {
  if (regime === 'small_business') return CHECKOUT_TAX_SMALL_BUSINESS;
  return `inkl. ${vatPercentFromBp(vatRateBp)} % USt`;
}

export function confirmationSubject(courseTitle: string, dateLabel: string): string {
  return `Buchungsbestätigung: ${courseTitle} am ${dateLabel}`;
}

export function refundReceiptHeading(originalNumber: string): string {
  return `Erstattungsbeleg zu Beleg ${originalNumber}`;
}

export function studioFromName(studioName: string): string {
  const name = studioName.trim() || 'Studio';
  return `${name} über Omlify`;
}

export function providerCityLine(name: string, city: string): string {
  const n = name.trim();
  const c = city.trim();
  if (n && c) return `${n}, ${c}`;
  return n || c;
}

export function providerAddressBlock(input: {
  legalName: string;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  country?: string;
  contactEmail?: string | null;
  phone?: string | null;
}): string[] {
  const lines = [
    input.legalName.trim(),
    `${input.street.trim()} ${input.houseNumber.trim()}`.trim(),
    `${input.postalCode.trim()} ${input.city.trim()}`.trim(),
  ];
  if (input.country && input.country !== 'DE') lines.push(input.country);
  if (input.contactEmail?.trim()) lines.push(input.contactEmail.trim());
  if (input.phone?.trim()) lines.push(input.phone.trim());
  return lines.filter(Boolean);
}
