import { supabase } from './supabase';

export type StaffName = {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
};

type NameFields = {
  first_name?: string | null;
  last_name?: string | null;
};

/** Anzeigename für Kursleitung; fehlt der Name → „Kursleitung“. */
export function formatStaffName(person: NameFields | null | undefined): string {
  if (!person) return 'Kursleitung';
  const name = `${person.first_name ?? ''} ${person.last_name ?? ''}`.trim();
  return name || 'Kursleitung';
}

/**
 * Löst Staff-Anzeigenamen in einem Aufruf über public.staff_names.
 * Keine Einzelaufrufe je Zeile. Fehler → leere Map (Anzeige fällt auf „Kursleitung“).
 */
export async function resolveStaffNames(
  ids: readonly (string | null | undefined)[]
): Promise<Map<string, StaffName>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Map();

  const { data, error } = await supabase.rpc('staff_names', { p_ids: unique });
  if (error) {
    console.error('resolveStaffNames: rpc failed', error);
    return new Map();
  }

  const map = new Map<string, StaffName>();
  for (const row of data ?? []) {
    map.set(row.id, {
      id: row.id,
      first_name: row.first_name,
      last_name: row.last_name,
      role: row.role,
    });
  }
  return map;
}

type WithTeacherId = { teacher_id?: string | null };

/**
 * Hängt teacher: { first_name, last_name } an Kurszeilen — ein RPC für alle IDs.
 */
export async function withCourseTeachers<T extends WithTeacherId>(
  courses: T[]
): Promise<(T & { teacher?: { first_name: string; last_name: string } })[]> {
  if (courses.length === 0) return courses as (T & { teacher?: { first_name: string; last_name: string } })[];

  const names = await resolveStaffNames(courses.map((course) => course.teacher_id));
  return courses.map((course) => {
    const staff = course.teacher_id ? names.get(course.teacher_id) : undefined;
    return {
      ...course,
      teacher: staff
        ? { first_name: staff.first_name, last_name: staff.last_name }
        : undefined,
    };
  });
}
