/**
 * Unit-Test für Berlin-Kalenderdatum-Helfer (A7-2).
 *
 * Verwendung:
 *   node --experimental-strip-types --test scripts/test/berlin_civil_date.ts
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  asCivilIsoDate,
  berlinIsoFromInstant,
  clampCivilIsoDate,
} from '../../src/lib/courseDateTime.ts';

test('asCivilIsoDate nimmt nur YYYY-MM-DD, ohne Date/UTC', () => {
  assert.equal(asCivilIsoDate('2026-09-27'), '2026-09-27');
  assert.equal(asCivilIsoDate('2026-09-27T00:00:00.000Z'), '2026-09-27');
  assert.equal(asCivilIsoDate(' 2026-09-27 '), '2026-09-27');
  assert.equal(asCivilIsoDate(''), '');
  assert.equal(asCivilIsoDate(null), '');
});

test('berlinIsoFromInstant: bare YYYY-MM-DD bleibt unverändert', () => {
  assert.equal(berlinIsoFromInstant('2026-09-27'), '2026-09-27');
});

test('berlinIsoFromInstant: 00:30 Europe/Berlin Sommerzeit', () => {
  // 15.06.2026 00:30 MESZ = 14.06.2026 22:30 UTC
  assert.equal(berlinIsoFromInstant('2026-06-14T22:30:00.000Z'), '2026-06-15');
});

test('berlinIsoFromInstant: 23:30 Europe/Berlin Sommerzeit', () => {
  // 15.06.2026 23:30 MESZ = 15.06.2026 21:30 UTC
  assert.equal(berlinIsoFromInstant('2026-06-15T21:30:00.000Z'), '2026-06-15');
});

test('berlinIsoFromInstant: Mitternacht MESZ ist derselbe Kalendertag', () => {
  assert.equal(berlinIsoFromInstant('2026-09-26T22:00:00.000Z'), '2026-09-27');
});

test('clampCivilIsoDate hält Wert in [min, max]', () => {
  assert.equal(clampCivilIsoDate('2026-09-28', null, '2026-09-27'), '2026-09-27');
  assert.equal(clampCivilIsoDate('2026-09-26', '2026-09-27', null), '2026-09-27');
  assert.equal(clampCivilIsoDate('2026-09-27', '2026-09-27', '2026-09-27'), '2026-09-27');
});
