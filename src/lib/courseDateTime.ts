type CourseLike = {
  date?: string | null;
  time?: string | null;
  end_time?: string | null;
  status?: string | null;
};

const toCourseStart = (course: CourseLike): Date | null => {
  if (!course.date) return null;

  const [year, month, day] = course.date.split('-').map(Number);
  if (!year || !month || !day) return null;

  let hours = 0;
  let minutes = 0;
  if (course.time) {
    const [h, m] = course.time.split(':').map(Number);
    hours = Number.isFinite(h) ? h : 0;
    minutes = Number.isFinite(m) ? m : 0;
  }

  return new Date(year, month - 1, day, hours, minutes, 0, 0);
};

export const isCourseInPast = (course: CourseLike, now = new Date()): boolean => {
  const start = toCourseStart(course);
  if (!start) return false;
  return start.getTime() < now.getTime();
};

export const isCourseUpcoming = (course: CourseLike, now = new Date()): boolean => {
  return !isCourseInPast(course, now);
};

/** Termine einer Serie, die noch nicht begonnen haben (`isCourseUpcoming`). */
export function futureSeriesCourses<T extends CourseLike>(
  courses: readonly T[],
  now = new Date(),
): T[] {
  return courses.filter((course) => isCourseUpcoming(course, now));
}

/**
 * A5: Welche Felder bei Einzelbearbeitung eines begonnenen Kurses gesperrt sind.
 * Lehrerin: nur Owner/Admin dürfen ändern (Hint separat in der UI).
 */
export type PastCourseEditLocks = {
  /** Kurs hat begonnen (`!isCourseUpcoming`). */
  begun: boolean;
  /** Preis, Datum, Uhrzeit, Ende/Dauer, pass_eligible, Kapazität. */
  scheduleAndMoneyLocked: boolean;
  /** Lehrerin-Feld für die aktuelle Rolle gesperrt. */
  teacherLocked: boolean;
};

export function pastCourseEditLocks(
  course: CourseLike | null | undefined,
  options: { isManager: boolean },
  now = new Date(),
): PastCourseEditLocks {
  const begun = course != null && !isCourseUpcoming(course, now);
  return {
    begun,
    scheduleAndMoneyLocked: begun,
    teacherLocked: begun ? !options.isManager : false,
  };
}

/** Heute als YYYY-MM-DD in Europe/Berlin. Offset in Kalendertagen, ohne courses.date zu parsen. */
export function berlinIsoDate(dayOffset = 0, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const shifted = new Date(read('year'), read('month') - 1, read('day') + dayOffset);
  const year = shifted.getFullYear();
  const month = String(shifted.getMonth() + 1).padStart(2, '0');
  const day = String(shifted.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Reines Kalenderdatum YYYY-MM-DD aus Eingabe oder API-Wert.
 * Nie über Date/UTC — nur das Präfix YYYY-MM-DD, falls vorhanden.
 */
export function asCivilIsoDate(value: string | null | undefined): string {
  if (value == null || value === '') return '';
  const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '';
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return '';
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/**
 * Kalendertag in Europe/Berlin für einen Zeitpunkt (timestamptz).
 * Bare YYYY-MM-DD bleibt unverändert — `new Date('YYYY-MM-DD')` wäre UTC und verschiebt.
 */
export function berlinIsoFromInstant(value: string | Date | null | undefined): string {
  if (value == null || value === '') return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return asCivilIsoDate(trimmed);
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Hält ein Kalenderdatum in [min, max], jeweils YYYY-MM-DD oder null. */
export function clampCivilIsoDate(
  value: string,
  min: string | null | undefined,
  max: string | null | undefined,
): string {
  const civil = asCivilIsoDate(value);
  if (!civil) return '';
  const lo = min ? asCivilIsoDate(min) : '';
  const hi = max ? asCivilIsoDate(max) : '';
  if (lo && civil < lo) return lo;
  if (hi && civil > hi) return hi;
  return civil;
}

/**
 * Teilnehmerliste: Kursdatum heute oder später in Europe/Berlin.
 * Eine Stunde, die heute schon begonnen hat, bleibt bis Tagesende sichtbar.
 * isCourseUpcoming (Beginn, andere Listen) bleibt unverändert.
 */
export const isCourseVisibleThroughBerlinToday = (
  course: CourseLike,
  now = new Date()
): boolean => {
  if (!course.date) return false;
  return course.date >= berlinIsoDate(0, now);
};

const timeToMinutes = (value?: string | null): number | null => {
  if (value == null || value === '') return null;
  const [h, m] = value.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
};

/** Minutes from time → end_time. Null when end_time is missing or not after time. Ignores `duration`. */
export const courseDurationMinutes = (course: CourseLike): number | null => {
  const startMinutes = timeToMinutes(course.time);
  const endMinutes = timeToMinutes(course.end_time);
  if (startMinutes == null || endMinutes == null) return null;
  const minutes = endMinutes - startMinutes;
  return minutes > 0 ? minutes : null;
};

const toCourseEnd = (course: CourseLike): Date | null => {
  const start = toCourseStart(course);
  if (!start || !course.date) return null;

  const startMinutes = timeToMinutes(course.time) ?? 0;
  const endMinutes = timeToMinutes(course.end_time);
  const endMissingOrNotAfterStart = endMinutes == null || endMinutes <= startMinutes;
  if (endMissingOrNotAfterStart) return start;

  const [year, month, day] = course.date.split('-').map(Number);
  if (!year || !month || !day) return null;
  const hours = Math.floor(endMinutes / 60);
  const minutes = endMinutes % 60;
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
};

/** True once now is at or after the course end. Missing/invalid end_time → end equals start. */
export const hasCourseEnded = (course: CourseLike, now = new Date()): boolean => {
  const end = toCourseEnd(course);
  if (!end) return false;
  return end.getTime() <= now.getTime();
};

/** True while start <= now < end. Never true when end equals start. */
export const isCourseRunning = (course: CourseLike, now = new Date()): boolean => {
  const start = toCourseStart(course);
  const end = toCourseEnd(course);
  if (!start || !end) return false;
  const t = now.getTime();
  return start.getTime() <= t && t < end.getTime();
};

/** Same gate as register_for_course: lower(trim(coalesce(status,'active'))) in canceled/cancelled/not_planned. */
export const isCourseCancelled = (status: string | null | undefined): boolean => {
  const normalized = (status ?? 'active').trim().toLowerCase();
  return (
    normalized === 'canceled' ||
    normalized === 'cancelled' ||
    normalized === 'not_planned'
  );
};

type RegistrationLike = {
  course?: CourseLike | null;
};

export const isRegistrationVisible = (
  registration: RegistrationLike,
  now = new Date()
): boolean => {
  if (!registration.course) return false;
  if (isCourseCancelled(registration.course.status)) return false;
  return !hasCourseEnded(registration.course, now);
};
