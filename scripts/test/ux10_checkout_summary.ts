/**
 * UX-10 — Unit: Checkout-Zusammenfassung (Frist künftig/vorbei) und Kurskarten-Beruhigung.
 */
import assert from 'node:assert/strict';
import {
  COURSE_CANCEL_REASSURANCE_EXPIRED,
  PASS_CHECKOUT_REASSURANCE,
  PAYMENT_HOW_TO_PAY,
  PAYMENT_SECURE_CARD_HINT,
  courseCancelReassurance,
  courseCheckoutMetaLine,
} from '../../src/lib/checkoutSummaryTexts.ts';
import { PAYMENT_SUBMITTING } from '../../src/lib/paymentTexts.ts';

{
  assert.equal(
    courseCheckoutMetaLine({
      whenLabel: 'Di, 7. Okt · 18:00–19:15',
      place: 'Studio Neuss',
      teacher: 'Lena',
    }),
    'Di, 7. Okt · 18:00–19:15 · Studio Neuss · mit Lena',
  );
  assert.equal(
    courseCheckoutMetaLine({ whenLabel: 'Di, 7. Okt · 18:00–19:15' }),
    'Di, 7. Okt · 18:00–19:15',
  );
  console.log('  ok Meta-Zeile');
}

{
  const ok = courseCancelReassurance('Mo, 6. Okt, 18:00');
  assert.equal(ok.withCheck, true);
  assert.equal(ok.text, 'Kostenlos abmelden bis Mo, 6. Okt, 18:00');
  const past = courseCancelReassurance(null);
  assert.equal(past.withCheck, false);
  assert.equal(past.text, COURSE_CANCEL_REASSURANCE_EXPIRED);
  assert.equal(past.text, 'Die kostenlose Abmeldefrist ist vorbei.');
  console.log('  ok Abmeldefrist Beruhigung');
}

{
  assert.match(PASS_CHECKOUT_REASSURANCE, /mit Kurskarte buchbar/);
  assert.doesNotMatch(PASS_CHECKOUT_REASSURANCE, /Abo|Mehrfachkarte/);
  console.log('  ok Kurskarte Beruhigung');
}

{
  assert.equal(PAYMENT_HOW_TO_PAY, 'Wie möchtest du bezahlen?');
  assert.match(PAYMENT_SECURE_CARD_HINT, /Kartendaten sehen wir nicht/);
  assert.equal(PAYMENT_SUBMITTING, 'Zahlung läuft …');
  console.log('  ok Zahlarten- und Knopftexte');
}

console.log('ux10_checkout_summary OK');
