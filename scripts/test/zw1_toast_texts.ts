/**
 * ZW-1 N2 — konkrete Toast-Zeilen.
 * node --experimental-strip-types --test scripts/test/zw1_toast_texts.ts
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { enrolledToastLine, staffUnregisteredToastLine } from '../../src/lib/toastTexts.ts';

test('Anmeldung Toast mit Kurs und Termin', () => {
  assert.equal(
    enrolledToastLine({ title: 'Yin Yoga', date: '2026-10-07', time: '20:00:00' }),
    'Du bist dabei · Yin Yoga, Mi 20:00',
  );
});

test('Staff Abmelden Toast mit Namen', () => {
  assert.equal(staffUnregisteredToastLine('Hans', 'Peter'), 'Hans Peter abgemeldet');
});
