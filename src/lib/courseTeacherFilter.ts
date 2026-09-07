import { Course } from '../types';

export type CourseTeacherOption = {
  id: string;
  first_name: string;
  last_name: string;
};

export function formatTeacherName(teacher: CourseTeacherOption): string {
  const name = `${teacher.first_name} ${teacher.last_name}`.trim();
  return name || 'Unbekannt';
}

export function uniqueTeachersFromCourses(courses: Course[]): CourseTeacherOption[] {
  const byId = new Map<string, CourseTeacherOption>();

  for (const course of courses) {
    if (!course.teacher_id || byId.has(course.teacher_id)) {
      continue;
    }

    byId.set(course.teacher_id, {
      id: course.teacher_id,
      first_name: course.teacher?.first_name ?? '',
      last_name: course.teacher?.last_name ?? '',
    });
  }

  return [...byId.values()].sort((a, b) => {
    const lastCmp = a.last_name.localeCompare(b.last_name, 'de');
    if (lastCmp !== 0) return lastCmp;
    return a.first_name.localeCompare(b.first_name, 'de');
  });
}

export function matchesCourseTeacherFilter(
  teacherId: string | undefined,
  selectedTeacherId: string | null
): boolean {
  if (!selectedTeacherId) return true;
  return teacherId === selectedTeacherId;
}
