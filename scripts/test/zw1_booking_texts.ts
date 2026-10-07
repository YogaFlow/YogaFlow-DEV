/**
 * ZW-1 / N1 — Unit-Tests für Buchungstexte.
 * node --experimental-strip-types --test scripts/test/zw1_booking_texts.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BOOK_PRIMARY_ONLINE,
  BOOK_PRIMARY_ONSITE,
  CHANGE_PAY_METHOD_LABEL,
  ONLINE_PAY_HINT_LINE,
  ONLINE_PAY_HINT_SWITCH_LINE,
  bookingMethodDetail,
  bookingMethodLine,
  bookingMethodTitle,
  bookingPrimaryLabel,
  passBookButtonLabel,
} from '../../src/lib/bookingMethodTexts.ts';
import { BINDING_BOOK_LABEL } from '../../src/lib/legalCheckoutTexts.ts';

describe('ZW-1 N1 bookingMethodTexts', () => {
  it('pass Zeile und Knopf', () => {
    assert.equal(
      bookingMethodTitle('pass', { label: '10er-Karte · noch 7' }),
      '10er-Karte · noch 7',
    );
    assert.equal(
      bookingMethodLine('pass', { label: '10er-Karte · noch 7' }),
      '10er-Karte · noch 7',
    );
    assert.equal(passBookButtonLabel('10er-Karte · noch 7'), 'Mit 10er-Karte buchen');
    assert.equal(
      bookingPrimaryLabel('pass', { passLabel: '10er-Karte · noch 7' }),
      'Mit 10er-Karte buchen',
    );
  });

  it('online / onsite Zeile und Knöpfe', () => {
    assert.equal(bookingMethodTitle('online'), 'Online bezahlen');
    assert.equal(bookingMethodDetail('online'), 'Kreditkarte, Apple Pay, Google Pay');
    assert.equal(
      bookingMethodLine('online'),
      'Online bezahlen · Kreditkarte, Apple Pay, Google Pay',
    );
    assert.equal(bookingMethodTitle('onsite'), 'Vor Ort bezahlen');
    assert.equal(bookingMethodDetail('onsite'), 'im Studio');
    assert.equal(bookingMethodLine('onsite'), 'Vor Ort bezahlen · im Studio');
    assert.equal(bookingPrimaryLabel('online'), BOOK_PRIMARY_ONLINE);
    assert.equal(bookingPrimaryLabel('onsite'), BOOK_PRIMARY_ONSITE);
    assert.equal(BOOK_PRIMARY_ONLINE, 'Weiter zur Zahlung');
    assert.equal(BOOK_PRIMARY_ONSITE, 'Weiter zur Buchung');
  });

  it('Ändern-Label, Hinweis und Zahlungspflichtig', () => {
    assert.equal(CHANGE_PAY_METHOD_LABEL, 'Ändern');
    assert.equal(ONLINE_PAY_HINT_LINE, 'Du kannst jetzt direkt online bezahlen.');
    assert.equal(
      ONLINE_PAY_HINT_SWITCH_LINE,
      'Neu: Du kannst jetzt auch online bezahlen ›',
    );
    assert.equal(BINDING_BOOK_LABEL, 'Zahlungspflichtig buchen');
  });
});
