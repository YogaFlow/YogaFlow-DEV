import { Course } from '../types';

export type CourseDayGroup = {
  date: string;
  courses: Course[];
};

/** Gruppiert nach `course.date` und behält die Eingabereihenfolge bei.
 *  Kein Date-Parsing: `course.date` ist ein String und bleibt einer. */
export function groupCoursesByDay(courses: Course[]): CourseDayGroup[] {
  const groups = new Map<string, Course[]>();
  for (const course of courses) {
    const existing = groups.get(course.date);
    if (existing) {
      existing.push(course);
    } else {
      groups.set(course.date, [course]);
    }
  }
  return Array.from(groups, ([date, grouped]) => ({ date, courses: grouped }));
}
