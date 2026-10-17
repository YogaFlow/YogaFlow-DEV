/**
 * FS-1 B — Widerruf-Dialog Phasen nach RPC.
 *
 *   node --experimental-strip-types --test scripts/test/pass_withdrawal_ui.ts
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  passWithdrawalAfterConfirm,
  passWithdrawalAlreadyMessage,
  passWithdrawalSuccessMessage,
} from '../../src/lib/passWithdrawalUi.ts';

const n = (s: string) => s.replace(/\u00A0/g, ' ');

test('Erfolg → done, kein Bestätigen', () => {
  const next = passWithdrawalAfterConfirm({ success: true, refund_cents: 9600 });
  assert.equal(next.phase, 'done');
  assert.equal(next.showConfirm, false);
  assert.match(n(next.message), /Widerruf bestätigt.*96,00 €/);
});

test('ALREADY_WITHDRAWN → blocked, kein Bestätigen', () => {
  const next = passWithdrawalAfterConfirm({ success: false, error: 'ALREADY_WITHDRAWN' });
  assert.equal(next.phase, 'blocked');
  assert.equal(next.showConfirm, false);
  assert.equal(next.message, passWithdrawalAlreadyMessage());
});

test('WINDOW_EXPIRED → blocked', () => {
  const next = passWithdrawalAfterConfirm({ success: false, error: 'WINDOW_EXPIRED' });
  assert.equal(next.phase, 'blocked');
  assert.equal(next.showConfirm, false);
});

test('sonstiger Fehler → summary mit Bestätigen', () => {
  const next = passWithdrawalAfterConfirm({ success: false, error: 'UNKNOWN' });
  assert.equal(next.phase, 'summary');
  assert.equal(next.showConfirm, true);
});

test('Erfolgstext', () => {
  assert.match(n(passWithdrawalSuccessMessage(0)), /0,00 € werden erstattet/);
});
