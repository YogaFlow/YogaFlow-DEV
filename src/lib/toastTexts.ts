/** Konkrete Toast-Zeilen (ZW-1 N2). */
import { formatShortWeekday, formatTime } from './format.ts';

export function enrolledToastLine(course: {
  title: string;
  date: string;
  time: string;
}): string {
  const title = course.title.trim() || 'Kurs';
  const weekday = formatShortWeekday(course.date);
  const time = formatTime(course.time);
  const when = [weekday, time].filter(Boolean).join(' ');
  return when ? `Du bist dabei · ${title}, ${when}` : `Du bist dabei · ${title}`;
}

export function staffUnregisteredToastLine(
  firstName?: string | null,
  lastName?: string | null,
): string {
  const name = [firstName?.trim(), lastName?.trim()].filter(Boolean).join(' ');
  return name ? `${name} abgemeldet` : 'Teilnehmer abgemeldet';
}
