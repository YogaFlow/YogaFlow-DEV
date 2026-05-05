type CourseLike = {
  date?: string | null;
  time?: string | null;
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
