/**
 * B1 Unit: K5/K6/K8/K9-Texte.
 *   node --experimental-strip-types --test scripts/test/legal_checkout_texts.ts
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BINDING_BOOK_LABEL,
  CANCEL_NO_LONGER,
  CONTINUE_TO_BOOKING_LABEL,
  WITHDRAWAL_NOTICE,
  cancelRuleLine,
  cancelRuleLineCompact,
  checkoutPriceLine,
  checkoutTaxLineAlone,
  WITHDRAWAL_NOTICE_COMPACT,
  confirmationSubject,
  formatLegalCents,
  displayReceiptTaxText,
  RECEIPT_TAX_SMALL_BUSINESS_FULL,
  receiptServiceText,
  receiptTaxLine,
  refundReceiptHeading,
  studioFromName,
} from '../../src/lib/legalCheckoutTexts.ts';

test('Knöpfe K4', () => {
  assert.equal(CONTINUE_TO_BOOKING_LABEL, 'Weiter zur Buchung');
  assert.equal(BINDING_BOOK_LABEL, 'Zahlungspflichtig buchen');
});

test('Preis K5 je Steuerregime', () => {
  assert.equal(checkoutPriceLine(2400, 'regular', 1900), '24,00 € inkl. 19 % USt');
  assert.equal(checkoutPriceLine(2400, 'regular', 700), '24,00 € inkl. 7 % USt');
  assert.equal(checkoutPriceLine(2400, 'small_business', 0), '24,00 € · gemäß § 19 UStG ohne USt');
});

test('Belegsteuer K8 / Anzeige N5', () => {
  assert.equal(receiptTaxLine('regular', 1900), 'enthält 19 % USt');
  assert.equal(receiptTaxLine('regular', 700), 'enthält 7 % USt');
  assert.equal(receiptTaxLine('small_business', 0), 'gemäß § 19 UStG ohne USt');
  assert.equal(
    displayReceiptTaxText('small_business', 'gemäß § 19 UStG ohne USt'),
    RECEIPT_TAX_SMALL_BUSINESS_FULL,
  );
  assert.equal(
    displayReceiptTaxText(undefined, 'gemäß § 19 UStG ohne USt'),
    'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.',
  );
  assert.equal(displayReceiptTaxText('regular', 'enthält 19 % USt'), 'enthält 19 % USt');
});

test('Leistungstext K8', () => {
  assert.equal(
    receiptServiceText('Yin Yoga', '2026-10-05', '18:00:00'),
    'Yogakurs ‚Yin Yoga‘ am 05.10.2026 18:00',
  );
});

test('Abmelderegel K5 Frist / vorbei', () => {
  assert.equal(
    cancelRuleLine('Fr, 3. Okt, 18:00'),
    'Kostenlos abmelden bis Fr, 3. Okt, 18:00 – du bekommst den vollen Betrag zurück. Danach keine Erstattung.',
  );
  assert.equal(cancelRuleLine(null), CANCEL_NO_LONGER);
  assert.equal(cancelRuleLine(''), CANCEL_NO_LONGER);
});

test('UX-2 A4 Abmelde kompakt + Steuerfuß', () => {
  assert.equal(cancelRuleLineCompact('Fr, 3. Okt, 18:00'), 'Kostenlos abmelden bis Fr, 3. Okt, 18:00');
  assert.equal(
    cancelRuleLineCompact(null),
    'Keine Erstattung bei Abmeldung (Frist vorbei)',
  );
  assert.equal(checkoutTaxLineAlone('small_business', 0), 'gemäß § 19 UStG ohne USt');
  assert.equal(checkoutTaxLineAlone('regular', 1900), 'inkl. 19 % USt');
  assert.equal(checkoutTaxLineAlone('regular', 700), 'inkl. 7 % USt');
  assert.match(WITHDRAWAL_NOTICE_COMPACT, /Widerrufsrecht/);
});

test('Widerruf K5', () => {
  assert.match(WITHDRAWAL_NOTICE, /§ 312g Abs\. 2 Nr\. 9 BGB/);
});

test('Bestätigung K6 / Erstattungsbeleg K9 / Absender K7', () => {
  assert.equal(
    confirmationSubject('Yin Yoga', '05.10.2026'),
    'Buchungsbestätigung: Yin Yoga am 05.10.2026',
  );
  assert.equal(refundReceiptHeading('2026-00001'), 'Erstattungsbeleg zu Beleg 2026-00001');
  assert.equal(studioFromName('Yoga Mitte'), 'Yoga Mitte über Omlify');
  assert.equal(formatLegalCents(-1000), '−10,00 €');
});
