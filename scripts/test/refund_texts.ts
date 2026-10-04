/**
 * Unit-Test Erstattungstexte (Story 3.2c).
 *
 * Verwendung:
 *   node --experimental-strip-types --test scripts/test/refund_texts.ts
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  centsToRefundInput,
  courseCancelRefundDone,
  courseCancelRefundLine,
  isCancelledEnrollmentVisible,
  memberRemovalRefundLine,
  onlinePaidStatusLine,
  onlineRefundInfo,
  refundErrorMessage,
  refundFormError,
  refundInputToCents,
  refundProgress,
  refundReasonLabel,
  refundSummary,
  staffUnregisterRefundLine,
  unregisterOnlineDialogMessage,
  unregisterRefundSuccessMessage,
  type RegistrationRefundState,
} from '../../src/lib/refundTexts.ts';

/** Anzeige nutzt geschütztes Leerzeichen vor €; für Vergleiche normalisieren. */
const n = (s: string | null | undefined) => (s ?? '').replace(/\u00A0/g, ' ');

const DEADLINE = '2026-10-03T16:00:00Z'; // Fr, 03.10., 18:00 Berlin
const BEFORE = Date.parse('2026-10-02T10:00:00Z');
const AFTER = Date.parse('2026-10-04T10:00:00Z');

function state(over: Partial<RegistrationRefundState> = {}): RegistrationRefundState {
  return {
    registration_id: 'r1',
    payment_id: 'p1',
    payment_cents: 2400,
    refundable_cents: 2400,
    refunded_cents: 0,
    pending_cents: 0,
    failed: false,
    ...over,
  };
}

test('Frist vor: Dialog und Statuszeile', () => {
  const info = onlineRefundInfo({ cancellation_deadline: DEADLINE }, state(), BEFORE);
  assert.ok(info?.refundable);
  assert.equal(
    n(unregisterOnlineDialogMessage(info!)),
    'Du bekommst 24,00 € zurück. Kostenlos abmelden bis Sa, 03.10., 18:00.',
  );
  assert.equal(n(onlinePaidStatusLine(info!)), 'Online bezahlt · kostenlos abmelden bis Sa, 03.10., 18:00');
});

test('Frist nach: Dialog und Statuszeile', () => {
  const info = onlineRefundInfo({ cancellation_deadline: DEADLINE }, state(), AFTER);
  assert.equal(info?.refundable, false);
  assert.equal(
    n(unregisterOnlineDialogMessage(info!)),
    'Die Abmeldefrist ist seit Sa, 03.10., 18:00 vorbei. Die 24,00 € werden nicht erstattet.',
  );
  assert.equal(onlinePaidStatusLine(info!), 'Online bezahlt · Abmeldefrist vorbei');
});

test('ohne Frist erstattet (wie Trigger)', () => {
  const info = onlineRefundInfo({ cancellation_deadline: null }, state(), AFTER);
  assert.equal(info?.refundable, true);
  assert.equal(n(unregisterOnlineDialogMessage(info!)), 'Du bekommst 24,00 € zurück.');
});

test('Teilerstattung vorher: Dialog nennt den Rest', () => {
  const info = onlineRefundInfo(
    { cancellation_deadline: DEADLINE },
    state({ refundable_cents: 1400, refunded_cents: 1000 }),
    BEFORE,
  );
  assert.match(n(unregisterOnlineDialogMessage(info!)), /^Du bekommst 14,00 € zurück\./);
});

test('keine Online-Zahlung → null', () => {
  assert.equal(onlineRefundInfo({ cancellation_deadline: DEADLINE }, null, BEFORE), null);
  assert.equal(onlineRefundInfo({}, state({ payment_cents: 0, refundable_cents: 0 }), BEFORE), null);
  assert.equal(onlineRefundInfo({}, state({ refundable_cents: 0, refunded_cents: 2400 }), BEFORE), null);
});

test('Erfolg nach Abmeldung: Betrag und 0 €', () => {
  assert.equal(
    n(unregisterRefundSuccessMessage(2400)),
    'Abgemeldet. 24,00 € werden erstattet – je nach Bank dauert das einige Werktage.',
  );
  assert.equal(unregisterRefundSuccessMessage(0), 'Abgemeldet.');
  assert.equal(unregisterRefundSuccessMessage(undefined), 'Abgemeldet.');
});

test('Erstattungsstand: läuft, voll, teil, fehlgeschlagen, nichts', () => {
  assert.equal(n(refundProgress(state({ pending_cents: 2400 }))?.text), 'Erstattung läuft · 24,00 €');
  assert.equal(refundProgress(state({ pending_cents: 2400 }))?.tone, 'pending');
  assert.equal(n(refundProgress(state({ refunded_cents: 2400, refundable_cents: 0 }))?.text), 'Erstattet · 24,00 €');
  assert.equal(
    n(refundProgress(state({ refunded_cents: 1000, refundable_cents: 1400 }))?.text),
    'Teilweise erstattet · 10,00 € von 24,00 €',
  );
  const failed = refundProgress(state({ failed: true }));
  assert.equal(failed?.text, 'Erstattung verzögert sich – das Studio ist informiert.');
  assert.equal(failed?.tone, 'delayed');
  assert.equal(refundProgress(state()), null);
  assert.equal(refundProgress(null), null);
});

