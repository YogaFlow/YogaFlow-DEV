/** B1 K4–K9: Kaufprozess-, Beleg- und Mail-Texte. Eine Quelle. */

export const CONTINUE_TO_BOOKING_LABEL = 'Weiter zur Buchung';

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

export const PAYMENT_METHOD_ONLINE = 'Karte (online)';

export const ONLINE_AMOUNT_LIMIT_CENTS = 25000;

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

export function checkoutPriceLine(
  amountCents: number,
  regime: TaxRegime,
  vatRateBp: number,
): string {
  const amount = formatLegalCents(Math.abs(amountCents));
  if (regime === 'small_business') {
    return `${amount} · gemäß § 19 UStG ohne USt`;
  }
  return `${amount} inkl. ${vatPercentFromBp(vatRateBp)} % USt`;
}

export function receiptTaxLine(regime: TaxRegime, vatRateBp: number): string {
  if (regime === 'small_business') return 'gemäß § 19 UStG ohne USt';
  return `enthält ${vatPercentFromBp(vatRateBp)} % USt`;
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
