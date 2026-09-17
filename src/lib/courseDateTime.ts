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
