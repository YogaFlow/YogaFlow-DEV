/**
 * UX-2 B2: Zahlungsliste-CSV.
 *   node --experimental-strip-types --test scripts/test/payments_export.ts
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPaymentsListCsv, paymentsExportFilename } from '../../src/lib/paymentsExportCsv.ts';
import type { StudioPaymentRow } from '../../src/lib/paymentOverview.ts';

const sample: StudioPaymentRow = {
  payment_id: 'pay-1',
  paid_at: '2026-10-05T12:00:00+02:00',
  member_id: 'm1',
  first_name: 'Anna',
  last_name: 'Test',
  subject_type: 'registration',
  course_id: 'c1',
  course_title: 'Yin',
  course_date: '2026-10-05',
  course_time: '18:00:00',
  pass_name: null,
  kind: 'online',
  amount_cents: 1200,
  refunded_cents: 0,
  status: 'paid',
};

test('Zahlungsliste CSV Kopf + Zeile + Beleg', () => {
  const csv = buildPaymentsListCsv([sample], new Map([['pay-1', '2026-00001']]));
  const lines = csv.trim().split(/\r?\n/);
  assert.equal(lines[0], 'Datum;Name;Zweck;Art;Betrag;Erstattet;Status;Belegnummer;Zahlungs-ID');
  assert.match(lines[1], /Anna Test/);
  assert.match(lines[1], /2026-00001/);
  assert.match(lines[1], /Online/);
});

test('Dateiname omlify-studio-zahlungen-YYYY-MM', () => {
  assert.equal(
    paymentsExportFilename('2026-10-01', 'demoalpha'),
    'omlify-demoalpha-zahlungen-2026-10.csv',
  );
});
