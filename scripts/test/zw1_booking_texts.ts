/**
 * ZW-1 — Unit-Tests für Buchungstexte.
 * node --experimental-strip-types --test scripts/test/zw1_booking_texts.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  altPayLabel,
  bookingMethodLine,
  bookingPrimaryLabel,
  passBookButtonLabel,
} from '../../src/lib/bookingMethodTexts.ts';
import { BINDING_BOOK_LABEL } from '../../src/lib/legalCheckoutTexts.ts';

describe('ZW-1 bookingMethodTexts', () => {
  it('pass Zeile und Knopf', () => {
    assert.equal(
      bookingMethodLine('pass', { method: 'pass', label: '10er-Karte · noch 7' }),
      '✓ Mit deiner 10er-Karte · noch 7',
    );
    assert.equal(passBookButtonLabel('10er-Karte · noch 7'), 'Mit 10er-Karte buchen');
    assert.equal(
      bookingPrimaryLabel('pass', { passLabel: '10er-Karte · noch 7' }),
      'Mit 10er-Karte buchen',
    );
  });

  it('online / onsite Knöpfe', () => {
    assert.equal(bookingMethodLine('online'), 'Online bezahlen');
    assert.equal(bookingMethodLine('onsite'), 'Du bezahlst vor Ort');
    assert.equal(bookingPrimaryLabel('online', { desktop: true }), 'Weiter zur Buchung');
    assert.equal(bookingPrimaryLabel('online', { desktop: false }), 'Zur Buchung');
    assert.equal(bookingPrimaryLabel('onsite', { desktop: false }), 'Zur Buchung');
  });

  it('Anders bezahlen und Zahlungspflichtig', () => {
    assert.equal(altPayLabel(), 'Anders bezahlen');
    assert.equal(BINDING_BOOK_LABEL, 'Zahlungspflichtig buchen');
  });
});