test('stornierte Buchung sichtbar bis Kursende, danach nur pending/failed', () => {
  const future = { date: '2099-06-15', time: '10:00:00', end_time: '11:00:00' };
  const past = { date: '2020-01-01', time: '10:00:00', end_time: '11:00:00' };
  const now = new Date('2026-10-04T12:00:00Z');

  assert.equal(isCancelledEnrollmentVisible(future, null, now), true);
  assert.equal(isCancelledEnrollmentVisible(future, state(), now), true);
  assert.equal(isCancelledEnrollmentVisible(past, null, now), false);
  assert.equal(isCancelledEnrollmentVisible(past, state(), now), false);
  assert.equal(isCancelledEnrollmentVisible(past, state({ refunded_cents: 2400, refundable_cents: 0 }), now), false);
  assert.equal(isCancelledEnrollmentVisible(past, state({ pending_cents: 2400 }), now), true);
  assert.equal(isCancelledEnrollmentVisible(past, state({ failed: true }), now), true);
  assert.equal(isCancelledEnrollmentVisible(null, state({ pending_cents: 2400 }), now), false);
});

test('Owner: Zusammenfassung, Eingabe, Prüfung', () => {
  assert.equal(
    n(refundSummary('Anna', 1000, 2400)),
    '10,00 € an Anna erstatten. Danach noch erstattbar: 14,00 €. Stripe erstattet seine Gebühr für die Zahlung nicht.',
  );
  assert.equal(centsToRefundInput(2400), '24,00');
  assert.equal(centsToRefundInput(1450), '14,50');
  assert.equal(refundInputToCents('10,00'), 1000);
  assert.equal(refundInputToCents('10'), 1000);
  assert.equal(refundInputToCents('10,5'), 1050);
  assert.equal(refundInputToCents('abc'), null);
  assert.equal(refundInputToCents('0'), null);
  assert.equal(refundFormError('10,00', 'Kulanz', 2400), null);
  assert.equal(n(refundFormError('25,00', 'Kulanz', 2400)), 'Höchstens 24,00 € sind noch erstattbar.');
  assert.equal(refundFormError('10,00', '  ', 2400), 'Bitte gib einen Grund an.');
  assert.equal(refundFormError('10,00', 'x'.repeat(201), 2400), 'Der Grund darf höchstens 200 Zeichen haben.');
});

test('Fehlercodes verständlich', () => {
  assert.equal(
    n(refundErrorMessage('AMOUNT_EXCEEDS_REMAINING', 1400)),
    'Der Betrag ist höher als der Rest. Noch erstattbar: 14,00 €.',
  );
  assert.equal(refundErrorMessage('NOTHING_TO_REFUND'), 'Diese Zahlung ist schon vollständig erstattet.');
  assert.equal(refundErrorMessage('FORBIDDEN'), 'Erstatten dürfen nur Inhaber und Admins.');
});

test('Grund-Arten', () => {
  assert.equal(refundReasonLabel('course_cancelled'), 'Kursabsage');
  assert.equal(refundReasonLabel('self_cancel_in_window'), 'Abmeldung');
  assert.equal(refundReasonLabel('staff_unregister'), 'Studio');
  assert.equal(refundReasonLabel('member_removed'), 'Entfernt');
  assert.equal(refundReasonLabel('late_payment'), 'Spätzahlung');
  assert.equal(refundReasonLabel('manual'), 'Manuell');
  assert.equal(refundReasonLabel('provider_dashboard'), 'Stripe-Dashboard');
});

test('Absage, Studio-Abmeldung, Entfernen', () => {
  assert.equal(
    n(courseCancelRefundLine(3, 7200)),
    '3 haben online bezahlt. 72,00 € werden automatisch erstattet.',
  );
  assert.equal(
    n(courseCancelRefundLine(1, 2400)),
    '1 Person hat online bezahlt. 24,00 € werden automatisch erstattet.',
  );
  assert.equal(courseCancelRefundLine(0, 0), null);
  assert.equal(n(courseCancelRefundDone(7200)), '72,00 € werden automatisch erstattet.');
  assert.equal(courseCancelRefundDone(0), '');
  assert.equal(
    n(staffUnregisterRefundLine(2400)),
    'Die Online-Zahlung über 24,00 € wird automatisch erstattet.',
  );
  assert.equal(staffUnregisterRefundLine(0), null);
  assert.equal(
    n(memberRemovalRefundLine(2, 4800)),
    '2 künftige online bezahlte Buchungen (48,00 €) werden erstattet.',
  );
  assert.equal(
    n(memberRemovalRefundLine(1, 2400)),
    '1 künftige online bezahlte Buchung (24,00 €) wird erstattet.',
  );
});
