/**
 * Unit-Test Stripe-Gebührenschätzung (FS-1).
 *
 *   node --experimental-strip-types --test scripts/test/stripe_fee.ts
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  estimateStripeFeeCents,
  estimateStripeFeeCentsForPayments,
} from '../../src/lib/stripeFee.ts';
import {
  refundStripeFeeHint,
  refundStripeFeeHintMulti,
} from '../../src/lib/refundTexts.ts';
import { FEES_BODY_TEXT } from '../../src/features/payments/paymentSetupCopy.ts';

const n = (s: string | null | undefined) => (s ?? '').replace(/\u00A0/g, ' ');

test('15,00 € → 0,48 €', () => {
  assert.equal(estimateStripeFeeCents(1500), 48);
});

test('1,00 € → 0,27 €', () => {
  assert.equal(estimateStripeFeeCents(100), 27);
});

test('8 × 15 € → 3,84 €', () => {
  assert.equal(estimateStripeFeeCentsForPayments(8, 8 * 1500), 384);
});

test('Teilerstattung: Gebühr der Originalzahlung', () => {
  assert.equal(estimateStripeFeeCents(1500), 48);
  assert.match(
    n(refundStripeFeeHint(1500)),
    /ca\. 0,48 €/,
  );
});

test('Hinweis Einzelzahlung', () => {
  assert.equal(
    n(refundStripeFeeHint(1500)),
    'Stripe behält die Gebühr der ursprünglichen Zahlung auch bei einer Erstattung. Bei dieser Zahlung sind das ca. 0,48 €.',
  );
});

test('Hinweis bekannte Gebühr ohne ca.', () => {
  assert.equal(
    n(refundStripeFeeHint(1500, 48)),
    'Stripe behält die Gebühr der ursprünglichen Zahlung auch bei einer Erstattung. Bei dieser Zahlung sind das 0,48 €.',
  );
});

test('Hinweis Mehrfach', () => {
  assert.equal(
    n(refundStripeFeeHintMulti(8, 8 * 1500)),
    'Stripe behält die Gebühr der ursprünglichen Zahlung auch bei einer Erstattung. Bei 8 Online-Zahlungen sind das zusammen ca. 3,84 €.',
  );
});

test('Kosten-Text B (Zahlungsseite)', () => {
  assert.equal(
    FEES_BODY_TEXT,
    'Zahlung mit Kreditkarte, Apple Pay oder Google Pay: ab 1,5 % + 0,25 € je Zahlung. ' +
      'Beispiel 15 €: 1,5 % × 15 € = 0,225 € + 0,25 € = 0,475 €, also rund 0,48 €. ' +
      'Die Gebühr zahlt dein Studio direkt an Stripe. Omlify verlangt nichts zusätzlich. ' +
      'Bei einer Erstattung behält Stripe die Gebühr. Stand 10/2026, Stripe-Listenpreis.',
  );
  assert.match(FEES_BODY_TEXT, /ab 1,5 % \+ 0,25 €/);
  assert.equal(FEES_BODY_TEXT.includes('Firmenkarten'), false);
  assert.equal(FEES_BODY_TEXT.includes('Standardkarten aus dem EWR'), false);
});
