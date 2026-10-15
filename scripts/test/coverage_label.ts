/**
 * Unit-Test für einheitliche Deckungstexte (A8-2 / UX-6 T3/T9).
 *
 * Verwendung:
 *   node --experimental-strip-types --test scripts/test/coverage_label.ts
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coverageLabel, coverageLabelTone } from '../../src/lib/coverageLabel.ts';

const beforeStart = new Date('2030-06-01T10:00:00');
const afterStart = new Date('2030-06-01T12:00:00');
const start = new Date('2030-06-01T11:00:00');

test('open ohne Zeitbezug (CSV / Fallback)', () => {
  assert.equal(coverageLabel({ coverage_status: 'open' }, { audience: 'manager' }), 'offen');
  assert.equal(coverageLabel({ coverage_status: 'open' }, { audience: 'teacher' }), 'offen');
  assert.equal(
    coverageLabel({ coverage_status: 'open' }, { audience: 'participant' }),
    'offen · vor Ort bezahlen',
  );
  assert.equal(coverageLabel({ coverage_status: 'open' }, { audience: 'csv' }), 'offen');
});

test('open vor Beginn', () => {
  const opts = { courseStartsAt: start, now: beforeStart };
  assert.equal(
    coverageLabel({ coverage_status: 'open' }, { audience: 'manager', ...opts }),
    'Zahlt vor Ort',
  );
  assert.equal(
    coverageLabel({ coverage_status: 'open' }, { audience: 'teacher', ...opts }),
    'Zahlt vor Ort',
  );
  assert.equal(
    coverageLabel({ coverage_status: 'open' }, { audience: 'participant', ...opts }),
    'Bezahlung vor Ort',
  );
  assert.equal(
    coverageLabel({ coverage_status: 'open' }, { audience: 'csv', ...opts }),
    'offen',
  );
  assert.equal(coverageLabelTone({ coverage_status: 'open' }, opts), 'neutral');
});

test('open ab Beginn', () => {
  const opts = { courseStartsAt: start, now: afterStart };
  assert.equal(
    coverageLabel({ coverage_status: 'open' }, { audience: 'manager', ...opts }),
    'Offen',
  );
  assert.equal(
    coverageLabel({ coverage_status: 'open' }, { audience: 'teacher', ...opts }),
    'Offen',
  );
  assert.equal(
    coverageLabel({ coverage_status: 'open' }, { audience: 'participant', ...opts }),
    'Offen · bitte vor Ort bezahlen',
  );
  assert.equal(coverageLabelTone({ coverage_status: 'open' }, opts), 'warn');
});

test('pending_payment', () => {
  assert.equal(
    coverageLabel(
      { status: 'pending_payment', coverage_status: 'open' },
      { audience: 'manager' },
    ),
    'Zahlung läuft',
  );
  assert.equal(
    coverageLabel(
      { status: 'pending_payment', coverage_status: 'open' },
      { audience: 'participant' },
    ),
    'Zahlung läuft',
  );
});

test('paid bar / PayPal / Überweisung / online × Rolle', () => {
  assert.equal(
    coverageLabel({ coverage_status: 'paid', method: 'cash' }, { audience: 'manager' }),
    'Bezahlt · bar',
  );
  assert.equal(
    coverageLabel({ coverage_status: 'paid', method: 'paypal_manual' }, { audience: 'manager' }),
    'Bezahlt · PayPal',
  );
  assert.equal(
    coverageLabel({ coverage_status: 'paid', method: 'bank_transfer' }, { audience: 'csv' }),
    'Überweisung',
  );
  assert.equal(
    coverageLabel({ coverage_status: 'paid', method: 'cash' }, { audience: 'teacher' }),
    'Bezahlt',
  );
  assert.equal(
    coverageLabel({ coverage_status: 'paid', method: 'cash' }, { audience: 'participant' }),
    'Bezahlt',
  );
  assert.equal(
    coverageLabel({ coverage_status: 'paid', method: 'card' }, { audience: 'manager' }),
    'Bezahlt · online',
  );
  assert.equal(
    coverageLabel({ coverage_status: 'paid', method: 'card' }, { audience: 'participant' }),
    'online bezahlt',
  );
  assert.equal(
    coverageLabel({ coverage_status: 'paid', method: 'card' }, { audience: 'csv' }),
    'Kreditkarte',
  );
});

test('pass', () => {
  assert.equal(
    coverageLabel({ coverage_status: 'pass', pass_remaining: 6 }, { audience: 'manager' }),
    'Kurskarte · noch 6',
  );
  assert.equal(
    coverageLabel({ coverage_status: 'pass', pass_remaining: 6 }, { audience: 'teacher' }),
    'Kurskarte · noch 6',
  );
  assert.equal(
    coverageLabel({ coverage_status: 'pass', pass_remaining: 6 }, { audience: 'participant' }),
    'mit Kurskarte bezahlt',
  );
  assert.equal(
    coverageLabel({ coverage_status: 'pass', pass_remaining: 6 }, { audience: 'csv' }),
    'Kurskarte',
  );
});

test('waived + pre_omlify', () => {
  assert.equal(
    coverageLabel(
      { coverage_status: 'waived', coverage_waived_reason: 'pre_omlify' },
      { audience: 'manager' },
    ),
    'vor Omlify erledigt',
  );
  assert.equal(
    coverageLabel(
      { coverage_status: 'waived', coverage_waived_reason: 'pre_omlify' },
      { audience: 'participant' },
    ),
    'erledigt',
  );
});

test('waived + goodwill / other', () => {
  assert.equal(
    coverageLabel(
      { coverage_status: 'waived', coverage_waived_reason: 'goodwill' },
      { audience: 'manager' },
    ),
    'Erlassen',
  );
  assert.equal(
    coverageLabel(
      { coverage_status: 'waived', coverage_waived_reason: 'other' },
      { audience: 'csv' },
    ),
    'erlassen',
  );
  assert.equal(
    coverageLabel(
      { coverage_status: 'waived', coverage_waived_reason: 'goodwill' },
      { audience: 'participant' },
    ),
    'erledigt',
  );
});

test('not_required', () => {
  assert.equal(
    coverageLabel({ coverage_status: 'not_required' }, { audience: 'manager' }),
    'Kostenlos',
  );
  assert.equal(
    coverageLabel({ coverage_status: 'not_required' }, { audience: 'csv' }),
    'kostenlos',
  );
  assert.equal(
    coverageLabel({ coverage_status: 'not_required' }, { audience: 'participant' }),
    'Kostenlos',
  );
});

test('Warteliste oder storniert nie offen', () => {
  assert.equal(
    coverageLabel({ status: 'waitlist', coverage_status: 'open' }, { audience: 'manager' }),
    '—',
  );
  assert.equal(
    coverageLabel({ is_waitlist: true, coverage_status: 'open' }, { audience: 'teacher' }),
    '—',
  );
  assert.equal(
    coverageLabel({ status: 'cancelled', coverage_status: 'open' }, { audience: 'csv' }),
    '—',
  );
  assert.equal(
    coverageLabel({ status: 'waitlist', coverage_status: 'open' }, { audience: 'participant' }),
    '',
  );
});
