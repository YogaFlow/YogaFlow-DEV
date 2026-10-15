/**
 * Unit UX-4: Abmeldefrist, Toast-Undo, Kopfleiste-Kontrast, Kalender-Reihenfolge, Hash-Norm.
 *
 *   node --experimental-strip-types --test scripts/test/ux4_feinschliff.ts
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import {
  CANCEL_DEADLINE_EXPIRED,
  cancellationDeadlineLine,
  formatFriendlyCancellationDeadline,
  previewCancellationDeadlineIso,
} from '../../src/lib/cancellationDeadline.ts';
import {
  calendarActionsForDevice,
  detectCalendarDevice,
} from '../../src/lib/calendarInvite.ts';
import {
  headerMeetsContrast,
  headerTextContrastRatio,
} from '../../src/lib/headerContrast.ts';
import {
  toastDisplayText,
  toastUndoAllowed,
  TOAST_SUCCESS_MS,
  TOAST_UNDO_MS,
} from '../../src/lib/toastModel.ts';
import {
  hashLegalMarkdown,
  normalizeLegalMarkdown,
  stripImplementationNotes,
} from '../render-legal-pages.mjs';
import { readFileSync } from 'node:fs';

test('Abmeldefrist vor/nach Frist, gebucht/nicht gebucht', () => {
  const now = new Date('2026-10-01T12:00:00+02:00');
  const before = cancellationDeadlineLine('2026-10-03T18:00:00+02:00', now);
  assert.equal(before.startsWith('Kostenlos abmelden bis'), true);
  assert.match(before, /Okt/);
  assert.equal(cancellationDeadlineLine('2026-09-01T18:00:00+02:00', now), CANCEL_DEADLINE_EXPIRED);
  assert.equal(cancellationDeadlineLine(null, now), CANCEL_DEADLINE_EXPIRED);

  const preview = previewCancellationDeadlineIso('2026-10-08', '15:45:00', 24);
  assert.ok(preview);
  const label = formatFriendlyCancellationDeadline(preview!);
  assert.match(label, /\d+\. \w+, \d{2}:\d{2}/);

  const zero = previewCancellationDeadlineIso('2026-10-08', '15:45:00', 0);
  assert.equal(cancellationDeadlineLine(zero, now), CANCEL_DEADLINE_EXPIRED);
});

test('Toast: kurze Zeile und Undo-Regel', () => {
  assert.equal(toastDisplayText({ title: 'Abgemeldet', message: 'Abgemeldet' }), 'Abgemeldet');
  assert.equal(toastDisplayText({ message: 'Hans Peter abgemeldet' }), 'Hans Peter abgemeldet');
  assert.equal(toastUndoAllowed({ refundCents: 0, wasPaidOnline: false }), true);
  assert.equal(toastUndoAllowed({ refundCents: 100, wasPaidOnline: false }), false);
  assert.equal(toastUndoAllowed({ refundCents: 0, wasPaidOnline: true }), false);
  assert.equal(TOAST_SUCCESS_MS, 4000);
  assert.equal(TOAST_UNDO_MS, 6000);
});

test('Kopfleiste-Kontrast für 5 Beispielfarben ≥ 4,5:1', () => {
  const samples = ['#2F5A4E', '#FFFFFF', '#000000', '#F5E6C8', '#1F5F6B'];
  for (const hex of samples) {
    const ratio = headerTextContrastRatio(hex);
    assert.ok(ratio >= 4.5, `${hex} → ${ratio}`);
    assert.equal(headerMeetsContrast(hex), true);
  }
});

test('Kalender-Reihenfolge je User-Agent', () => {
  assert.equal(detectCalendarDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)'), 'ios');
  assert.equal(detectCalendarDevice('Mozilla/5.0 (Linux; Android 14)'), 'android');
  assert.equal(detectCalendarDevice('Mozilla/5.0 (Windows NT 10.0)'), 'desktop');

  const ios = calendarActionsForDevice('ios');
  assert.equal(ios[0]?.id, 'apple');
  assert.equal(ios[0]?.primary, true);
  assert.ok(ios.some((a) => a.id === 'google'));

  const android = calendarActionsForDevice('android');
  assert.equal(android[0]?.id, 'google');
  assert.ok(android.some((a) => a.id === 'ics'));

  const desktop = calendarActionsForDevice('desktop');
  assert.ok(desktop.some((a) => a.id === 'outlook'));
  assert.ok(desktop.some((a) => a.id === 'google'));
});

test('AVV-Hash: Normalisierung; Layout≠Text; ≠ 21.09-HTML-Hash', () => {
  const md = readFileSync('docs/legal/AVV_Auftragsverarbeitung.md', 'utf8');
  const stripped = stripImplementationNotes(md);
  const a = hashLegalMarkdown(stripped);
  const b = hashLegalMarkdown(stripped.replace(/\n/g, '\r\n') + '   \n');
  assert.equal(a, b);
  assert.equal(normalizeLegalMarkdown('x  \r\n'), 'x\n');

  const changed = hashLegalMarkdown(stripped + '\n\nZusatz.');
  assert.notEqual(a, changed);

  const oldHtmlHash = '081aa26d9251f364dd5594c4f3ddf5786c57bdb813ba1bcbf0f5c17208d639c5';
  assert.notEqual(a, oldHtmlHash);
  assert.equal(a.length, 64);
  assert.equal(createHash('sha256').update(normalizeLegalMarkdown(stripped), 'utf8').digest('hex'), a);
});
