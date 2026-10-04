/**
 * Unit-Test UX-3: Toast-Modell + Export-Zeitraum.
 *
 *   node --experimental-strip-types --test scripts/test/ux3_toast_export.ts
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  berlinYearMonth,
  exportPreviewLabel,
  formatMonthLabel,
  formatYearMonth,
  monthBoundsFromYm,
  resolveExportRange,
  shiftYearMonth,
  yearBounds,
} from '../../src/lib/exportPeriod.ts';
import {
  TOAST_SUCCESS_MS,
  TOAST_UNDO_MS,
  toastAutoDismissMs,
  toastDisplayText,
  toastRole,
} from '../../src/lib/toastModel.ts';

test('Toast Rolle und Dauer', () => {
  assert.equal(toastRole('success'), 'status');
  assert.equal(toastRole('info'), 'status');
  assert.equal(toastRole('error'), 'alert');
  assert.equal(toastAutoDismissMs('success'), TOAST_SUCCESS_MS);
  assert.equal(toastAutoDismissMs('success', undefined, true), TOAST_UNDO_MS);
  assert.equal(toastAutoDismissMs('error'), null);
  assert.equal(toastDisplayText({ title: 'Abgemeldet', message: 'Erfolgreich abgemeldet.' }), 'Abgemeldet — Erfolgreich abgemeldet.');
});

test('Export Monatsgrenzen und Jahr', () => {
  assert.deepEqual(monthBoundsFromYm({ year: 2026, month: 10 }), {
    from: '2026-10-01',
    to: '2026-10-31',
  });
  assert.deepEqual(monthBoundsFromYm({ year: 2026, month: 2 }), {
    from: '2026-02-01',
    to: '2026-02-28',
  });
  assert.deepEqual(yearBounds(2026), { from: '2026-01-01', to: '2026-12-31' });
  assert.deepEqual(shiftYearMonth({ year: 2026, month: 1 }, -1), { year: 2025, month: 12 });
  assert.equal(formatYearMonth({ year: 2026, month: 3 }), '2026-03');
  assert.equal(formatMonthLabel({ year: 2026, month: 10 }), 'Oktober 2026');
});

test('Export Presets relativ zu Berlin-Jetzt', () => {
  const now = new Date('2026-10-15T12:00:00+02:00');
  const current = berlinYearMonth(now);
  assert.equal(current.year, 2026);
  assert.equal(current.month, 10);

  const thisMonth = resolveExportRange({
    preset: 'this_month',
    month: { year: 2000, month: 1 },
    now,
  });
  assert.equal(thisMonth.from, '2026-10-01');
  assert.equal(thisMonth.to, '2026-10-31');
  assert.equal(thisMonth.labelMonth, '2026-10');

  const last = resolveExportRange({
    preset: 'last_month',
    month: { year: 2000, month: 1 },
    now,
  });
  assert.equal(last.from, '2026-09-01');
  assert.equal(last.to, '2026-09-30');

  const year = resolveExportRange({
    preset: 'this_year',
    month: { year: 2000, month: 1 },
    now,
  });
  assert.equal(year.from, '2026-01-01');
  assert.equal(year.to, '2026-12-31');

  const custom = resolveExportRange({
    preset: 'custom',
    month: { year: 2026, month: 8 },
    monthTo: { year: 2026, month: 10 },
    now,
  });
  assert.equal(custom.from, '2026-08-01');
  assert.equal(custom.to, '2026-10-31');

  assert.equal(exportPreviewLabel(23), '23 Zahlungen im Zeitraum');
  assert.equal(exportPreviewLabel(1), '1 Zahlung im Zeitraum');
});
