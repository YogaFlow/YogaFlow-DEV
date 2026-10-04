/**
 * Unit UX-5: Toast-Regel je Art + Buchungsleiste-Snapshots (4 Zustände).
 *
 *   node --experimental-strip-types --test scripts/test/ux5_buchungsleiste_toast.ts
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BOOKING_BAR_STACK_ORDER,
  bookingPayMethodFieldAppearance,
} from '../../src/lib/bookingBarLayout.ts';
import {
  TOAST_SUCCESS_MS,
  TOAST_UNDO_MS,
  toastAutoDismissMs,
  toastUndoAllowed,
} from '../../src/lib/toastModel.ts';

test('Toast-Regel: Bestätigung 4 s ohne Balken-Dauer; Abmelden 6 s; Fehler bleibt', () => {
  assert.equal(TOAST_SUCCESS_MS, 4000);
  assert.equal(TOAST_UNDO_MS, 6000);
  assert.equal(toastAutoDismissMs('success'), 4000);
  assert.equal(toastAutoDismissMs('success', undefined, true), 6000);
  assert.equal(toastAutoDismissMs('error'), null);
  assert.equal(toastUndoAllowed({ refundCents: 0, wasPaidOnline: false }), true);
  assert.equal(toastUndoAllowed({ refundCents: 0, wasPaidOnline: true }), false);
  assert.equal(toastUndoAllowed({ refundCents: 100, wasPaidOnline: false }), false);
});

test('Buchungsleiste Stack-Reihenfolge', () => {
  assert.deepEqual([...BOOKING_BAR_STACK_ORDER], ['priceDeadline', 'payMethod', 'primary']);
});

test('Buchungsleiste Snapshot: Online (mehrere Wege) + Neu', () => {
  assert.deepEqual(
    bookingPayMethodFieldAppearance({
      method: 'online',
      canChange: true,
      showOnlineHint: true,
    }),
    {
      kind: 'online',
      bordered: true,
      showChevron: true,
      showNeuBadge: true,
      showNeuHint: true,
      heightPx: 48,
    },
  );
});

test('Buchungsleiste Snapshot: Vor Ort (mehrere Wege)', () => {
  assert.deepEqual(
    bookingPayMethodFieldAppearance({ method: 'onsite', canChange: true }),
    {
      kind: 'onsite',
      bordered: true,
      showChevron: true,
      showNeuBadge: false,
      showNeuHint: false,
      heightPx: 48,
    },
  );
});

test('Buchungsleiste Snapshot: Vor Ort + Neu (Z8)', () => {
  assert.deepEqual(
    bookingPayMethodFieldAppearance({
      method: 'onsite',
      canChange: true,
      showOnlineHint: true,
    }),
    {
      kind: 'onsite',
      bordered: true,
      showChevron: true,
      showNeuBadge: true,
      showNeuHint: true,
      heightPx: 48,
    },
  );
});

test('Buchungsleiste Snapshot: Karte (mehrere Wege)', () => {
  assert.deepEqual(
    bookingPayMethodFieldAppearance({ method: 'pass', canChange: true }),
    {
      kind: 'pass',
      bordered: true,
      showChevron: true,
      showNeuBadge: false,
      showNeuHint: false,
      heightPx: 48,
    },
  );
});

test('Buchungsleiste Snapshot: nur ein Weg', () => {
  assert.deepEqual(
    bookingPayMethodFieldAppearance({ method: 'onsite', canChange: false }),
    {
      kind: 'onsite',
      bordered: false,
      showChevron: false,
      showNeuBadge: false,
      showNeuHint: false,
      heightPx: 48,
    },
  );
});
