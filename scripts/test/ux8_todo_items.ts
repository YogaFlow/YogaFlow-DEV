/**
 * UX-8 — buildTodoItems (ohne DB).
 *
 *   node --experimental-strip-types --test scripts/test/ux8_todo_items.ts
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildTodoItems,
  isOnsiteReturnMethod,
  todoEmptyLabel,
  todoItemCount,
  type TodoFailedRefund,
  type TodoOpenCourse,
  type TodoReturnRow,
} from '../../src/lib/buildTodoItems.ts';

const NOW = new Date('2026-10-06T12:00:00+02:00');

const ninaOpen: TodoOpenCourse = {
  courseId: 'yin',
  title: 'Yin Yoga',
  date: '2026-10-05',
  time: '10:00:00',
  teacherId: 't-ben',
  openCount: 1,
  courseArchived: false,
};

const hathaToday: TodoOpenCourse = {
  courseId: 'hatha',
  title: 'Hatha am Nachmittag',
  date: '2026-10-06',
  time: '19:29:00',
  teacherId: 't-lena',
  openCount: 2,
  courseArchived: false,
};

const olderOpen: TodoOpenCourse = {
  courseId: 'old',
  title: 'Alter Kurs',
  date: '2026-10-01',
  time: '09:00:00',
  teacherId: 't-lena',
  openCount: 4,
  courseArchived: false,
};

const veraReturn: TodoReturnRow = {
  registrationId: 'reg-vera',
  courseId: 'samstag',
  courseTitle: 'Yoga am Samstagmorgen',
  courseDate: '2026-10-10',
  courseTime: '09:00:00',
  teacherId: 't-lena',
  courseArchived: false,
  firstName: 'Vera',
  lastName: 'Vorort',
  method: 'cash',
  amountCents: 1800,
};

const onlineReturn: TodoReturnRow = {
  ...veraReturn,
  registrationId: 'reg-olaf',
  firstName: 'Olaf',
  lastName: 'Online',
  method: 'card',
  amountCents: 1800,
};

const failedRefund: TodoFailedRefund = {
  paymentId: 'pay-1',
  amountCents: 1800,
  firstName: 'Olaf',
  lastName: 'Online',
  courseTitle: 'Yoga am Samstagmorgen',
  courseDate: '2026-10-10',
  courseArchived: false,
  personArchived: false,
};

test('isOnsiteReturnMethod: bar ja, card nein', () => {
  assert.equal(isOnsiteReturnMethod('cash'), true);
  assert.equal(isOnsiteReturnMethod('card'), false);
});

test('Online succeeded/pending: keine return-Zeile; card nie return_onsite', () => {
  const items = buildTodoItems(
    { returns: [onlineReturn], openCourses: [] },
    NOW,
    'owner',
  );
  assert.equal(items.length, 0);
});

test('failed → Zeile U2 nur Owner/Admin; Lehrende nicht', () => {
  const owner = buildTodoItems({ failedRefunds: [failedRefund] }, NOW, 'owner');
  assert.equal(owner.length, 1);
  assert.equal(owner[0].kind, 'refund_failed');
  assert.match(owner[0].title, /Erstattung fehlgeschlagen/);
  assert.match(owner[0].title, /Olaf Online/);
  assert.equal(owner[0].href, '/payments?payment=pay-1');

  const teacher = buildTodoItems(
    { failedRefunds: [failedRefund] },
    NOW,
    'teacher',
    { teacherId: 't-lena' },
  );
  assert.equal(teacher.length, 0);
});

test('archiviert → keine Zeile (failed und return)', () => {
  const archivedFail = { ...failedRefund, courseArchived: true };
  const archivedReturn = { ...veraReturn, courseArchived: true };
  const items = buildTodoItems(
    { failedRefunds: [archivedFail], returns: [archivedReturn] },
    NOW,
    'owner',
  );
  assert.equal(items.length, 0);
});

test('Dedupe: Nina einmal (gestern offen), nicht doppelt', () => {
  const items = buildTodoItems(
    { openCourses: [ninaOpen, hathaToday] },
    NOW,
    'owner',
  );
  const ninaLines = items.filter((i) => i.title.includes('Yin Yoga'));
  assert.equal(ninaLines.length, 1);
  assert.equal(ninaLines[0].kind, 'payment_open');
  assert.match(ninaLines[0].title, /^1 Zahlung offen/);
});

test('Reihenfolge: failed → return → offen → vor Ort → Sammelzeile', () => {
  const items = buildTodoItems(
    {
      failedRefunds: [failedRefund],
      returns: [veraReturn],
      openCourses: [ninaOpen, hathaToday, olderOpen],
    },
    NOW,
    'owner',
  );
  assert.deepEqual(
    items.map((i) => i.kind),
    ['refund_failed', 'return_onsite', 'payment_open', 'pay_onsite', 'older_open'],
  );
});

test('Gestern/Heute/älter', () => {
  const items = buildTodoItems(
    { openCourses: [ninaOpen, hathaToday, olderOpen] },
    NOW,
    'owner',
  );
  assert.equal(items.find((i) => i.kind === 'payment_open')?.subtitle.startsWith('Gestern'), true);
  assert.equal(items.find((i) => i.kind === 'pay_onsite')?.subtitle.startsWith('Heute'), true);
  assert.match(items.find((i) => i.kind === 'older_open')!.title, /4 weitere/);
});

test('Rollen: Lehrende nur eigene Kurse, ohne Betrag', () => {
  const items = buildTodoItems(
    {
      returns: [veraReturn],
      openCourses: [ninaOpen, hathaToday],
      failedRefunds: [failedRefund],
    },
    NOW,
    'teacher',
    { teacherId: 't-lena' },
  );
  assert.ok(items.every((i) => i.kind !== 'refund_failed'));
  assert.ok(items.every((i) => i.kind !== 'older_open'));
  assert.ok(!items.some((i) => i.title.includes('Yin Yoga')));
  const ret = items.find((i) => i.kind === 'return_onsite');
  assert.ok(ret);
  assert.match(ret!.title, /1 Rückgabe offen/);
  assert.equal(ret!.amountCents, undefined);
});

test('Einzahl/Mehrzahl', () => {
  const one = buildTodoItems({ openCourses: [ninaOpen] }, NOW, 'owner');
  assert.match(one[0].title, /^1 Zahlung offen/);
  const two = buildTodoItems(
    { openCourses: [{ ...ninaOpen, openCount: 2 }] },
    NOW,
    'owner',
  );
  assert.match(two[0].title, /^2 Zahlungen offen/);
});

test('leer', () => {
  const items = buildTodoItems({}, NOW, 'owner');
  assert.equal(items.length, 0);
  assert.equal(todoItemCount(items), 0);
  assert.match(todoEmptyLabel(), /Alles erledigt/);
});

test('Zähler ohne Sammelzeile', () => {
  const items = buildTodoItems(
    {
      returns: [veraReturn],
      openCourses: [ninaOpen, olderOpen],
    },
    NOW,
    'owner',
  );
  assert.equal(todoItemCount(items), 2);
  assert.equal(items.length, 3);
});
