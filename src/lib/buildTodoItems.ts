/**
 * UX-8 — Übersicht „Zu erledigen“: eine typisierte Liste aus bestehenden Quellen.
 * Keine neue Tabelle; speist nur Dashboard.
 */
import { berlinIsoDate, isCourseUpcoming } from './courseDateTime.ts';
import { methodWord } from './coverageLabel.ts';
import { formatCents, formatDate, formatTime } from './format.ts';
import type { PaymentMethod } from '../types';

export type TodoKind =
  | 'refund_failed'
  | 'return_onsite'
  | 'payment_open'
  | 'pay_onsite'
  | 'older_open';

export type TodoRole = 'owner' | 'admin' | 'teacher';

export type TodoItem = {
  kind: TodoKind;
  title: string;
  subtitle: string;
  amountCents?: number;
  href: string;
  sortKey: string;
};

export type TodoFailedRefund = {
  paymentId: string;
  amountCents: number;
  firstName: string;
  lastName: string;
  courseTitle: string | null;
  courseDate: string | null;
  courseArchived: boolean;
  personArchived: boolean;
};

export type TodoReturnRow = {
  registrationId: string;
  courseId: string;
  courseTitle: string;
  courseDate: string;
  courseTime: string;
  teacherId: string | null;
  courseArchived: boolean;
  firstName: string;
  lastName: string;
  method: PaymentMethod;
  amountCents: number;
};

export type TodoOpenCourse = {
  courseId: string;
  title: string;
  date: string;
  time: string;
  teacherId: string | null;
  openCount: number;
  courseArchived: boolean;
};

const ONSITE_METHODS = new Set<PaymentMethod>(['cash', 'paypal_manual', 'bank_transfer']);

export function isOnsiteReturnMethod(method: PaymentMethod | null | undefined): boolean {
  return method != null && ONSITE_METHODS.has(method);
}

function personName(first: string, last: string): string {
  return [first, last].filter(Boolean).join(' ').trim() || 'Unbekannt';
}

function dayWord(date: string, now: Date): 'heute' | 'gestern' | '' {
  if (date === berlinIsoDate(0, now)) return 'heute';
  if (date === berlinIsoDate(-1, now)) return 'gestern';
  return '';
}

function dayTimeSubtitle(date: string, time: string, now: Date): string {
  const day = dayWord(date, now);
  const word = day === 'heute' ? 'Heute' : day === 'gestern' ? 'Gestern' : formatDate(date);
  const clock = formatTime(time);
  return clock ? `${word}, ${clock}` : word;
}

function paymentOpenTitle(n: number, courseTitle: string): string {
  const word = n === 1 ? '1 Zahlung offen' : `${n} Zahlungen offen`;
  return `${word} · ${courseTitle}`;
}

function payOnsiteTitle(n: number, courseTitle: string): string {
  return `${n} zahlen vor Ort · ${courseTitle}`;
}

/**
 * Baut die Todo-Liste. Online-Erstattungen (card) nie als return_onsite.
 * failed → refund_failed nur Owner/Admin; archived ausgenommen.
 */
export function buildTodoItems(
  sources: {
    failedRefunds?: TodoFailedRefund[];
    returns?: TodoReturnRow[];
    openCourses?: TodoOpenCourse[];
  },
  now: Date,
  role: TodoRole,
  options?: { teacherId?: string | null },
): TodoItem[] {
  const teacherId = options?.teacherId ?? null;
  const isStaffTeacher = role === 'teacher';
  const isManager = role === 'owner' || role === 'admin';
  const today = berlinIsoDate(0, now);
  const yesterday = berlinIsoDate(-1, now);

  const items: TodoItem[] = [];

  if (isManager) {
    for (const row of sources.failedRefunds ?? []) {
      if (row.courseArchived || row.personArchived) continue;
      const name = personName(row.firstName, row.lastName);
      items.push({
        kind: 'refund_failed',
        title: `Erstattung fehlgeschlagen · ${formatCents(row.amountCents)} an ${name}`,
        subtitle: row.courseTitle
          ? [row.courseTitle, row.courseDate ? formatDate(row.courseDate) : '']
              .filter(Boolean)
              .join(' · ')
          : 'Online-Zahlung',
        amountCents: row.amountCents,
        href: `/payments?payment=${row.paymentId}`,
        sortKey: `0:${row.courseDate ?? ''}:${row.paymentId}`,
      });
    }
  }

  for (const row of sources.returns ?? []) {
    if (row.courseArchived) continue;
    if (!isOnsiteReturnMethod(row.method)) continue;
    if (isStaffTeacher && teacherId && row.teacherId !== teacherId) continue;

    const name = personName(row.firstName, row.lastName);
    if (isStaffTeacher) {
      items.push({
        kind: 'return_onsite',
        title: `1 Rückgabe offen · ${row.courseTitle}`,
        subtitle: `abgesagt · ${formatDate(row.courseDate)}`,
        href: `/course/${row.courseId}/participants`,
        sortKey: `1:${row.courseDate}:${row.courseTime}:${row.registrationId}`,
      });
    } else {
      items.push({
        kind: 'return_onsite',
        title: `${formatCents(row.amountCents)} ${methodWord(row.method)} an ${name} zurückgeben`,
        subtitle: `${row.courseTitle} · abgesagt · ${formatDate(row.courseDate)}`,
        amountCents: row.amountCents,
        href: `/course/${row.courseId}/participants`,
        sortKey: `1:${row.courseDate}:${row.courseTime}:${row.registrationId}`,
      });
    }
  }

  let olderOpen = 0;
  for (const course of sources.openCourses ?? []) {
    if (course.courseArchived || course.openCount <= 0) continue;
    if (isStaffTeacher && teacherId && course.teacherId !== teacherId) continue;

    const started = !isCourseUpcoming(
      { date: course.date, time: course.time },
      now,
    );

    if (course.date === today || course.date === yesterday) {
      if (started) {
        items.push({
          kind: 'payment_open',
          title: paymentOpenTitle(course.openCount, course.title),
          subtitle: dayTimeSubtitle(course.date, course.time, now),
          href: `/course/${course.courseId}/participants`,
          sortKey: `2:${course.date}:${course.time}:${course.courseId}`,
        });
      } else if (course.date === today) {
        items.push({
          kind: 'pay_onsite',
          title: payOnsiteTitle(course.openCount, course.title),
          subtitle: dayTimeSubtitle(course.date, course.time, now),
          href: `/course/${course.courseId}/participants`,
          sortKey: `3:${course.date}:${course.time}:${course.courseId}`,
        });
      }
    } else if (started && course.date < yesterday) {
      olderOpen += course.openCount;
    }
  }

  if (isManager && olderOpen > 0) {
    items.push({
      kind: 'older_open',
      title:
        olderOpen === 1
          ? '+ 1 weitere offene Zahlung aus früheren Kursen'
          : `+ ${olderOpen} weitere offene Zahlungen aus früheren Kursen`,
      subtitle: '',
      href: '/payments?tab=offen',
      sortKey: `4:older`,
    });
  }

  items.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  return items;
}

/** Zähler in der Überschrift — ohne Sammelzeile. */
export function todoItemCount(items: TodoItem[]): number {
  return items.filter((item) => item.kind !== 'older_open').length;
}

export function todoEmptyLabel(): string {
  return 'Alles erledigt ✓ — nichts offen.';
}
