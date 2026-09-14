import type { Course, User } from '../types';

/** Owner, Admin oder Lehrer – Kurshalter-Ansicht / Kursleitung. */
export function isCourseManagerRole(user: User | null | undefined): boolean {
  const r = user?.role;
  return r === 'owner' || r === 'admin' || r === 'teacher';
}

/** Nur Teilnehmer-Rolle (kein Kursmanagement). */
export function isParticipantOnlyRole(user: User | null | undefined): boolean {
  return user?.role === 'user';
}

/** Teilnehmer oder Lehrer – Selbstanmeldung in fremden Kursen. */
export function canSelfEnrollInCourses(user: User | null | undefined): boolean {
  const r = user?.role;
  return r === 'user' || r === 'teacher';
}

/** Gleiche Bedingung wie canAct in Courses.tsx: aktiv, Selbstanmeldung, nicht eigene Kursleitung. */
export function canSelfEnrollInCourse(
  course: Pick<Course, 'status' | 'teacher_id'>,
  userProfile: User | null | undefined
): boolean {
  return (
    course.status === 'active' &&
    canSelfEnrollInCourses(userProfile) &&
    course.teacher_id !== userProfile?.id
  );
}

/** Nur Lehrer ohne Owner/Admin – eingeschränkte Kursliste. */
export function isTeacherOnly(user: User | null | undefined): boolean {
  return user?.role === 'teacher';
}

/** Owner oder Admin – erweiterte Verwaltung (z. B. Status ändern). */
export function isStudioAdmin(user: User | null | undefined): boolean {
  const r = user?.role;
  return r === 'owner' || r === 'admin';
}
