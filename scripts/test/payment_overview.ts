import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  paymentEmptyText,
  paymentKindLabel,
  paymentMonthOptions,
  paymentPageLabel,
  paymentPersonName,
  paymentPurpose,
  paymentStatusText,
  paymentStatusTone,
} from '../../src/lib/paymentOverview.ts';
import { formatMonthYear, monthStartIso } from '../../src/lib/format.ts';

const nb = (s: string) => s.replace(/\u00a0/g, ' ');

test('Status-Texte', () => {
  const base = { amount_cents: 2400, refunded_cents: 0 };
  assert.equal(paymentStatusText({ ...base, status: 'paid' }), 'Bezahlt');
  assert.equal(
    nb(paymentStatusText({ status: 'partially_refunded', amount_cents: 2400, refunded_cents: 1000 })),
    'Teilweise erstattet · 10,00 € von 24,00 €',
  );
  assert.equal(paymentStatusText({ ...base, status: 'refunded' }), 'Erstattet');
  assert.equal(paymentStatusText({ ...base, status: 'refund_pending' }), 'Erstattung läuft');
  assert.equal(paymentStatusText({ ...base, status: 'refund_failed' }), 'Erstattung fehlgeschlagen');
  assert.equal(paymentStatusText({ ...base, status: 'dispute_open' }), 'Rückbuchung offen');
  assert.equal(paymentStatusText({ ...base, status: 'canceled' }), 'Storniert');
});

test('Status-Ton', () => {
  assert.equal(paymentStatusTone('dispute_open'), 'attention');
  assert.equal(paymentStatusTone('refund_failed'), 'attention');
  assert.equal(paymentStatusTone('refund_pending'), 'pending');
  assert.equal(paymentStatusTone('canceled'), 'muted');
  assert.equal(paymentStatusTone('paid'), 'neutral');
});

test('Art und Wofür', () => {
  assert.equal(paymentKindLabel('online'), 'Online');
  assert.equal(paymentKindLabel('paypal_manual'), 'PayPal');
  assert.equal(paymentKindLabel('bank_transfer'), 'Überweisung');
  assert.equal(
    paymentPurpose({ subject_type: 'pass_purchase', pass_name: '10er-Karte', course_title: null, course_date: null, course_time: null }),
    '10er-Karte',
  );
  const course = paymentPurpose({
    subject_type: 'registration',
    pass_name: null,
    course_title: 'Yin',
    course_date: '2026-10-08',
    course_time: '18:00:00',
  });
  assert.match(course, /^Yin · .*8\. Okt.*, 18:00$/);
  assert.ok(!course.includes(':00:00'));
});

test('Person', () => {
  assert.equal(paymentPersonName({ first_name: 'Anna', last_name: 'Berg' }), 'Anna Berg');
  assert.equal(paymentPersonName({ first_name: null, last_name: null }), 'Ohne Namen');
});

test('Monate und Seiten', () => {
  assert.equal(monthStartIso('2026-10-02'), '2026-10-01');
  assert.equal(monthStartIso('2026-01-15', 1), '2025-12-01');
  assert.equal(formatMonthYear('2026-03-01'), 'März 2026');
  const opts = paymentMonthOptions('2026-10-02', 3);
  assert.deepEqual(opts.map((o) => o.value), ['2026-10-01', '2026-09-01', '2026-08-01']);
  assert.equal(opts[0].label, 'Oktober 2026');
  assert.equal(paymentPageLabel(1, 0), '');
  assert.equal(paymentPageLabel(1, 7), '1–7 von 7');
  assert.equal(paymentPageLabel(2, 120), '51–100 von 120');
  assert.notEqual(paymentEmptyText(true), paymentEmptyText(false));
});
