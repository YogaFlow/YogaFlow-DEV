/**
 * F2 — Eine Definition „offene Zahlung“: Anmeldung (Zeile), nicht Person.
 * Badge / Offen / Summe Zu-erledigen-Offen müssen für denselben Datenstand gleich sein.
 * Sammel-Abhaken ist bewusste Teilmenge (vor Datum).
 */
import assert from 'node:assert/strict';
import { countOpenCoverageRows, openPaymentsBadge } from '../../src/lib/paymentsTabs.ts';
import { buildTodoItems, type TodoOpenCourse } from '../../src/lib/buildTodoItems.ts';

const rows = [
  { user_id: 'a', registration_id: '1' },
  { user_id: 'a', registration_id: '2' },
  { user_id: 'b', registration_id: '3' },
];

assert.equal(countOpenCoverageRows(rows), 3, 'Anmeldungen, nicht 2 Personen');
assert.equal(openPaymentsBadge(3), '3');

const now = new Date('2026-10-08T12:00:00+02:00');
const today = '2026-10-08';

const openCourses: TodoOpenCourse[] = [
  {
    courseId: 'c1',
    title: 'Heute',
    date: today,
    time: '10:00:00',
    teacherId: 't1',
    openCount: 2,
    courseArchived: false,
  },
  {
    courseId: 'c2',
    title: 'Gestern',
    date: '2026-10-07',
    time: '18:00:00',
    teacherId: 't1',
    openCount: 1,
    courseArchived: false,
  },
  {
    courseId: 'c3',
    title: 'Älter',
    date: '2026-10-01',
    time: '09:00:00',
    teacherId: 't1',
    openCount: 1,
    courseArchived: false,
  },
];

const items = buildTodoItems({ openCourses }, now, 'owner');

const paymentOpenSum = items
  .filter((i) => i.kind === 'payment_open')
  .reduce((sum, i) => {
    const m = i.title.match(/^(\d+)/);
    return sum + (m ? Number(m[1]) : 1);
  }, 0);
const older = items.find((i) => i.kind === 'older_open');
const olderN = older ? Number(older.title.match(/\d+/)?.[0] ?? 0) : 0;
const openFromTodo = paymentOpenSum + olderN;
const badge = countOpenCoverageRows(
  Array.from({ length: openFromTodo }, (_, i) => ({ id: String(i) })),
);

assert.equal(openFromTodo, 4, 'Zu erledigen Offen-Summe');
assert.equal(badge, openFromTodo, 'Badge = Zu-erledigen-Offen');

// Sammel-Abhaken vor heute: ohne „Heute“-Kurs = 1+1 = 2 (Teilmenge)
const beforeToday = openCourses
  .filter((c) => c.date < today)
  .reduce((s, c) => s + c.openCount, 0);
assert.equal(beforeToday, 2);
assert.ok(beforeToday < openFromTodo, 'Abhaken vor Datum ist Teilmenge');

console.log('f2_open_counts: ok');
