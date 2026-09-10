import { Course } from '../types';

export type ParticipantCourseGroup<T> = {
  courseId: string;
  course: Course;
  participants: T[];
};

/** Gruppiert Anmeldungen nach Kurs.
 *  Gruppen chronologisch nach `course.date`, dann `course.time`.
 *  Kein Date-Parsing: beide Werte sind Strings und werden als Strings
 *  verglichen — "2026-09-16" und "14:15:00" sortieren als Text korrekt.
 *  Der Textvergleich der Uhrzeit setzt voraus, dass `time` nullgepolstert
 *  ankommt ("09:00:00", nicht "9:00:00") — so liefert PostgreSQL
 *  `time without time zone`. */
export function groupParticipantsByCourse<
  T extends {
    course_id: string;
    course: Course;
    is_waitlist?: boolean;
    waitlist_position?: number | null;
  }
>(participants: T[]): ParticipantCourseGroup<T>[] {
  const groups = new Map<string, { course: Course; participants: T[] }>();

  for (const participant of participants) {
    const existing = groups.get(participant.course_id);
    if (existing) {
      existing.participants.push(participant);
    } else {
      groups.set(participant.course_id, {
        course: participant.course,
        participants: [participant],
      });
    }
  }

  const result: ParticipantCourseGroup<T>[] = [];
  for (const [courseId, grouped] of groups) {
    const regular: T[] = [];
    const waitlist: T[] = [];
    for (const participant of grouped.participants) {
      if (participant.is_waitlist) {
        waitlist.push(participant);
      } else {
        regular.push(participant);
      }
    }
    waitlist.sort((a, b) => {
      const aPos = a.waitlist_position ?? Number.POSITIVE_INFINITY;
      const bPos = b.waitlist_position ?? Number.POSITIVE_INFINITY;
      if (aPos < bPos) return -1;
      if (aPos > bPos) return 1;
      return 0;
    });
    result.push({
      courseId,
      course: grouped.course,
      participants: regular.concat(waitlist),
    });
  }

  result.sort((a, b) => {
    if (a.course.date !== b.course.date) {
      return a.course.date < b.course.date ? -1 : 1;
    }
    if (a.course.time !== b.course.time) {
      return a.course.time < b.course.time ? -1 : 1;
    }
    return 0;
  });

  return result;
}
