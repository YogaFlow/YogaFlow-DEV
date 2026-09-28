/**
 * Unit-Test für futureSeriesCourses (S6).
 *
 * Verwendung:
 *   node --experimental-strip-types --test scripts/test/future_series_courses.ts
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { futureSeriesCourses } from '../../src/lib/courseDateTime.ts';

test('Termin gestern ist nicht kommende', () => {
  const now = new Date(2026, 8, 28, 12, 0, 0);
  const rows = [{ id: 'a', date: '2026-09-27', time: '10:00:00' }];
  assert.deepEqual(futureSeriesCourses(rows, now).map((r) => r.id), []);
});

test('Termin heute, schon begonnen, ist nicht kommende', () => {
  const now = new Date(2026, 8, 28, 12, 0, 0);
  const rows = [{ id: 'b', date: '2026-09-28', time: '10:00:00' }];
  assert.deepEqual(futureSeriesCourses(rows, now).map((r) => r.id), []);
});

test('Termin heute, später, ist kommende', () => {
  const now = new Date(2026, 8, 28, 12, 0, 0);
  const rows = [{ id: 'c', date: '2026-09-28', time: '18:00:00' }];
  assert.deepEqual(futureSeriesCourses(rows, now).map((r) => r.id), ['c']);
});

test('Termin morgen ist kommende', () => {
  const now = new Date(2026, 8, 28, 12, 0, 0);
  const rows = [{ id: 'd', date: '2026-09-29', time: '09:00:00' }];
  assert.deepEqual(futureSeriesCourses(rows, now).map((r) => r.id), ['d']);
});

test('Sommerzeitgrenze: nach Uhrumstellung nur noch nicht begonnene', () => {
  // MESZ beginnt 2026-03-29 02:00 → 03:00. now = 03:30 Ortszeit.
  const now = new Date(2026, 2, 29, 3, 30, 0);
  const rows = [
    { id: 'past', date: '2026-03-29', time: '01:00:00' },
    { id: 'future', date: '2026-03-29', time: '04:00:00' },
  ];
  assert.deepEqual(futureSeriesCourses(rows, now).map((r) => r.id), ['future']);
});

test('Winterzeitgrenze: nach Uhrumstellung nur noch nicht begonnene', () => {
  // MEZ beginnt 2026-10-25 03:00 → 02:00. now = 02:30 Ortszeit (nach Umstellung).
  const now = new Date(2026, 9, 25, 2, 30, 0);
  const rows = [
    { id: 'past', date: '2026-10-25', time: '01:00:00' },
    { id: 'future', date: '2026-10-25', time: '03:30:00' },
  ];
  assert.deepEqual(futureSeriesCourses(rows, now).map((r) => r.id), ['future']);
});
