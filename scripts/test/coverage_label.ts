/**
 * Unit-Test für einheitliche Deckungstexte (A8-2).
 *
 * Verwendung:
 *   node --experimental-strip-types --test scripts/test/coverage_label.ts
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coverageLabel } from '../../src/lib/coverageLabel.ts';

test('open', () => {
  assert.equal(coverageLabel({ coverage_status: 'open' }, { audience: 'manager' }), 'offen');
  assert.equal(coverageLabel({ coverage_status: 'open' }, { audience: 'teacher' }), 'offen');
  assert.equal(
    coverageLabel({ coverage_status: 'open' }, { audience: 'participant' }),
    'offen · vor Ort bezahlen',
  );
  assert.equal(coverageLabel({ coverage_status: 'open' }, { audience: 'csv' }), 'offen');
});

test('paid bar / PayPal / Überweisung', () => {
  assert.equal(
    coverageLabel({ coverage_status: 'paid', method: 'cash' }, { audience: 'manager' }),
    'bar',
  );
  assert.equal(
    coverageLabel({ coverage_status: 'paid', method: 'paypal_manual' }, { audience: 'manager' }),
    'PayPal',
  );
  assert.equal(
    coverageLabel({ coverage_status: 'paid', method: 'bank_transfer' }, { audience: 'csv' }),
    'Überweisung',
  );
  assert.equal(
    coverageLabel({ coverage_status: 'paid', method: 'cash' }, { audience: 'teacher' }),
    'bezahlt',
  );
  assert.equal(
    coverageLabel({ coverage_status: 'paid', method: 'cash' }, { audience: 'participant' }),
    'bezahlt',
  );
});

test('pass', () => {
  assert.equal(
    coverageLabel({ coverage_status: 'pass', pass_remaining: 6 }, { audience: 'manager' }),
    'Karte · noch 6',
  );
  assert.equal(
    coverageLabel({ coverage_status: 'pass', pass_remaining: 6 }, { audience: 'teacher' }),
    'Karte · noch 6',
  );
  assert.equal(
    coverageLabel({ coverage_status: 'pass', pass_remaining: 6 }, { audience: 'participant' }),
    'mit Karte bezahlt',
  );
  assert.equal(
    coverageLabel({ coverage_status: 'pass', pass_remaining: 6 }, { audience: 'csv' }),
    'Karte',
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
      { audience: 'teacher' },
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
    'erlassen',
  );
  assert.equal(
    coverageLabel(
      { coverage_status: 'waived', coverage_waived_reason: 'other' },
      { audience: 'teacher' },
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
    'kostenlos',
  );
  assert.equal(
    coverageLabel({ coverage_status: 'not_required' }, { audience: 'teacher' }),
    'kostenlos',
  );
  assert.equal(
    coverageLabel({ coverage_status: 'not_required' }, { audience: 'participant' }),
    'kostenlos',
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
