import type { User } from '../types';

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

/** Nur Lehrer ohne Owner/Admin – eingeschränkte Kursliste. */
export function isTeacherOnly(user: User | null | undefined): boolean {
  return user?.role === 'teacher';
}

/** Owner oder Admin – erweiterte Verwaltung (z. B. Status ändern). */
export function isStudioAdmin(user: User | null | undefined): boolean {
  const r = user?.role;
  return r === 'owner' || r === 'admin';
}
