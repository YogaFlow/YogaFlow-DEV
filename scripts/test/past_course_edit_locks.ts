/**
 * Unit-Test für pastCourseEditLocks (A5).
 *
 * Verwendung:
 *   node --experimental-strip-types --test scripts/test/past_course_edit_locks.ts
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pastCourseEditLocks } from '../../src/lib/courseDateTime.ts';

const now = new Date(2026, 8, 28, 12, 0, 0);

test('kommender Kurs: nichts gesperrt', () => {
  const locks = pastCourseEditLocks(
    { date: '2026-09-29', time: '10:00:00' },
    { isManager: false },
    now,
  );
  assert.equal(locks.begun, false);
  assert.equal(locks.scheduleAndMoneyLocked, false);
  assert.equal(locks.teacherLocked, false);
});

test('begonnener Kurs: Zeit/Geld gesperrt, Lehrende: Lehrerin gesperrt', () => {
  const locks = pastCourseEditLocks(
    { date: '2026-09-28', time: '10:00:00' },
    { isManager: false },
    now,
  );
  assert.equal(locks.begun, true);
  assert.equal(locks.scheduleAndMoneyLocked, true);
  assert.equal(locks.teacherLocked, true);
});

test('begonnener Kurs: Owner/Admin darf Lehrerin ändern', () => {
  const locks = pastCourseEditLocks(
    { date: '2026-09-27', time: '18:00:00' },
    { isManager: true },
    now,
  );
  assert.equal(locks.begun, true);
  assert.equal(locks.scheduleAndMoneyLocked, true);
  assert.equal(locks.teacherLocked, false);
});

test('ohne Kurs: nichts gesperrt', () => {
  const locks = pastCourseEditLocks(null, { isManager: false }, now);
  assert.equal(locks.begun, false);
  assert.equal(locks.scheduleAndMoneyLocked, false);
  assert.equal(locks.teacherLocked, false);
});
