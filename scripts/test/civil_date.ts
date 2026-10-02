import { test } from 'node:test';
import assert from 'node:assert/strict';
import { civilIsoToLocalDate, localDateToCivilIso } from '../../src/lib/courseDateTime.ts';

test('ISO-Kalendertag übersteht Hin- und Rückweg unverändert', () => {
  for (const iso of ['2026-01-01', '2026-03-29', '2026-10-25', '2026-12-31', '2024-02-29']) {
    assert.equal(localDateToCivilIso(civilIsoToLocalDate(iso)), iso);
  }
});

test('lokale Mitternacht desselben Tages, keine UTC-Verschiebung', () => {
  const date = civilIsoToLocalDate('2026-10-02');
  assert.ok(date);
  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 9);
  assert.equal(date.getDate(), 2);
  assert.equal(date.getHours(), 0);
});

test('leere oder ungültige Werte', () => {
  assert.equal(civilIsoToLocalDate(''), null);
  assert.equal(civilIsoToLocalDate(null), null);
  assert.equal(civilIsoToLocalDate('02.10.2026'), null);
  assert.equal(localDateToCivilIso(null), '');
  assert.equal(localDateToCivilIso(new Date(Number.NaN)), '');
});
